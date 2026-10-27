/**
 * DataForSEO authentication.
 *
 * Two environment-only options:
 *   1. DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD  (the client encodes them)
 *   2. DATAFORSEO_BASIC_AUTH                   (a pre-encoded Base64
 *      "login:password" value, with or without the "Basic " prefix)
 *
 * The application never loads a .env file. Nothing in this module logs,
 * serializes, or returns the login, password, or encoded token. The caller
 * receives an Authorization header value and keeps it in memory.
 *
 * Base64 is an encoding, not encryption. Treat the encoded value as a
 * credential.
 */

const REQUIRED = ["DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"];
const BASIC_ENV = "DATAFORSEO_BASIC_AUTH";

export class MissingCredentialsError extends Error {
  constructor() {
    super(
      "DataForSEO credentials are not set. Export DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD, " +
        "or export DATAFORSEO_BASIC_AUTH with a Base64 login:password value. " +
        "The application never reads .env automatically. Fixture mode needs no credentials.",
    );
    this.name = "MissingCredentialsError";
  }
}

function fail(message) {
  throw new Error(`invalid ${BASIC_ENV}: ${message}`);
}

/**
 * Validate and normalize a pre-encoded Basic credential. Accepts either the
 * bare Base64 value or a full "Basic <value>" header value. The token must
 * decode to a login:password pair.
 */
export function normalizeBasicToken(raw) {
  let value = String(raw ?? "").trim();
  if (!value) fail("the value is empty");
  if (/^Basic\s+/i.test(value)) value = value.replace(/^Basic\s+/i, "").trim();
  if (!/^[A-Za-z0-9+/=_-]+$/.test(value)) {
    fail("the value is not a Base64 string");
  }
  if (value.length < 8) fail("the value is too short to be a login:password token");
  const decoded = Buffer.from(value, "base64").toString("utf8");
  if (!decoded.includes(":")) fail("the value must decode to login:password");
  return value;
}

export function assertCredentials(env = process.env) {
  const basic = env[BASIC_ENV];
  if (basic !== undefined && String(basic).trim()) {
    normalizeBasicToken(basic);
    return;
  }
  const missing = REQUIRED.filter((key) => !env[key] || !String(env[key]).trim());
  if (missing.length) throw new MissingCredentialsError();
  for (const key of REQUIRED) {
    if (/[\r\n]/.test(String(env[key]))) {
      throw new Error(`${key} contains a newline; refusing to build an Authorization header`);
    }
  }
}

export function credentialsPresent(env = process.env) {
  if (env[BASIC_ENV] !== undefined && String(env[BASIC_ENV]).trim()) return true;
  return REQUIRED.every((key) => Boolean(env[key] && String(env[key]).trim()));
}

export function tokenFromEnv(env = process.env) {
  assertCredentials(env);
  if (env[BASIC_ENV] !== undefined && String(env[BASIC_ENV]).trim()) {
    return normalizeBasicToken(env[BASIC_ENV]);
  }
  return Buffer.from(`${env.DATAFORSEO_LOGIN}:${env.DATAFORSEO_PASSWORD}`, "utf8").toString("base64");
}

export function authorizationHeader(env = process.env) {
  return `Basic ${tokenFromEnv(env)}`;
}

/**
 * Remove any credential-shaped material from an error message before it is
 * logged or written to an artifact.
 */
export function redactSecrets(text, env = process.env) {
  let output = String(text ?? "");
  for (const key of REQUIRED) {
    const value = env[key];
    if (value && String(value).length >= 3) output = output.split(String(value)).join("[redacted]");
  }
  const basic = env[BASIC_ENV];
  if (basic !== undefined && String(basic).trim()) {
    const raw = String(basic).trim();
    const token = /^Basic\s+/i.test(raw) ? raw.replace(/^Basic\s+/i, "").trim() : raw;
    if (token) output = output.split(token).join("[redacted]");
    try {
      const decoded = Buffer.from(token, "base64").toString("utf8");
      if (decoded.includes(":")) {
        const [login, ...rest] = decoded.split(":");
        const password = rest.join(":");
        if (login) output = output.split(login).join("[redacted]");
        if (password) output = output.split(password).join("[redacted]");
      }
    } catch {
      // Keep the redacted token.
    }
  }
  if (credentialsPresent(env)) {
    try {
      const header = authorizationHeader(env);
      output = output.split(header).join("Basic [redacted]");
    } catch {
      // Invalid credentials are already being handled elsewhere.
    }
  }
  output = output.replace(/Basic\s+[A-Za-z0-9+/=_-]{16,}/gi, "Basic [redacted]");
  output = output.replace(/(?:password|login)\s*[:=]\s*\S+/gi, "$1=[redacted]");
  return output;
}
