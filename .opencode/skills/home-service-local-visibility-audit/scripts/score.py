#!/usr/bin/env python3
"""Score a Public Mode Local Visibility Scorecard audit deterministically.

The scorer validates the audit, verifies the locked query universe hash, checks
the validity gates, removes N/A checks from the denominator, normalizes category
weights to 100, applies the single deterministic hard cap, and separates the
public score from owner-data questions.

Usage:
  python3 score.py --input audit.filled.json --out scores.json --strict
  python3 score.py --input audit.filled.json --markdown scorecard.md
  python3 score.py --help

Owner-data questions never change the public score.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

SCORER_VERSION = "1.0.0"
DEFAULT_RUBRIC = Path(__file__).resolve().parent.parent / "references" / "rubric.json"
EVIDENCE_STATES = {"verified", "strong_signal", "owner_data_required", "not_applicable"}
SCORED_CONFIDENCE = {"verified", "strong_signal"}
PRIORITY = {"critical": 0, "high": 1, "medium": 2, "low": 3}
FORBIDDEN_KEYS = re.compile(
    r"^(?:api[_-]?key|apikey|authorization|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|cookie|set-cookie|dataforseo_login|dataforseo_password|dataforseo_basic_auth)$",
    re.I,
)
SECRET_VALUE = re.compile(
    r"(?:AIza[0-9A-Za-z_-]{30,}|GOCSPX-[0-9A-Za-z_-]{20,}|-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----|"
    r"\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,})\b|"
    r"Authorization\s*:\s*(?:Bearer|Basic)\s+\S{12,}|"
    r"\bBasic\s+[A-Za-z0-9+/=]{20,})"
)
SURFACES = {"google_local_pack", "google_maps", "google_local_finder", "google_organic", "google_ai_mode", "chatgpt"}
AI_SOURCE_TYPES = {"consumer_surface", "model_api"}
SOURCE_METHODS = {"fixture", "live", "derived"}
LOCATION_METHODS = {"coordinate", "location_code", "not_applicable"}
SOURCE_FAMILIES = {"serp", "ai_optimization", "dataforseo_labs", "backlinks", "business_data", "local"}
SOURCE_SURFACES = {
    "query_universe",
    "google_local_pack",
    "google_maps",
    "google_local_finder",
    "google_organic",
    "google_ai_mode",
    "google_keyword_data",
    "chatgpt",
    "backlinks",
    "business_listings",
}


def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def is_number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def round_to(value: float, places: int) -> float:
    quantum = Decimal("1." + "0" * places) if places else Decimal("1")
    return float(Decimal(str(value)).quantize(quantum, rounding=ROUND_HALF_UP))


def _canonical_value(value):
    if isinstance(value, dict):
        return {key: _canonical_value(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [_canonical_value(entry) for entry in value]
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def canonical_json(value) -> str:
    """Match the JavaScript canonicalJson used by universe.mjs."""
    return json.dumps(_canonical_value(value), ensure_ascii=False, separators=(",", ":"))


def hash_universe(universe: dict) -> str:
    payload = {
        "schema_version": universe.get("schema_version"),
        "universe_id": universe.get("universe_id"),
        "universe_version": universe.get("universe_version"),
        "trade": universe.get("trade"),
        "market": universe.get("market"),
        "language": universe.get("language"),
        "device": universe.get("device"),
        "generation_method": universe.get("generation_method"),
        "services": universe.get("services"),
        "intents": universe.get("intents"),
        "queries": universe.get("queries"),
        "prompts": universe.get("prompts"),
        "demand_model": universe.get("demand_model"),
        "quality_gates": universe.get("quality_gates"),
    }
    return "sha256:" + hashlib.sha256(canonical_json(payload).encode("utf-8")).hexdigest()


def applicability(item: dict, config: dict) -> tuple[bool, str]:
    if item.get("applicability") == "conditional":
        condition = item.get("condition")
        if not condition:
            return False, "conditional check has no condition"
        if not bool(config.get(condition, False)):
            return False, f"condition not enabled: {condition}"
    return True, ""


def scan_forbidden(value, pointer: str = "$", errors: list[str] | None = None) -> list[str]:
    errors = errors if errors is not None else []
    if isinstance(value, dict):
        for key, entry in value.items():
            if FORBIDDEN_KEYS.match(str(key)):
                errors.append(f"{pointer}.{key}: forbidden credential-like field")
            scan_forbidden(entry, f"{pointer}.{key}", errors)
    elif isinstance(value, list):
        for index, entry in enumerate(value):
            scan_forbidden(entry, f"{pointer}[{index}]", errors)
    elif isinstance(value, str) and SECRET_VALUE.search(value):
        errors.append(f"{pointer}: credential-like string (value redacted)")
    return errors


def _require(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def _is_bool(value) -> bool:
    return isinstance(value, bool)


def _validate_source(source: dict, index: int, errors: list[str], source_ids: set[str]) -> None:
    prefix = f"sources[{index}]"
    if not isinstance(source, dict):
        errors.append(f"{prefix} must be an object")
        return
    sid = source.get("id")
    if not isinstance(sid, str) or not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", sid):
        errors.append(f"{prefix}.id is invalid")
    elif sid in source_ids:
        errors.append(f"{prefix}.id is duplicated")
    else:
        source_ids.add(sid)
    for key in [
        "provider",
        "type",
        "method",
        "endpoint_family",
        "surface",
        "collected_at",
        "collector_version",
        "location_method",
        "language",
        "device",
    ]:
        if value_missing(source.get(key)):
            errors.append(f"{prefix}.{key} is required")
    if source.get("device") not in {"desktop", "mobile"}:
        errors.append(f"{prefix}.device must be desktop or mobile")
    if source.get("method") not in SOURCE_METHODS:
        errors.append(f"{prefix}.method must be one of {sorted(SOURCE_METHODS)}")
    if source.get("location_method") not in LOCATION_METHODS:
        errors.append(f"{prefix}.location_method must be one of {sorted(LOCATION_METHODS)}")
    if source.get("endpoint_family") not in SOURCE_FAMILIES:
        errors.append(f"{prefix}.endpoint_family must be one of {sorted(SOURCE_FAMILIES)}")
    if source.get("surface") not in SOURCE_SURFACES:
        errors.append(f"{prefix}.surface must be a documented source surface")
    completeness = source.get("field_completeness")
    if not is_number(completeness) or not 0 <= completeness <= 100:
        errors.append(f"{prefix}.field_completeness must be 0-100")


def value_missing(value) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


def _validate_query_universe(audit: dict, errors: list[str], insufficient: list[str]) -> set[str]:
    universe = audit.get("query_universe")
    if not isinstance(universe, dict):
        errors.append("query_universe must be an object")
        return set()
    if universe.get("schema_version") != "1.0":
        errors.append("query_universe.schema_version must be 1.0")
    if universe.get("locked") is not True:
        insufficient.append("query universe is not locked")
    computed = hash_universe(universe)
    if universe.get("hash") != computed:
        errors.append("query_universe.hash does not match the universe content")
    if audit.get("run", {}).get("query_universe_hash") != universe.get("hash"):
        errors.append("run.query_universe_hash does not match query_universe.hash")
    market = audit.get("market") or {}
    config = audit.get("configuration") or {}
    if universe.get("trade") != config.get("trade"):
        errors.append("query_universe.trade does not match configuration.trade")
    if universe.get("market", {}).get("name") != market.get("name"):
        errors.append("query_universe.market.name does not match market.name")
    if universe.get("language") != market.get("language"):
        errors.append("query_universe.language does not match market.language")
    if universe.get("device") != market.get("device"):
        errors.append("query_universe.device does not match market.device")
    for key in ["services", "intents", "queries", "prompts"]:
        if not isinstance(universe.get(key), list) or not universe[key]:
            errors.append(f"query_universe.{key} must be a non-empty array")
    services = universe.get("services") or []
    service_ids = set()
    for service in services:
        if not isinstance(service, dict) or not service.get("id"):
            errors.append("query_universe.services entries need an id and label")
            continue
        service_ids.add(service["id"])
    core_queries = [
        query
        for query in universe.get("queries") or []
        if query.get("role") == "core" and query.get("brand") == "non_brand"
    ]
    if len(core_queries) < 12:
        errors.append(f"query universe has {len(core_queries)} core non-branded queries; at least 12 are required")
    if len(core_queries) > int(config.get("max_queries") or 0):
        errors.append("query universe core query count exceeds configuration.max_queries")
    for query in universe.get("queries") or []:
        if query.get("service_id") not in service_ids:
            errors.append(f"query {query.get('id')}: unknown service_id")
        if query.get("role") not in {"core", "diagnostic"}:
            errors.append(f"query {query.get('id')}: role must be core or diagnostic")
        if query.get("brand") not in {"brand", "non_brand"}:
            errors.append(f"query {query.get('id')}: brand must be brand or non_brand")
        if query.get("role") == "core" and query.get("brand") != "non_brand":
            errors.append(f"query {query.get('id')}: a core query must be non-branded")
        if not isinstance(query.get("grid"), bool):
            errors.append(f"query {query.get('id')}: grid must be a boolean")
    for intent in universe.get("intents") or []:
        if intent.get("service_id") not in service_ids:
            errors.append(f"intent {intent.get('id')}: unknown service_id")
        if not is_number(intent.get("weight")) or not 0 <= intent["weight"] <= 1:
            errors.append(f"intent {intent.get('id')}: weight must be 0-1")
    total_weight = sum(
        float(intent.get("weight") or 0)
        for intent in universe.get("intents") or []
        if intent.get("core") is True and intent.get("brand") == "non_brand"
    )
    if abs(total_weight - 1.0) > 0.02:
        errors.append(f"core intent weights sum to {total_weight:.4f}; expected 1.0 (+/-0.02)")
    return {query.get("intent_id") for query in core_queries}


def _validate_validity(audit: dict, rubric: dict, errors: list[str], insufficient: list[str]) -> None:
    validity = audit.get("validity") or {}
    rate = validity.get("provider_error_rate")
    if not is_number(rate) or not 0 <= rate <= 1:
        errors.append("validity.provider_error_rate must be 0-1")
    if rate is not None and rate > 0.10:
        insufficient.append(f"provider error rate {rate:.2f} exceeds 0.10")
    if validity.get("critical_source_outage") is True:
        insufficient.append("a required core source is in critical outage")
    for key in ["planned", "collected"]:
        block = validity.get(key)
        if not isinstance(block, dict):
            errors.append(f"validity.{key} must be an object")
            continue
        for field in ["core_queries", "maps_observations", "organic_observations", "ai_prompt_runs"]:
            if not isinstance(block.get(field), int) or isinstance(block.get(field), bool) or block[field] < 0:
                errors.append(f"validity.{key}.{field} must be a non-negative integer")
    gates = validity.get("gates")
    expected_gate_ids = {gate["id"] for gate in rubric.get("validityGates", [])}
    if not isinstance(gates, list) or not gates:
        insufficient.append("validity gates are missing")
        return
    provided = {}
    for gate in gates:
        if not isinstance(gate, dict) or not gate.get("id"):
            errors.append("validity.gates entries need an id, label, and passed flag")
            continue
        provided[gate["id"]] = bool(gate.get("passed"))
    missing = expected_gate_ids - set(provided)
    if missing:
        insufficient.append(f"validity gates missing: {', '.join(sorted(missing))}")
    failed = [gate_id for gate_id, passed in provided.items() if not passed]
    if failed:
        insufficient.append(f"validity gates failed: {', '.join(sorted(failed))}")
    metrics = audit.get("metrics") or {}
    counts = metrics.get("counts") or {}
    if counts:
        if counts.get("planned") != validity.get("planned"):
            errors.append("validity.planned does not match metrics.counts.planned")
        if counts.get("collected") != validity.get("collected"):
            errors.append("validity.collected does not match metrics.counts.collected")


def _validate_observations(audit: dict, errors: list[str]) -> None:
    maps = audit.get("maps") or {}
    if not isinstance(maps.get("grid"), dict):
        errors.append("maps.grid is required")
    surfaces = maps.get("surfaces")
    if not isinstance(surfaces, list) or not surfaces or any(surface not in SURFACES for surface in surfaces):
        errors.append("maps.surfaces is invalid")
    for index, observation in enumerate(maps.get("observations") or []):
        prefix = f"maps.observations[{index}]"
        if not isinstance(observation, dict):
            errors.append(f"{prefix} must be an object")
            continue
        if observation.get("surface") not in {"google_local_pack", "google_maps", "google_local_finder"}:
            errors.append(f"{prefix}.surface is invalid")
        if not is_number(observation.get("lat")) or not is_number(observation.get("lng")):
            errors.append(f"{prefix} needs numeric coordinates")
        rank = observation.get("rank")
        if rank is not None and (not isinstance(rank, int) or isinstance(rank, bool) or not 1 <= rank <= 100):
            errors.append(f"{prefix}.rank must be null or 1-100")
        if not isinstance(observation.get("target_found"), bool):
            errors.append(f"{prefix}.target_found must be a boolean")
        if observation.get("not_collected") is True:
            continue
        if observation.get("target_found") and rank is None:
            errors.append(f"{prefix}: target_found requires a rank")
        if observation.get("target_found") and not observation.get("target_match"):
            errors.append(f"{prefix}: target_found requires a target_match")
    organic = audit.get("organic") or {}
    for index, observation in enumerate(organic.get("observations") or []):
        prefix = f"organic.observations[{index}]"
        rank = observation.get("rank")
        if rank is not None and (not isinstance(rank, int) or isinstance(rank, bool) or not 1 <= rank <= 100):
            errors.append(f"{prefix}.rank must be null or 1-100")
        if not isinstance(observation.get("target_found"), bool):
            errors.append(f"{prefix}.target_found must be a boolean")
        if observation.get("not_collected") is True:
            continue
        if observation.get("target_found") and rank is None:
            errors.append(f"{prefix}: target_found requires a rank")
    ai = audit.get("ai") or {}
    surfaces = ai.get("surfaces") or []
    if not isinstance(surfaces, list) or not surfaces:
        errors.append("ai.surfaces must be a non-empty array")
    for surface in surfaces:
        if not isinstance(surface, dict):
            errors.append("ai.surfaces entries must be objects")
            continue
        if surface.get("source_type") not in AI_SOURCE_TYPES:
            errors.append(f"ai surface {surface.get('id')}: source_type is invalid")
        if not isinstance(surface.get("validated"), bool) or not isinstance(surface.get("available"), bool):
            errors.append(f"ai surface {surface.get('id')}: validated and available must be booleans")
    for index, observation in enumerate(ai.get("observations") or []):
        prefix = f"ai.observations[{index}]"
        if observation.get("source_type") not in AI_SOURCE_TYPES:
            errors.append(f"{prefix}.source_type is invalid")
        for field in ["target_mentioned", "target_recommended", "target_cited"]:
            if not isinstance(observation.get(field), bool):
                errors.append(f"{prefix}.{field} must be a boolean")
        if not isinstance(observation.get("repeat"), int) or isinstance(observation.get("repeat"), bool) or observation["repeat"] < 1:
            errors.append(f"{prefix}.repeat must be a positive integer")
        if observation.get("target_entity_accuracy") not in {"accurate", "minor_error", "incorrect", "not_present"}:
            errors.append(f"{prefix}.target_entity_accuracy is invalid")
        if not isinstance(observation.get("cited_domains"), list):
            errors.append(f"{prefix}.cited_domains must be an array")


def _validate_competitors(audit: dict, errors: list[str], insufficient: list[str]) -> None:
    competitors = audit.get("competitors") or {}
    if not competitors.get("locked"):
        insufficient.append("competitor cohort is not locked")
    business = competitors.get("business")
    if not isinstance(business, list) or len(business) < 2:
        insufficient.append("at least two business competitors must be in the locked cohort")
    for index, competitor in enumerate(business or []):
        if not isinstance(competitor, dict) or not competitor.get("id") or not competitor.get("name"):
            errors.append(f"competitors.business[{index}] needs id and name")
    for key in ["serp_occupiers", "ai"]:
        if not isinstance(competitors.get(key), list):
            errors.append(f"competitors.{key} must be an array")


def _validate_authority(audit: dict, errors: list[str], insufficient: list[str]) -> None:
    authority = audit.get("authority") or {}
    referring = authority.get("referring_domains")
    listings = authority.get("listings")
    if not isinstance(referring, list):
        errors.append("authority.referring_domains must be an array")
    if not isinstance(listings, list):
        errors.append("authority.listings must be an array")
    if not (referring or listings):
        insufficient.append("no authority data is present")
    for index, domain in enumerate(referring or []):
        if domain.get("type") not in {"local", "industry", "manufacturer", "directory", "association", "publisher", "other"}:
            errors.append(f"authority.referring_domains[{index}].type is invalid")
        if domain.get("relevance") not in {"high", "medium", "low", "irrelevant"}:
            errors.append(f"authority.referring_domains[{index}].relevance is invalid")


def _validate_metrics(audit: dict, rubric: dict, errors: list[str]) -> None:
    metrics = audit.get("metrics")
    if not isinstance(metrics, dict):
        errors.append("metrics must be an object")
        return
    for key in ["by_surface", "by_intent", "by_service", "coverage", "competitive", "authority", "resilience", "ai", "visibility_matrix"]:
        if key not in metrics:
            errors.append(f"metrics.{key} is required")
    matrix = metrics.get("visibility_matrix")
    services = (audit.get("query_universe") or {}).get("services") or []
    if isinstance(matrix, list) and len(matrix) != len(services):
        errors.append("metrics.visibility_matrix must have one row per service")
    if isinstance(matrix, list):
        for index, row in enumerate(matrix):
            if row.get("maps") not in {"Strong", "Partial", "Weak", "Absent", "N/A"}:
                errors.append(f"metrics.visibility_matrix[{index}].maps is invalid")
            if row.get("opportunity") not in {"Maintain", "Improve", "High", "Critical", "N/A"}:
                errors.append(f"metrics.visibility_matrix[{index}].opportunity is invalid")
    coverage = metrics.get("coverage") or {}
    for key in ["demand_weighted_coverage", "service_cluster_coverage", "non_branded_discovery_present"]:
        if key not in coverage:
            errors.append(f"metrics.coverage.{key} is required")
    for key in ["demand_weighted_coverage", "service_cluster_coverage"]:
        value = coverage.get(key)
        if value is not None and (not is_number(value) or not 0 <= value <= 1):
            errors.append(f"metrics.coverage.{key} must be 0-1 or null")


def _validate_facts(audit: dict, rubric: dict, errors: list[str], insufficient: list[str]) -> None:
    facts = audit.get("facts") or {}
    expected = {entry["key"] for entry in rubric.get("facts", [])}
    if set(facts) != expected:
        errors.append(f"facts keys must be exactly {sorted(expected)}")
        return
    for key, value in facts.items():
        if not isinstance(value, bool):
            errors.append(f"facts.{key} must be a boolean")
    resolution = (audit.get("business") or {}).get("resolution") or {}
    metrics = audit.get("metrics") or {}
    coverage = metrics.get("coverage") or {}
    if facts.get("target_resolved") != bool(resolution.get("resolved")):
        errors.append("facts.target_resolved conflicts with business.resolution.resolved")
    if facts.get("query_universe_locked") != bool((audit.get("query_universe") or {}).get("locked")):
        errors.append("facts.query_universe_locked conflicts with query_universe.locked")
    if facts.get("non_branded_discovery_present") != bool(coverage.get("non_branded_discovery_present")):
        errors.append("facts.non_branded_discovery_present conflicts with metrics")
    if facts.get("maps_observations_present") != bool((audit.get("maps") or {}).get("observations")):
        errors.append("facts.maps_observations_present conflicts with maps.observations")
    if facts.get("organic_observations_present") != bool((audit.get("organic") or {}).get("observations")):
        errors.append("facts.organic_observations_present conflicts with organic.observations")
    if facts.get("ai_observations_present") != bool((audit.get("ai") or {}).get("observations")):
        errors.append("facts.ai_observations_present conflicts with ai.observations")
    if facts.get("ai_surfaces_validated") != any(
        surface.get("validated") is True and surface.get("available") is True
        for surface in (audit.get("ai") or {}).get("surfaces", [])
    ):
        errors.append("facts.ai_surfaces_validated conflicts with ai.surfaces")
    if facts.get("competitor_cohort_locked") != bool((audit.get("competitors") or {}).get("locked")):
        errors.append("facts.competitor_cohort_locked conflicts with competitors.locked")
    gates = (audit.get("validity") or {}).get("gates") or []
    gates_passed = all(bool(gate.get("passed")) for gate in gates) and bool(gates)
    if facts.get("sufficient_valid_evidence") != gates_passed:
        errors.append("facts.sufficient_valid_evidence conflicts with validity gates")
    if not facts.get("sufficient_valid_evidence"):
        insufficient.append("sufficient_valid_evidence is false")
    if not facts.get("target_resolved"):
        insufficient.append("target business is not resolved")


def validate(audit: dict, rubric: dict) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    insufficient: list[str] = []
    if not isinstance(audit, dict):
        return ["audit must be a JSON object"], []
    errors.extend(scan_forbidden(audit))
    if audit.get("schema_version") != "1.0":
        errors.append("schema_version must be '1.0' (unknown versions fail safely)")
    if audit.get("audit_mode") != "public":
        errors.append("audit_mode must be 'public'")

    run = audit.get("run") or {}
    for key in ["run_id", "started_at", "collector_version", "rubric_version", "source_mode", "query_universe_hash"]:
        if value_missing(run.get(key)):
            errors.append(f"run.{key} is required")
    if run.get("rubric_version") != rubric.get("version"):
        errors.append(f"run.rubric_version does not match rubric {rubric.get('version')}")
    if run.get("source_mode") not in {"fixture", "live"}:
        errors.append("run.source_mode must be fixture or live")
    if not isinstance(run.get("synthetic"), bool):
        errors.append("run.synthetic must be a boolean")

    business = audit.get("business") or {}
    for key in ["name", "trade", "market", "domain"]:
        if value_missing(business.get(key)):
            errors.append(f"business.{key} is required")
    resolution = business.get("resolution") or {}
    if not isinstance(resolution.get("resolved"), bool):
        errors.append("business.resolution.resolved must be a boolean")
    if not is_number(resolution.get("confidence")) or not 0 <= resolution["confidence"] <= 1:
        errors.append("business.resolution.confidence must be 0-1")
    if resolution.get("resolved") and resolution.get("confidence", 0) < 0.8:
        insufficient.append("target resolution confidence is below 0.80")

    market = audit.get("market") or {}
    for key in ["name", "country", "language", "device", "grid_id", "query_universe_id"]:
        if value_missing(market.get(key)):
            errors.append(f"market.{key} is required")
    if market.get("device") not in {"desktop", "mobile"}:
        errors.append("market.device must be desktop or mobile")
    if not isinstance(market.get("center"), dict) or not is_number(market["center"].get("lat")) or not is_number(market["center"].get("lng")):
        errors.append("market.center must have numeric lat and lng")
    if not is_number(market.get("radius_km")) or market["radius_km"] <= 0:
        errors.append("market.radius_km must be positive")

    config = audit.get("configuration") or {}
    for key in ["trade", "market"]:
        if value_missing(config.get(key)):
            errors.append(f"configuration.{key} is required")
    for key in [
        "emergency_service",
        "near_me_demand",
        "city_modified_demand",
        "local_finder_configured",
        "branded_diagnostics_enabled",
        "historical_runs_available",
    ]:
        if not isinstance(config.get(key), bool):
            errors.append(f"configuration.{key} must be a boolean")
    for key in ["ai_repeats", "grid_size", "max_queries"]:
        if not isinstance(config.get(key), int) or isinstance(config.get(key), bool) or config[key] <= 0:
            errors.append(f"configuration.{key} must be a positive integer")
    if business.get("trade") and config.get("trade") and business.get("trade") != config.get("trade"):
        errors.append("business.trade and configuration.trade must match")
    if business.get("market") and config.get("market") and business.get("market") != config.get("market"):
        errors.append("business.market and configuration.market must match")

    query_intent_ids = _validate_query_universe(audit, errors, insufficient)

    sources = audit.get("sources")
    source_ids: set[str] = set()
    if not isinstance(sources, list) or not sources:
        errors.append("sources must be a non-empty array")
    else:
        for index, source in enumerate(sources):
            _validate_source(source, index, errors, source_ids)
        methods = {source.get("method") for source in sources if isinstance(source, dict)}
        if run.get("source_mode") == "fixture" and methods != {"fixture"}:
            errors.append("fixture runs may only report source method=fixture")
        if run.get("source_mode") == "live" and not methods.issubset({"live", "derived"}):
            errors.append("live runs may only report source method=live or derived")

    _validate_validity(audit, rubric, errors, insufficient)
    _validate_observations(audit, errors)
    _validate_competitors(audit, errors, insufficient)
    _validate_authority(audit, errors, insufficient)
    _validate_metrics(audit, rubric, errors)
    _validate_facts(audit, rubric, errors, insufficient)

    checks = audit.get("checks")
    if not isinstance(checks, dict):
        return errors + ["checks must be an object"], insufficient
    item_ids = {item["id"] for item in rubric["items"]}
    unknown = sorted(set(checks) - item_ids)
    for cid in unknown:
        errors.append(f"{cid}: unknown check id")
    missing = sorted(item_ids - set(checks))
    if missing:
        errors.append(f"missing checks: {', '.join(missing)}")

    for item in rubric["items"]:
        cid = item["id"]
        check = checks.get(cid)
        if check is None:
            continue
        if not isinstance(check, dict):
            errors.append(f"{cid}: check must be an object")
            continue
        applies, reason = applicability(item, config)
        declared = check.get("applicable")
        if not isinstance(declared, bool):
            errors.append(f"{cid}: applicable must be a boolean")
        elif declared != applies:
            errors.append(f"{cid}: applicable={declared} conflicts with configuration ({applies})")
        if check.get("needs_review") is True:
            errors.append(f"{cid}: needs_review must be false in a scored audit")
        if not applies:
            if check.get("score") is not None:
                errors.append(f"{cid}: N/A check must have score=null")
            if check.get("confidence") != "not_applicable":
                errors.append(f"{cid}: N/A confidence must be not_applicable")
            if not check.get("na_reason") and not reason:
                errors.append(f"{cid}: N/A check needs na_reason")
            continue
        score = check.get("score")
        if isinstance(score, bool) or not isinstance(score, int):
            errors.append(f"{cid}: score must be an integer")
            continue
        if score not in item["allowed"] or score > item["max"]:
            errors.append(f"{cid}: score {score} not allowed (allowed: {item['allowed']})")
        evidence = check.get("evidence")
        if not isinstance(evidence, list) or not evidence:
            errors.append(f"{cid}: evidence must be a non-empty array")
        elif any(not isinstance(entry, str) or not entry.strip() for entry in evidence):
            errors.append(f"{cid}: every evidence entry must be a non-empty string")
        refs = check.get("evidence_refs")
        if not isinstance(refs, list) or not refs:
            errors.append(f"{cid}: evidence_refs must be a non-empty array")
        else:
            for ref in refs:
                if ref not in source_ids:
                    errors.append(f"{cid}: evidence_refs contains unknown source {ref}")
        confidence = check.get("confidence")
        if confidence not in SCORED_CONFIDENCE:
            errors.append(f"{cid}: confidence must be verified or strong_signal")
        if item.get("evaluation") == "deterministic" and confidence != "verified":
            errors.append(f"{cid}: a deterministic check must use confidence=verified")
        if item.get("evaluation") == "model_judgment" and confidence not in SCORED_CONFIDENCE:
            errors.append(f"{cid}: a judgment check needs verified or strong_signal")

    limitations = audit.get("limitations")
    if limitations is not None and not isinstance(limitations, list):
        errors.append("limitations must be an array when present")
    review = audit.get("review")
    if review is not None and review.get("status") not in {"pending", "complete"}:
        errors.append("review.status must be pending or complete")
    return errors, insufficient


def cap_clause(clause: dict, facts: dict) -> bool:
    value = facts.get(clause.get("fact"))
    if "equals" in clause:
        return value == clause["equals"]
    if "in" in clause:
        return value in clause["in"]
    return False


def cap_triggered(cap: dict, facts: dict) -> bool:
    return all(cap_clause(clause, facts) for clause in cap.get("trigger", {}).get("all", []))


def band_for(score: int, rubric: dict) -> dict:
    for entry in sorted(rubric["bands"], key=lambda b: b["min"], reverse=True):
        if score >= entry["min"]:
            return entry
    return rubric["bands"][-1]


def compute(audit: dict, rubric: dict) -> dict:
    config = audit["configuration"]
    checks = audit["checks"]
    facts = audit["facts"]
    sources = {source["id"]: source for source in audit["sources"]}
    fixes = {fix["checkId"]: fix for fix in rubric.get("fixes", [])}
    items = rubric["items"]
    metrics = audit["metrics"]

    active_caps = [cap for cap in rubric["caps"] if cap_triggered(cap, facts)]
    category_caps: dict[str, list[dict]] = {}
    for cap in active_caps:
        if cap["scope"] == "category":
            category_caps.setdefault(cap["category"], []).append(cap)

    categories = []
    findings = []
    coverage = []
    checks_out = []
    recoverable = []

    for cat in rubric["categories"]:
        cat_items = [item for item in items if item["cat"] == cat["id"]]
        applicable_max = 0
        earned = 0
        na_items = []
        for item in cat_items:
            applies, reason = applicability(item, config)
            check = checks.get(item["id"]) or {}
            if not applies:
                na_items.append(item["id"])
                coverage.append(coverage_row(item, check, False, reason))
                checks_out.append(check_row(item, check, False, reason))
                continue
            applicable_max += item["max"]
            score = check.get("score") or 0
            earned += score
            lost = item["max"] - score
            fix = fixes.get(item["id"], {})
            if lost > 0:
                recoverable.append(
                    {
                        "id": item["id"],
                        "title": item["title"],
                        "category": item["cat"],
                        "stage": item.get("journeyStage"),
                        "lost": lost,
                        "max": item["max"],
                        "score": score,
                        "severity": item.get("severity"),
                        "priority": fix.get("priority"),
                        "fix": fix.get("fix") or item.get("recommendedIntervention"),
                        "radModules": fix.get("radModules", []),
                        "serviceMapping": item.get("serviceMapping"),
                        "ownerDataRequired": False,
                    }
                )
            findings.append(finding_row(item, check, fix))
            coverage.append(coverage_row(item, check, True, ""))
            checks_out.append(check_row(item, check, True, ""))

        normalized_before = round_to(cat["max"] * earned / applicable_max, 2) if applicable_max else 0.0
        category_cap = min([cap["max"] for cap in category_caps.get(cat["id"], [])], default=None)
        normalized = round_to(min(normalized_before, category_cap), 2) if category_cap is not None else normalized_before
        categories.append(
            {
                "id": cat["id"],
                "name": cat["name"],
                "question": cat.get("question", ""),
                "earned": earned,
                "max": cat["max"],
                "applicable_max": applicable_max,
                "normalized": normalized,
                "normalized_before_cap": normalized_before,
                "category_cap": category_cap,
                "applicable": applicable_max > 0,
                "na_checks": na_items,
                "percent": round_to(100 * earned / applicable_max, 1) if applicable_max else None,
            }
        )

    applicable_weight = sum(cat["max"] for cat in categories if cat["applicable"])
    raw_total = round_to(sum(cat["normalized"] for cat in categories), 2)
    total = round_to(raw_total * 100 / applicable_weight, 1) if applicable_weight else 0.0

    overall_caps = [cap for cap in active_caps if cap["scope"] == "overall"]
    cap = min([entry["max"] for entry in overall_caps], default=100)
    final = round_to(min(total, cap), 1)
    display = int(round_to(final, 0))
    band = band_for(display, rubric)

    caps_out = []
    for cap_entry in rubric["caps"]:
        active = cap_entry in active_caps
        if cap_entry["scope"] == "overall":
            before = total
            after = min(total, cap_entry["max"])
        else:
            category = next(c for c in categories if c["id"] == cap_entry["category"])
            before = category["normalized_before_cap"]
            after = min(before, cap_entry["max"])
        caps_out.append(
            {
                "id": cap_entry["id"],
                "label": cap_entry["label"],
                "scope": cap_entry["scope"],
                "category": cap_entry.get("category"),
                "max": cap_entry["max"],
                "active": active,
                "binding": active and after < before,
                "effect_before": before,
                "effect_after": after,
                "rationale": cap_entry["rationale"],
                "triggered_by": cap_entry.get("checks", []),
            }
        )

    journey = []
    for stage in sorted(rubric.get("journey", []), key=lambda s: s["order"]):
        stage_items = [item for item in items if item["id"] in stage.get("checks", [])]
        applicable = [item for item in stage_items if applicability(item, config)[0]]
        stage_max = sum(item["max"] for item in applicable)
        stage_earned = sum((checks.get(item["id"]) or {}).get("score") or 0 for item in applicable)
        if not applicable:
            status = "owner_data_required" if stage.get("ownerData") else "observed_unscored"
        elif stage.get("ownerData"):
            status = "scored_plus_owner_data"
        else:
            status = stage.get("coverageStatus", "scored")
        journey.append(
            {
                "id": stage["id"],
                "order": stage["order"],
                "label": stage["label"],
                "customerQuestion": stage.get("customerQuestion", ""),
                "status": status,
                "coverageStatus": stage.get("coverageStatus"),
                "checks": [item["id"] for item in applicable],
                "na_checks": [item["id"] for item in stage_items if item not in applicable],
                "ownerData": stage.get("ownerData", []),
                "earned": stage_earned,
                "max": stage_max,
                "percent": round_to(100 * stage_earned / stage_max, 1) if stage_max else None,
            }
        )

    owner_required = []
    for entry in rubric.get("ownerData", []):
        owner_required.append(
            {
                "id": entry["id"],
                "stage": entry.get("journeyStage"),
                "title": entry["title"],
                "confidence": "owner_data_required",
                "publicScoreImpact": "none",
                "whyItMatters": entry.get("whyItMatters", ""),
                "serviceMapping": entry.get("serviceMapping", ""),
                "questions": entry.get("questions", []),
            }
        )

    triggered_modules = {module for finding in recoverable for module in finding.get("radModules", [])}
    opportunities = []
    for opportunity in rubric.get("opportunities", []):
        opportunities.append(
            {
                "id": opportunity["id"],
                "label": opportunity["label"],
                "radModule": opportunity["radModule"],
                "scored": False,
                "recommended": opportunity["radModule"] in triggered_modules,
                "why": opportunity["why"],
                "evidence": opportunity["evidence"],
            }
        )

    meta = {
        "run_id": audit["run"]["run_id"],
        "client": audit["business"]["name"],
        "trade": audit["business"]["trade"],
        "market": audit["business"]["market"],
        "audit_mode": "public",
        "synthetic": audit["run"]["synthetic"],
        "rubric_version": rubric["version"],
        "collector_version": audit["run"]["collector_version"],
        "started_at": audit["run"].get("started_at", ""),
        "source_mode": audit["run"].get("source_mode"),
        "place_id": audit["business"].get("place_id", ""),
        "domain": audit["business"].get("domain", ""),
        "query_universe_hash": audit["run"]["query_universe_hash"],
    }

    verified = [finding for finding in findings if finding["confidence"] == "verified" and finding["lost"] > 0]
    strong = [finding for finding in findings if finding["confidence"] == "strong_signal" and finding["lost"] > 0]
    recommendations = sorted(
        recoverable,
        key=lambda row: (PRIORITY.get(row.get("priority"), 9), -row["lost"], row["id"]),
    )

    return {
        "schema_version": "1.0",
        "framework": "local-discovery",
        "audit_mode": "public",
        "rubric_version": rubric["version"],
        "rubric_title": rubric.get("title", "Local Visibility Scorecard"),
        "scorer_version": SCORER_VERSION,
        "meta": meta,
        "query_universe_hash": audit["run"]["query_universe_hash"],
        "sources": [
            {
                "id": entry.get("id"),
                "provider": entry.get("provider"),
                "type": entry.get("type"),
                "method": entry.get("method"),
                "endpoint_family": entry.get("endpoint_family"),
                "surface": entry.get("surface"),
                "collected_at": entry.get("collected_at"),
                "collector_version": entry.get("collector_version"),
                "field_completeness": entry.get("field_completeness"),
                "endpoint": entry.get("endpoint", ""),
                "location_method": entry.get("location_method"),
                "language": entry.get("language"),
                "device": entry.get("device"),
            }
            for entry in audit["sources"]
        ],
        "categories": categories,
        "checks": checks_out,
        "findings": sorted(findings, key=lambda row: (PRIORITY.get(row.get("priority"), 9), -row["lost"], row["id"])),
        "verifiedFindings": sorted(verified, key=lambda row: (-row["lost"], row["id"])),
        "strongSignals": sorted(strong, key=lambda row: (-row["lost"], row["id"])),
        "recommendations": recommendations,
        "ownerDataRequired": owner_required,
        "journey": journey,
        "coverage": coverage,
        "opportunities": opportunities,
        "metrics": metrics,
        "visibilityMatrix": metrics.get("visibility_matrix", []),
        "validity": {
            "passed": True,
            "gates": (audit.get("validity") or {}).get("gates", []),
        },
        "normalization": {
            "method": "applicability_aware_category_normalization_with_caps",
            "applicable_weight": applicable_weight,
            "raw_total": raw_total,
            "na_checks": [row["id"] for row in coverage if not row["applicable"]],
            "category_caps": [
                {"category": category, "cap": min(entry["max"] for entry in entries)}
                for category, entries in sorted(category_caps.items())
            ],
            "query_universe_hash": audit["run"]["query_universe_hash"],
        },
        "caps": caps_out,
        "total": total,
        "total_max": 100,
        "final": final,
        "display": display,
        "band": band["band"],
        "band_label": band["label"],
        "cap": cap,
        "cap_active": bool(active_caps),
        "cap_binding": final < total,
        "cap_applied": bool(active_caps),
        "status": "scored",
    }


def finding_row(item: dict, check: dict, fix: dict) -> dict:
    score = check.get("score") or 0
    return {
        "id": item["id"],
        "title": item["title"],
        "category": item["cat"],
        "stage": item.get("journeyStage"),
        "score": score,
        "max": item["max"],
        "lost": item["max"] - score,
        "severity": item.get("severity"),
        "priority": fix.get("priority"),
        "confidence": check.get("confidence"),
        "evaluation": item.get("evaluation"),
        "evidence": check.get("evidence") or [],
        "evidence_refs": check.get("evidence_refs") or [],
        "recommendedIntervention": item.get("recommendedIntervention"),
        "fix": fix.get("fix") or item.get("recommendedIntervention"),
        "radModules": fix.get("radModules", []),
        "serviceMapping": item.get("serviceMapping"),
        "ownerDataRequired": False,
    }


def coverage_row(item: dict, check: dict, applies: bool, reason: str) -> dict:
    return {
        "id": item["id"],
        "name": item["title"],
        "category": item["cat"],
        "journeyStage": item.get("journeyStage"),
        "evidenceType": item.get("evidenceType", []),
        "evaluation": item.get("evaluation"),
        "applicability": item.get("applicability"),
        "condition": item.get("condition"),
        "applicable": applies,
        "naReason": "" if applies else (check.get("na_reason") or reason),
        "severity": item.get("severity"),
        "serviceMapping": item.get("serviceMapping"),
        "confidence": check.get("confidence") if applies else "not_applicable",
        "scoring": "scored" if applies else "excluded",
        "ownerData": False,
    }


def check_row(item: dict, check: dict, applies: bool, reason: str) -> dict:
    return {
        "id": item["id"],
        "title": item["title"],
        "category": item["cat"],
        "stage": item.get("journeyStage"),
        "max": item["max"],
        "score": check.get("score") if applies else None,
        "applicable": applies,
        "na_reason": "" if applies else (check.get("na_reason") or reason),
        "confidence": check.get("confidence") if applies else "not_applicable",
        "evidence": check.get("evidence") or [],
        "evidence_refs": check.get("evidence_refs") or [],
        "evaluation": item.get("evaluation"),
        "severity": item.get("severity"),
        "recommendedIntervention": item.get("recommendedIntervention"),
        "serviceMapping": item.get("serviceMapping"),
        "ownerData": False,
    }


def scorecard_markdown(result: dict) -> str:
    meta = result["meta"]
    lines = [
        f"# Local Visibility Scorecard — {meta['client']}",
        "",
    ]
    if meta.get("synthetic"):
        lines += ["> **Synthetic example. Not a real business.**", ""]
    lines.append(f"**Score: {result['display']} / 100 — {result['band']} ({result['band_label']})**")
    if result["cap_binding"]:
        active = ", ".join(cap["label"] for cap in result["caps"] if cap["binding"])
        lines.append(f"**Cap applied:** raw {result['total']} capped at {result['cap']} ({active})")
    if result["normalization"]["na_checks"]:
        lines.append(
            f"**Excluded as N/A:** {', '.join(result['normalization']['na_checks'])} "
            "(weights normalized)"
        )
    lines += [
        "",
        "| Category | Earned | Applicable | Weight | Normalized | % |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for category in result["categories"]:
        percent = f"{category['percent']:.0f}%" if category["percent"] is not None else "N/A"
        lines.append(
            f"| {category['id']}. {category['name']} | {category['earned']} | {category['applicable_max']} | "
            f"{category['max']} | {category['normalized']:.2f} | {percent} |"
        )
    lines += [
        "",
        f"**Audit mode:** {result['audit_mode']} · **Rubric:** v{result['rubric_version']} · "
        f"**Scorer:** v{result['scorer_version']} · **Universe:** {result['query_universe_hash']} · **Run:** {meta['run_id']}",
        "",
    ]
    if result["verifiedFindings"]:
        lines += ["## Verified findings", ""]
        for finding in result["verifiedFindings"][:10]:
            lines.append(
                f"- **{finding['id']} {finding['title']}** — {finding['score']}/{finding['max']} "
                f"({finding['stage']}, {finding['severity']})"
            )
        lines.append("")
    if result["ownerDataRequired"]:
        lines += ["## Revenue opportunities to investigate (owner data required)", ""]
        for entry in result["ownerDataRequired"]:
            lines.append(f"- **{entry['title']}** — {entry['whyItMatters']}")
        lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Score a Public Mode Local Visibility Scorecard audit.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""examples:
  python3 score.py --input audit.filled.json --out scores.json --markdown scorecard.md --strict
  python3 score.py --input audit.filled.json
""",
    )
    parser.add_argument("--input", required=True, help="Path to the filled audit JSON")
    parser.add_argument("--out", help="Write scores.json here")
    parser.add_argument("--markdown", help="Write scorecard.md here")
    parser.add_argument("--rubric", default=str(DEFAULT_RUBRIC), help="Rubric JSON")
    parser.add_argument("--strict", action="store_true", help="Accepted for pipeline compatibility; validation is always strict")
    parser.add_argument("--version", action="version", version=f"%(prog)s {SCORER_VERSION}")
    args = parser.parse_args()

    try:
        rubric = load_json(Path(args.rubric))
        audit = load_json(Path(args.input))
    except FileNotFoundError as exc:
        print(f"error: file not found: {exc.filename}", file=sys.stderr)
        return 2
    except json.JSONDecodeError as exc:
        print(f"error: invalid JSON: {exc}", file=sys.stderr)
        return 2

    errors, insufficient = validate(audit, rubric)
    if insufficient:
        print("INSUFFICIENT EVIDENCE", file=sys.stderr)
        for item in insufficient:
            print(f"  - {item}", file=sys.stderr)
        if errors:
            for error in errors:
                print(f"error: {error}", file=sys.stderr)
        print("\nNo score was written. A missing or invalid observation is not a low business score.", file=sys.stderr)
        return 1
    if errors:
        for error in errors:
            print(f"error: {error}", file=sys.stderr)
        print(f"\n{len(errors)} validation error(s); no score was written.", file=sys.stderr)
        return 1

    result = compute(audit, rubric)
    payload = json.dumps(result, indent=2, ensure_ascii=False) + "\n"
    if args.out:
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(payload, encoding="utf-8")
        print(f"wrote {out}")
    if args.markdown:
        markdown = Path(args.markdown)
        markdown.parent.mkdir(parents=True, exist_ok=True)
        markdown.write_text(scorecard_markdown(result), encoding="utf-8")
        print(f"wrote {markdown}")
    if not args.out and not args.markdown:
        print(payload, end="")

    print(
        f"score: {result['display']} / 100 · {result['band']} ({result['band_label']}) · "
        f"raw {result['total']} · cap {result['cap']} · N/A {len(result['normalization']['na_checks'])}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
