/**
 * Normalize provider responses into the internal audit model.
 *
 * The normalized model is provider-agnostic. A result is only ever described as
 * a Maps, Local Pack, Local Finder, organic, AI consumer-surface, or AI
 * model/API observation. Raw provider responses stay in the local cache.
 */

const DIRECTORY_DOMAINS = [
  "yelp.",
  "angi.",
  "angieslist.",
  "bbb.org",
  "yellowpages.",
  "manta.",
  "houzz.",
  "thumbtack.",
  "homeadvisor.",
  "mapquest.",
  "chamberofcommerce.",
  "cylex.",
  "hotfrog.",
  "brownbook.",
  "superpages.",
  "citysearch.",
  "porch.",
  "buildzoom.",
  "networx.",
];

const SOCIAL_DOMAINS = [
  "reddit.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "tiktok.com",
  "linkedin.com",
  "nextdoor.com",
  "x.com",
  "twitter.com",
  "pinterest.com",
  "quora.com",
];

const MANUFACTURER_DOMAINS = [
  "rheem.",
  "carrier.",
  "trane.",
  "navien.",
  "rinnai.",
  "statewaterheaters.",
  "aosmith.",
  "moen.",
  "deltafaucet.",
  "kohler.",
  "americanstandardair.",
  "lennox.",
  "goodmanmfg.",
  "bryant.",
  "mitsubishicomfort.",
];

const PUBLISHER_DOMAINS = [
  "wikipedia.org",
  "medium.com",
  "forbes.com",
  "nytimes.com",
  "washingtonpost.com",
  "usnews.com",
  "consumeraffairs.com",
  "angi.com",
  "thisoldhouse.com",
  "familyhandyman.com",
  "hgtv.com",
  "bobvila.com",
];

const GOVERNMENT_SUFFIXES = [".gov", ".mil", ".us"];

export function normaliseDomain(value) {
  if (!value) return "";
  let domain = String(value).trim().toLowerCase();
  try {
    if (/^https?:\/\//.test(domain)) domain = new URL(domain).hostname;
  } catch {
    // Keep the raw value.
  }
  return domain.replace(/^www\./, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
}

export function normalisePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function normaliseName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(inc|llc|ltd|co|company|corp|corporation|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function makeTarget(business = {}) {
  const name = String(business.name || "").replace(/\s*\([^)]*\)\s*/g, " ").trim();
  return {
    name,
    aliases: [name, ...(business.aliases || [])].filter(Boolean).map(normaliseName),
    domain: normaliseDomain(business.domain || business.website || business.websiteUri || ""),
    place_id: business.place_id || business.placeId || "",
    cid: business.cid || "",
    phone: normalisePhone(business.phone),
    trade: String(business.trade || "").toLowerCase(),
  };
}

function entityFromMapsItem(item) {
  return {
    place_id: item.place_id || "",
    cid: item.cid || "",
    name: item.title || "",
    domain: normaliseDomain(item.domain || item.url || ""),
    url: item.url || "",
    phone: item.phone || "",
  };
}

function entityFromLocalPackItem(item) {
  return {
    place_id: item.place_id || "",
    cid: item.cid || "",
    name: item.title || "",
    domain: normaliseDomain(item.domain || item.url || ""),
    url: item.url || item.booking_url || "",
    phone: item.phone || "",
  };
}

function entityFromOrganicItem(item) {
  return {
    place_id: item.place_id || "",
    cid: item.cid || "",
    name: item.website_name || item.title || "",
    domain: normaliseDomain(item.domain || item.url || ""),
    url: item.url || "",
    phone: item.phone || "",
  };
}

export function matchEntity(entity, target) {
  if (!entity || !target) return { found: false, method: null, confidence: 0 };
  if (target.place_id && entity.place_id && target.place_id === entity.place_id) {
    return { found: true, method: "place_id", confidence: 1 };
  }
  if (target.cid && entity.cid && String(target.cid) === String(entity.cid)) {
    return { found: true, method: "place_id", confidence: 0.98 };
  }
  if (target.domain && entity.domain && normaliseDomain(entity.domain) === target.domain) {
    return { found: true, method: "domain", confidence: 0.95 };
  }
  if (target.phone && entity.phone && normalisePhone(entity.phone) === target.phone) {
    return { found: true, method: "phone", confidence: 0.9 };
  }
  const entityName = normaliseName(entity.name);
  let ambiguous = null;
  if (entityName) {
    for (const alias of target.aliases || []) {
      if (!alias) continue;
      if (entityName === alias) return { found: true, method: "name_alias", confidence: 0.8 };
      if (alias.length >= 6 && (entityName.includes(alias) || alias.includes(entityName))) {
        // A partial-name hit is a lead for review, not an identity resolution.
        // Counting it as found would turn a similar business into the target.
        ambiguous = { found: false, method: "name_alias", confidence: 0.62, ambiguous: true };
      }
    }
  }
  return ambiguous || { found: false, method: null, confidence: 0 };
}

export function classifyDomain(domain, serpOccupiers = []) {
  const value = normaliseDomain(domain);
  if (!value) return "other";
  if (serpOccupiers.includes(value)) {
    if (DIRECTORY_DOMAINS.some((token) => value.includes(token))) return "directory";
    if (/yelp|angi|bbb|yellowpages|manta|houzz|thumbtack|homeadvisor/.test(value)) return "directory";
    if (/reddit|nextdoor|youtube|facebook/.test(value)) return "social_community";
    return "publisher";
  }
  if (GOVERNMENT_SUFFIXES.some((suffix) => value.endsWith(suffix))) return "government";
  if (SOCIAL_DOMAINS.some((token) => value === token || value.endsWith(`.${token}`))) return "social_community";
  if (DIRECTORY_DOMAINS.some((token) => value.includes(token))) return "directory";
  if (MANUFACTURER_DOMAINS.some((token) => value.includes(token))) return "manufacturer";
  if (PUBLISHER_DOMAINS.some((token) => value === token || value.endsWith(`.${token}`))) return "publisher";
  return "local_business";
}

function relevanceForType(type) {
  if (type === "local" || type === "industry" || type === "manufacturer" || type === "association") return "high";
  if (type === "directory") return "low";
  if (type === "social_community") return "irrelevant";
  return "medium";
}

/**
 * Backlinks do not carry a reliable local/industry label. This classifier is
 * deliberately conservative: it only labels a source when the domain or known
 * directory pattern supports it. The review-only LV-AUT-02 check classifies
 * genuine local relevance; the deterministic LV-AUT-01 count only counts
 * sources already classified as local, industry, manufacturer, or association.
 */
function classifySourceType(domain, serpOccupiers = []) {
  const value = normaliseDomain(domain);
  const entityType = classifyDomain(value, serpOccupiers);
  if (entityType === "directory" || entityType === "publisher" || entityType === "manufacturer") {
    return entityType;
  }
  if (entityType === "marketplace") return "directory";
  if (entityType === "social_community" || entityType === "government") return "other";
  if (/(chamber|association|builders|contractors|plumbing|hvac|roofing|electrical|supply|dealer|trade)/.test(value)) {
    return /(chamber|association)/.test(value) ? "association" : "industry";
  }
  return "other";
}

function competitorId(entity, type) {
  const raw = entity.place_id || entity.cid || entity.domain || normaliseName(entity.name) || "unknown";
  // "cmp-" is reserved for the locked business-competitor cohort. Observed
  // local businesses outside that cohort are recorded as "obs-" so they never
  // masquerade as a scored peer after the cohort was locked.
  const prefix = type === "local_business" ? "obs" : "serp";
  return `${prefix}-${String(raw).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}`;
}

/**
 * Resolve an observed SERP entity to the locked business-competitor cohort.
 * Matching is identifier-first (place ID, CID, domain, phone) and only then
 * name/alias. A near-name match is never enough to attribute a competitor.
 */
export function matchConfiguredCompetitor(entity, competitors = []) {
  if (!entity || !Array.isArray(competitors)) return null;
  const placeId = String(entity.place_id || "");
  const cid = String(entity.cid || "");
  const domain = normaliseDomain(entity.domain || "");
  const phone = normalisePhone(entity.phone || "");
  const name = normaliseName(entity.name || "");
  for (const competitor of competitors) {
    if (!competitor || !competitor.id) continue;
    if (placeId && competitor.place_id && placeId === String(competitor.place_id)) {
      return { competitor, method: "place_id", confidence: 1 };
    }
    if (cid && competitor.cid && cid === String(competitor.cid)) {
      return { competitor, method: "place_id", confidence: 0.98 };
    }
    if (domain && competitor.domain && domain === normaliseDomain(competitor.domain)) {
      return { competitor, method: "domain", confidence: 0.95 };
    }
    if (phone && competitor.phone && phone === normalisePhone(competitor.phone)) {
      return { competitor, method: "phone", confidence: 0.9 };
    }
    const aliases = [competitor.name, ...(competitor.aliases || [])]
      .map((alias) => normaliseName(alias || ""))
      .filter(Boolean);
    if (name && aliases.includes(name)) {
      return { competitor, method: "name_alias", confidence: 0.8 };
    }
  }
  return null;
}

function competitorFromEntity(entity, rank, context) {
  const type = context.directoryItem ? "directory" : classifyDomain(entity.domain, context.serpOccupiers);
  if (type === "local_business") {
    const match = matchConfiguredCompetitor(entity, context.competitors || []);
    if (match) {
      const competitor = match.competitor;
      return {
        id: competitor.id,
        name: competitor.name || entity.name || competitor.id,
        ...(competitor.place_id || entity.place_id
          ? { place_id: competitor.place_id || entity.place_id }
          : {}),
        ...(competitor.domain || entity.domain ? { domain: competitor.domain || entity.domain } : {}),
        rank,
        type: "local_business",
        cohort: true,
        matched_by: match.method,
        match_confidence: match.confidence,
      };
    }
  }
  const id = competitorId(entity, type);
  return {
    id,
    name: entity.name || entity.domain || id,
    ...(entity.place_id ? { place_id: entity.place_id } : {}),
    ...(entity.domain ? { domain: entity.domain } : {}),
    rank,
    type,
    cohort: false,
  };
}

function findTarget(items, context, entityOf) {
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const entity = entityOf(item);
    const match = matchEntity(entity, context.target);
    if (match.found) {
      return { item, entity, match, index, rank: Number(item.rank_group || item.rank_absolute || index + 1) };
    }
  }
  return null;
}

function competitorsFromItems(items, context, entityOf, targetIndex) {
  return items
    .map((item, index) => {
      if (index === targetIndex) return null;
      const entity = entityOf(item);
      if (!entity.name && !entity.domain) return null;
      const rank = Number(item.rank_group || item.rank_absolute || index + 1);
      return competitorFromEntity(entity, rank, {
        ...context,
        directoryItem: item.is_directory_item === true,
      });
    })
    .filter(Boolean);
}

function resultOf(response) {
  return response?.result?.[0] || {};
}

export function normalizeMapsResult(response, context) {
  const result = resultOf(response);
  const items = (result.items || []).filter((item) => item.type === "maps_search" || item.type === "maps_paid_item");
  const paidItems = items.filter((item) => item.type === "maps_paid_item").length;
  const target = findTarget(items, context, entityFromMapsItem);
  return {
    rank: target ? target.rank : null,
    target_found: Boolean(target),
    target_match: target ? target.match : null,
    competitors: competitorsFromItems(items, context, entityFromMapsItem, target ? target.index : -1),
    serp: {
      item_types: result.item_types || [],
      check_url: result.check_url || "",
      datetime: result.datetime || "",
    },
    paid_items: paidItems,
    notes: paidItems ? `${paidItems} paid Maps item(s) observed; paid visibility is diagnostic and unscored.` : "",
  };
}

export function normalizeLocalPackResult(response, context) {
  const result = resultOf(response);
  const items = (result.items || []).filter((item) => item.type === "local_pack");
  const target = findTarget(items, context, entityFromLocalPackItem);
  return {
    rank: target ? target.rank : null,
    target_found: Boolean(target),
    target_match: target ? target.match : null,
    competitors: competitorsFromItems(items, context, entityFromLocalPackItem, target ? target.index : -1),
    serp: {
      item_types: result.item_types || [],
      check_url: result.check_url || "",
      datetime: result.datetime || "",
    },
    paid_items: items.filter((item) => item.is_paid === true).length,
    notes: "",
  };
}

export function normalizeLocalFinderResult(response, context) {
  return normalizeLocalPackResult(response, context);
}

export function normalizeOrganicResult(response, context) {
  const result = resultOf(response);
  const items = (result.items || []).filter((item) => item.type === "organic");
  const target = findTarget(items, context, entityFromOrganicItem);
  return {
    rank: target ? target.rank : null,
    rank_group: target ? Number(target.item.rank_group || target.rank) : null,
    rank_absolute: target ? Number(target.item.rank_absolute || target.rank) : null,
    url: target ? target.entity.url : "",
    domain: target ? target.entity.domain : "",
    target_found: Boolean(target),
    target_match: target ? target.match : null,
    competitors: competitorsFromItems(items, context, entityFromOrganicItem, target ? target.index : -1),
    serp_features: result.item_types || [],
    serp: {
      check_url: result.check_url || "",
      datetime: result.datetime || "",
    },
    paid_items: (result.items || []).filter((item) => item.type === "paid").length,
    notes: "",
  };
}

function containsTarget(text, target) {
  const lower = normaliseName(text);
  if (!lower) return false;
  for (const alias of target.aliases || []) {
    if (alias && lower.includes(alias)) return true;
  }
  if (target.domain) {
    const root = target.domain.split(".")[0];
    if (root.length >= 4 && lower.includes(root)) return true;
  }
  return false;
}

function recommendationContext(text, target) {
  const raw = String(text || "");
  const lower = normaliseName(raw);
  const alias = (target.aliases || []).find((entry) => entry && lower.includes(entry));
  if (!alias) return false;
  const index = lower.indexOf(alias);
  const window = lower.slice(Math.max(0, index - 260), Math.min(lower.length, index + alias.length + 260));
  return /\b(recommend|recommended|should (?:call|hire|contact|choose|consider)|best|top|consider|hire|call)\b/.test(window);
}

function referenceEntries(overview) {
  const entries = [];
  if (Array.isArray(overview.references)) entries.push(...overview.references);
  for (const item of overview.items || []) {
    if (Array.isArray(item.references)) entries.push(...item.references);
  }
  return entries.filter((reference) => reference && (reference.domain || reference.url));
}

function aiText(overview) {
  const parts = [];
  if (overview.markdown) parts.push(overview.markdown);
  if (overview.text) parts.push(overview.text);
  for (const item of overview.items || []) {
    if (item.markdown) parts.push(item.markdown);
    if (item.text) parts.push(item.text);
    if (item.title) parts.push(item.title);
  }
  return parts.join("\n");
}

function citedDomainsFor(references) {
  return [...new Set(references.map((reference) => normaliseDomain(reference.domain || reference.url)).filter(Boolean))];
}

export function normalizeAiModeResult(response, context) {
  const result = resultOf(response);
  const overviews = (result.items || []).filter((item) => item.type === "ai_overview");
  const overview = overviews[0];
  if (!overview) {
    return {
      available: false,
      target_mentioned: false,
      target_recommended: false,
      target_cited: false,
      target_entity_accuracy: "not_present",
      position: null,
      cited_domains: [],
      competitor_mentions: [],
      notes: "No ai_overview element was returned for this prompt.",
    };
  }
  const text = aiText(overview);
  const references = referenceEntries(overview);
  const domains = citedDomainsFor(references);
  const mentioned = containsTarget(text, context.target) || (context.target.domain && domains.includes(context.target.domain));
  const recommended = mentioned && recommendationContext(text, context.target);
  const cited = Boolean(context.target.domain && domains.includes(context.target.domain));
  const competitorMentions = (context.competitors || [])
    .map((competitor) => {
      const alias = normaliseName(competitor.name);
      const mentionedByText = alias && normaliseName(text).includes(alias);
      const domain = normaliseDomain(competitor.domain);
      const mentionedBySource = domain && domains.includes(domain);
      const recommendedByText = mentionedByText && recommendationContext(text, {
        aliases: [alias],
        domain,
      });
      return {
        id: competitor.id,
        name: competitor.name,
        ...(domain ? { domain } : {}),
        type: competitor.type || "local_business",
        recommended: Boolean(recommendedByText),
        cited: Boolean(domain && domains.includes(domain)),
        ...(mentionedByText || mentionedBySource ? { rank: 1 } : {}),
      };
    })
    .filter((competitor) => competitor.recommended || competitor.cited || competitor.rank);
  return {
    available: true,
    target_mentioned: Boolean(mentioned),
    target_recommended: Boolean(recommended),
    target_cited: Boolean(cited),
    target_entity_accuracy: mentioned ? (cited || containsTarget(text, context.target) ? "accurate" : "minor_error") : "not_present",
    position: Number(overview.rank_absolute || overview.rank_group || 0) || null,
    cited_domains: domains,
    competitor_mentions: competitorMentions,
    notes: "AI consumer-surface observation. Mention, recommendation, and citation are stored separately.",
  };
}

export function normalizeLlmMentionsResult(response, context) {
  const result = resultOf(response);
  const item = (result.items || [])[0];
  if (!item) {
    return {
      available: false,
      target_mentioned: false,
      target_recommended: false,
      target_cited: false,
      target_entity_accuracy: "not_present",
      position: null,
      cited_domains: [],
      competitor_mentions: [],
      model_version: "",
      notes: "No LLM mention item was returned for this prompt.",
    };
  }
  const text = `${item.answer || ""}\n${(item.sources || []).map((source) => `${source.title || ""} ${source.snippet || ""}`).join("\n")}`;
  const references = item.sources || [];
  const domains = citedDomainsFor(references);
  const mentioned = containsTarget(text, context.target) || (context.target.domain && domains.includes(context.target.domain));
  const recommended = mentioned && recommendationContext(text, context.target);
  const cited = Boolean(context.target.domain && domains.includes(context.target.domain));
  const competitorMentions = (context.competitors || [])
    .map((competitor) => {
      const alias = normaliseName(competitor.name);
      const domain = normaliseDomain(competitor.domain);
      const mentionedByText = alias && normaliseName(text).includes(alias);
      const mentionedBySource = domain && domains.includes(domain);
      return {
        id: competitor.id,
        name: competitor.name,
        ...(domain ? { domain } : {}),
        type: competitor.type || "local_business",
        recommended: Boolean(mentionedByText && recommendationContext(text, { aliases: [alias], domain })),
        cited: Boolean(domain && domains.includes(domain)),
        ...(mentionedByText || mentionedBySource ? { rank: 1 } : {}),
      };
    })
    .filter((competitor) => competitor.recommended || competitor.cited || competitor.rank);
  return {
    available: true,
    target_mentioned: Boolean(mentioned),
    target_recommended: Boolean(recommended),
    target_cited: Boolean(cited),
    target_entity_accuracy: mentioned ? (cited || containsTarget(text, context.target) ? "accurate" : "minor_error") : "not_present",
    position: null,
    cited_domains: domains,
    competitor_mentions: competitorMentions,
    model_version: item.model_name || "",
    notes: "Model/API-generated mention observation. Never pooled with a consumer/search surface.",
  };
}

export function normalizeBacklinksSummary(response) {
  const result = resultOf(response);
  return {
    target: result.target || "",
    rank: Number(result.rank || 0),
    backlinks: Number(result.backlinks || 0),
    referring_domains: Number(result.referring_domains || 0),
    referring_main_domains: Number(result.referring_main_domains || 0),
    first_seen: result.first_seen || "",
  };
}

export function normalizeReferringDomains(response, context = {}) {
  const result = resultOf(response);
  return (result.items || []).map((item) => {
    const domain = normaliseDomain(item.domain || "");
    const type = classifySourceType(domain, context.serpOccupiers || []);
    return {
      domain,
      main_domain: domain,
      type,
      relevance: relevanceForType(type),
      first_seen: item.first_seen || "",
      source_id: context.sourceId || "backlinks",
    };
  });
}

export function normalizeBusinessListings(response, context = {}) {
  const result = resultOf(response);
  const target = context.target || {};
  const trade = String(target.trade || "").toLowerCase();
  const listings = (result.items || []).map((item) => {
    const domain = normaliseDomain(item.domain || item.url || "");
    const listingName = normaliseName(item.title || "");
    const nameConsistent = Boolean(
      listingName && (target.aliases || []).some((alias) => alias && (listingName === alias || listingName.includes(alias) || alias.includes(listingName))),
    );
    return {
      source: item.title || domain || "business_listing",
      name_consistent: nameConsistent,
      domain_consistent: Boolean(target.domain && domain && domain === target.domain),
      phone_consistent: Boolean(target.phone && item.phone && normalisePhone(item.phone) === target.phone),
      category_consistent: Boolean(trade && String(item.category || "").toLowerCase().includes(trade)),
      source_id: context.sourceId || "business-listings",
    };
  });
  return listings;
}

export function resolveTargetFromListings(response, target) {
  const result = resultOf(response);
  const items = result.items || [];
  for (const item of items) {
    const entity = {
      place_id: item.place_id || "",
      cid: item.cid || "",
      name: item.title || "",
      domain: normaliseDomain(item.domain || item.url || ""),
      phone: item.phone || "",
    };
    const match = matchEntity(entity, target);
    if (match.found) return { resolved: true, ...match, entity: item };
  }
  return { resolved: false, method: null, confidence: 0, entity: null };
}
