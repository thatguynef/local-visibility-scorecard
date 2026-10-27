/** DataForSEO provider entrypoint. Keep vendor-specific HTTP in this directory. */

export {
  DataForSeoClient,
  ProviderError,
} from "./client.mjs";
export {
  MissingCredentialsError,
  assertCredentials,
  authorizationHeader,
  credentialsPresent,
  normalizeBasicToken,
  redactSecrets,
} from "./auth.mjs";
export {
  SERP_ENDPOINTS,
  coordinate,
  googleAiMode,
  googleLocalFinder,
  googleMaps,
  googleOrganic,
} from "./serp.mjs";
export { LABS_ENDPOINTS, keywordOverview, normalizeKeywordOverview } from "./labs.mjs";
export { AI_ENDPOINTS, SUPPORTED_LLM_MENTION_PLATFORMS, llmMentions } from "./ai.mjs";
export { BACKLINK_ENDPOINTS, backlinksSummary, referringDomains } from "./backlinks.mjs";
export { BUSINESS_DATA_ENDPOINTS, businessListingsSearch } from "./business-data.mjs";
export {
  classifyDomain,
  makeTarget,
  matchEntity,
  normaliseDomain,
  normaliseName,
  normalisePhone,
  normalizeAiModeResult,
  normalizeBacklinksSummary,
  normalizeBusinessListings,
  normalizeLlmMentionsResult,
  normalizeLocalFinderResult,
  normalizeLocalPackResult,
  normalizeMapsResult,
  normalizeOrganicResult,
  normalizeReferringDomains,
  resolveTargetFromListings,
} from "./normalize.mjs";
