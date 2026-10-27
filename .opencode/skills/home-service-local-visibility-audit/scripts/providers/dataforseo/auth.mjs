/**
 * DataForSEO authentication.
 *
 * Credentials come from the environment only. The application never loads a
 * .env file. Nothing in this module logs, serializes, or returns the login or
 * password. The caller receives an Authorization header value and must keep it
 * in memory.
 */

const REQUIRED = ["DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"];

export class MissingCredentialsError extends Error {
  constructor() {
    super(
      "DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD must be set in the environment. " +
        "The application never reads .env automatically. Fixture mode needs no credentials.",
    );
    this.name = "MissingCredentialsError";
  }
}

export function assertCredentials(env = process.env) {
  const missing = REQUIRED.filter((key) => !env[key] || !String(env[key]).trim());
  if (missing.length) throw new MissingCredentialsError();
  for (const key of REQUIRED) {
    if (/[\r\n]/.test(String(env[key]))) {
      throw new Error(`${key} contains a newline; refusing to build an Authorization header`);
    }
  }
}

export function authorizationHeader(env = process.env) {
  assertCredentials(env);
  const encoded = Buffer.from(`${env.DATAFORSEO_LOGIN}:${env.DATAFORSEO_PASSWORD}`, "utf8").toString("base64");
  return `Basic ${encoded}`;
}

export function credentialsPresent(env = process.env) {
  return REQUIRED.every((key) => Boolean(env[key] && String(env[key]).trim()));
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
  if (credentialsPresent(env)) {
    const header = Buffer.from(`${env.DATAFORSEO_LOGIN}:${env.DATAFORSEO_PASSWORD}`, "utf8").toString("base64");
    output = output.split(header).join("[redacted]");
  }
  output = output.replace(/Basic\s+[A-Za-z0-9+/=]{16,}/gi, "Basic [redacted]");
  output = output.replace(/(?:password|login)\s*[:=]\s*\S+/gi, "$1=[redacted]");
  return output;
}
