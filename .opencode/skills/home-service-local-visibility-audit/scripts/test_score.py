#!/usr/bin/env python3
"""Unit tests for the deterministic Local Visibility scorer."""

from __future__ import annotations

import copy
import importlib.util
import json
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
FIXTURE = HERE / "fixtures" / "acme-plumbing.audit.json"
RUBRIC = HERE.parent / "references" / "rubric.json"

spec = importlib.util.spec_from_file_location("lv_score", HERE / "score.py")
score = importlib.util.module_from_spec(spec)
spec.loader.exec_module(score)


class ScorerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rubric = json.loads(RUBRIC.read_text(encoding="utf-8"))
        cls.audit = json.loads(FIXTURE.read_text(encoding="utf-8"))

    def fresh(self):
        return copy.deepcopy(self.audit), copy.deepcopy(self.rubric)

    def test_golden_fixture_is_60_c(self):
        audit, rubric = self.fresh()
        errors, insufficient = score.validate(audit, rubric)
        self.assertEqual(errors, [])
        self.assertEqual(insufficient, [])
        result = score.compute(audit, rubric)
        self.assertEqual(result["display"], 60)
        self.assertEqual(result["band"], "C")
        self.assertEqual(result["total"], 59.9)
        self.assertEqual(len(result["normalization"]["na_checks"]), 2)

    def test_query_universe_hash_matches(self):
        audit, _ = self.fresh()
        self.assertEqual(audit["query_universe"]["hash"], score.hash_universe(audit["query_universe"]))
        self.assertEqual(audit["run"]["query_universe_hash"], audit["query_universe"]["hash"])

    def test_category_math_reconciles(self):
        audit, rubric = self.fresh()
        result = score.compute(audit, rubric)
        normalized = sum(category["normalized"] for category in result["categories"])
        applicable_weight = sum(category["max"] for category in result["categories"] if category["applicable"])
        self.assertAlmostEqual(result["total"], round(normalized * 100 / applicable_weight, 1), places=1)
        self.assertEqual(result["total_max"], 100)
        self.assertEqual(sum(category["max"] for category in rubric["categories"]), 100)

    def test_owner_data_never_appears_in_checks(self):
        audit, rubric = self.fresh()
        result = score.compute(audit, rubric)
        self.assertFalse(any(check["id"].startswith("OD-") for check in result["checks"]))
        self.assertEqual(len(result["ownerDataRequired"]), len(rubric["ownerData"]))
        self.assertTrue(all(entry["publicScoreImpact"] == "none" for entry in result["ownerDataRequired"]))
        self.assertFalse(any(entry.get("scored") for entry in result["ownerDataRequired"]))

    def test_optional_local_finder_is_normalized_away(self):
        audit, rubric = self.fresh()
        self.assertIn("LV-MAP-10", audit["checks"])
        self.assertFalse(audit["checks"]["LV-MAP-10"]["applicable"])
        result = score.compute(audit, rubric)
        category_b = next(category for category in result["categories"] if category["id"] == "B")
        self.assertEqual(category_b["applicable_max"], 23)
        self.assertIn("LV-MAP-10", category_b["na_checks"])

    def test_historical_trend_is_normalized_away(self):
        audit, rubric = self.fresh()
        result = score.compute(audit, rubric)
        category_g = next(category for category in result["categories"] if category["id"] == "G")
        self.assertEqual(category_g["applicable_max"], 4)
        self.assertIn("LV-RES-05", category_g["na_checks"])

    def test_no_non_branded_discovery_cap_binds(self):
        audit, rubric = self.fresh()
        audit["metrics"]["coverage"]["non_branded_discovery_present"] = False
        audit["facts"]["non_branded_discovery_present"] = False
        result = score.compute(audit, rubric)
        self.assertTrue(result["cap_active"])
        self.assertTrue(result["cap_binding"])
        self.assertLessEqual(result["final"], 25)
        active = {cap["id"] for cap in result["caps"] if cap["active"]}
        self.assertEqual(active, {"no_non_branded_discovery"})

    def test_validity_gate_failure_is_insufficient_evidence(self):
        audit, rubric = self.fresh()
        audit["validity"]["provider_error_rate"] = 0.5
        _errors, insufficient = score.validate(audit, rubric)
        self.assertTrue(any("provider error" in item for item in insufficient))

    def test_universe_hash_mismatch_fails(self):
        audit, rubric = self.fresh()
        audit["query_universe"]["hash"] = "sha256:" + "0" * 64
        errors, _ = score.validate(audit, rubric)
        self.assertTrue(any("query_universe.hash" in error for error in errors))

    def test_deterministic_check_must_be_verified(self):
        audit, rubric = self.fresh()
        audit["checks"]["LV-MAP-01"]["confidence"] = "strong_signal"
        errors, _ = score.validate(audit, rubric)
        self.assertTrue(any("deterministic" in error for error in errors))

    def test_na_check_cannot_be_scored(self):
        audit, rubric = self.fresh()
        audit["checks"]["LV-MAP-10"]["score"] = 2
        errors, _ = score.validate(audit, rubric)
        self.assertTrue(any("LV-MAP-10" in error and "N/A" in error for error in errors))

    def test_missing_evidence_refs_fail(self):
        audit, rubric = self.fresh()
        audit["checks"]["LV-MAP-01"]["evidence_refs"] = []
        errors, _ = score.validate(audit, rubric)
        self.assertTrue(any("evidence_refs" in error for error in errors))

    def test_unknown_source_fails(self):
        audit, rubric = self.fresh()
        audit["checks"]["LV-MAP-01"]["evidence_refs"] = ["missing-source"]
        errors, _ = score.validate(audit, rubric)
        self.assertTrue(any("unknown source" in error for error in errors))

    def test_invalid_source_method_fails(self):
        audit, rubric = self.fresh()
        audit["sources"][0]["method"] = "live"
        errors, _ = score.validate(audit, rubric)
        self.assertTrue(any("source method=fixture" in error for error in errors))

    def test_invalid_source_surface_fails(self):
        audit, rubric = self.fresh()
        audit["sources"][0]["surface"] = "unknown_surface"
        errors, _ = score.validate(audit, rubric)
        self.assertTrue(any("surface" in error for error in errors))

    def test_unknown_schema_version_fails_safely(self):
        audit, rubric = self.fresh()
        audit["schema_version"] = "9.9"
        errors, _ = score.validate(audit, rubric)
        self.assertTrue(any("schema_version" in error for error in errors))

    def test_fact_conflict_fails(self):
        audit, rubric = self.fresh()
        audit["facts"]["non_branded_discovery_present"] = False
        errors, _ = score.validate(audit, rubric)
        self.assertTrue(any("non_branded_discovery_present" in error for error in errors))

    def test_credential_value_is_rejected_without_echo(self):
        audit, rubric = self.fresh()
        audit["sources"][0]["notes"] = "AIza" + "A" * 35
        errors, _ = score.validate(audit, rubric)
        self.assertTrue(any("credential-like" in error for error in errors))
        self.assertFalse(any("A" * 35 in error for error in errors))

    def test_half_up_display_rounding(self):
        self.assertEqual(score.round_to(59.5, 0), 60)
        self.assertEqual(score.round_to(59.4, 0), 59)

    def test_opportunities_are_unscored(self):
        audit, rubric = self.fresh()
        result = score.compute(audit, rubric)
        self.assertTrue(all(entry["scored"] is False for entry in result["opportunities"]))
        before = result["display"]
        audit["opportunities"] = [{"id": "financing"}]
        result2 = score.compute(audit, rubric)
        self.assertEqual(result2["display"], before)

    def test_ai_source_types_are_valid(self):
        audit, rubric = self.fresh()
        for surface in audit["ai"]["surfaces"]:
            self.assertIn(surface["source_type"], {"consumer_surface", "model_api"})
        observations = audit["ai"]["observations"]
        self.assertEqual({observation["source_type"] for observation in observations}, {"consumer_surface", "model_api"})

    def test_core_query_cannot_be_branded(self):
        audit, rubric = self.fresh()
        audit["query_universe"]["queries"][0]["brand"] = "brand"
        errors, _ = score.validate(audit, rubric)
        self.assertTrue(any("core query must be non-branded" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
