#!/usr/bin/env node
/**
 * Privacy and secret safety net for a public repository.
 *
 * Default: inspect every tracked or untracked (non-ignored) file in this repo.
 * --history: also inspect the text patch of all reachable Git history.
 * --dir <path>: scan an arbitrary directory (used by the synthetic self-tests).
 *
 * The scanner never prints a detected value. Findings identify the file, line,
 * and finding type only.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const HELP = `Local Visibility Scorecard — privacy scan

Usage:
  node scripts/privacy_scan.mjs [--history]
  node scripts/privacy_scan.mjs --dir <path>

Default: scans tracked and untracked, non-ignored files in this repository.
--history: also scans the text patch of all reachable Git history (slower).
--dir: scans every regular file under <path>; intended for scanner self-tests.

Exit 1 on a hard finding: credential-like content, forbidden path, likely PII,
raw evidence, or a private-client artifact. Warnings do not fail.
`;

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(HELP);
  process.exit(0);
}

const history = process.argv.includes("--history");
const dirIndex = process.argv.indexOf("--dir");
const scanDir = dirIndex === -1 ? null : process.argv[dirIndex + 1];
if (dirIndex !== -1 && (!scanDir || scanDir.startsWith("--"))) {
  console.error("error: --dir requires a path");
  process.exit(2);
}

const ROOT = scanDir ? path.resolve(scanDir) : process.cwd();
if (!fs.existsSync(ROOT)) {
  console.error(`error: scan root not found: ${ROOT}`);
  process.exit(2);
}

function git(args) {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024,
  });
}

function walk(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "site") continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(absolute, base));
    else if (entry.isFile()) out.push(path.relative(base, absolute).split(path.sep).join("/"));
  }
  return out;
}

let files;
try {
  files = scanDir
    ? walk(ROOT)
    : git(["ls-files", "--cached", "--others", "--exclude-standard"])
        .split("\n")
        .filter(Boolean);
} catch (error) {
  console.error(`error: could not list files: ${error.message}`);
  process.exit(2);
}

const TEXT_EXT = /\.(md|json|jsonc|mjs|cjs|js|ts|tsx|jsx|py|ya?ml|txt|toml|html|css|scss|sh|example|env|cfg|ini)$/i;
const BINARY_EXT = /\.(png|jpe?g|webp|gif|ico|pdf|zip|gz|woff2?|ttf|otf|mp4|mov)$/i;

const forbiddenPaths = [
  [/^\.audit\//, "raw audit evidence"],
  [/^audit-screens\//, "raw screenshot evidence"],
  [/^private-fixtures\//, "private fixture"],
  [/^raw-api\//, "raw API response"],
  [/^\.cache\//, "provider response cache"],
  [/^reports\/(?!README\.md$).+/, "client report"],
  [/^evals\/(?!README\.md$).+/, "eval run (may contain client evidence)"],
  [/^config\/(?!market\.example\.json$)(?!pricing\.example\.json$).+\.json$/, "client configuration"],
  [/(^|\/)\.env(?!\.example)(\.|$)/, ".env file"],
  [/(^|\/)cookies\.txt$/i, "cookie jar"],
  [/(^|\/)browser-profile\//, "browser profile"],
  [/\.(pem|key|p12)$/i, "private key material"],
  [/\.har$/i, "HTTP archive"],
  [/(^|\/)query-universe\.local\.json$/, "private query universe"],
  [/(^|\/)(client|customer)[-_]?(report|data|export|artifact)/i, "private-client artifact"],
  [/(^|\/)(real|live)[-_](audit|report|client)/i, "real-client artifact"],
];

const secretPatterns = [
  {
    name: "private key block",
    hard: true,
    re: /-----BEGIN (?:RSA |OPENSSH |EC |DSA |PGP )?PRIVATE KEY-----/,
  },
  {
    name: "Google API key",
    hard: true,
    re: /\bAIza[0-9A-Za-z_-]{30,}\b/,
  },
  {
    name: "Google OAuth client secret",
    hard: true,
    re: /\bGOCSPX-[0-9A-Za-z_-]{20,}\b/,
  },
  {
    name: "Google service-account JSON",
    hard: true,
    re: /"type"\s*:\s*"service_account"[\s\S]{0,400}"private_key"\s*:/,
  },
  {
    name: "AWS access key",
    hard: true,
    re: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    name: "GitHub token",
    hard: true,
    re: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,})\b/,
  },
  {
    name: "OpenAI-style secret key",
    hard: true,
    re: /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}\b/,
  },
  {
    name: "Anthropic-style secret key",
    hard: true,
    re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/,
  },
  {
    name: "Slack token",
    hard: true,
    re: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
  },
  {
    name: "JSON Web Token",
    hard: true,
    re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  },
  {
    name: "bearer or basic authorization header",
    hard: true,
    re: /\bAuthorization\s*:\s*(?:Bearer|Basic)\s+\S{12,}/i,
  },
  {
    name: "standalone Basic credential value",
    hard: true,
    re: /(?:^|[\s"'`])Basic\s+([A-Za-z0-9+/=_-]{20,})(?:$|[\s"'`])/m,
    allow: (value) => /^(?:your|example|placeholder|replace|changeme|redacted|dummy|fake|test|synthetic|xxx+|<)/i.test(value),
  },
  {
    name: "DataForSEO password assignment",
    hard: true,
    re: /\bDATAFORSEO_PASSWORD\b\s*[:=]\s*["']?([A-Za-z0-9_./+=-]{8,})["']?/i,
    allow: (value) =>
      /^(?:your|example|placeholder|replace|changeme|redacted|dummy|fake|test|synthetic|none|null|undefined|xxx+|<)/i.test(value) ||
      /^(?:process\.env|os\.environ|env\.|import\.meta|globalThis|window\.|Deno\.env)/.test(value),
  },
  {
    name: "DataForSEO login assignment",
    hard: true,
    re: /\bDATAFORSEO_LOGIN\b\s*[:=]\s*["']?([A-Za-z0-9._%+@-]{8,})["']?/i,
    allow: (value) =>
      /^(?:your|example|placeholder|replace|changeme|redacted|dummy|fake|test|synthetic|none|null|undefined|xxx+|<)/i.test(value) ||
      /^(?:process\.env|os\.environ|env\.|import\.meta|globalThis|window\.|Deno\.env)/.test(value),
  },
  {
    name: "DataForSEO Basic Auth value",
    hard: true,
    re: /\bDATAFORSEO_BASIC_AUTH\b\s*[:=]\s*["']?(?:Basic\s+)?([A-Za-z0-9+/=_-]{16,})["']?/i,
    allow: (value) =>
      /^(?:your|example|placeholder|replace|changeme|redacted|dummy|fake|test|synthetic|none|null|undefined|xxx+|<)/i.test(value) ||
      /\$\{/.test(value),
  },
  {
    name: "literal credentials encoded with base64",
    hard: true,
    re: /(?:Buffer\.from|btoa|base64\.b64encode)\s*\(\s*["'`]([^"'`]{8,}):([^"'`]{6,})["'`]/i,
    allow: (...values) =>
      values.some(
        (value) =>
          /^(?:your|example|placeholder|replace|changeme|redacted|dummy|fake|test|synthetic|login|password|user|pass|xxx+|<)/i.test(value) ||
          /\$\{/.test(value) ||
          /(?:process\.env|os\.environ|env\.|import\.meta)/.test(value),
      ),
  },
  {
    name: "credential assignment",
    hard: true,
    re: /\b(?:api[_-]?key|apikey|client[_-]?secret|access[_-]?token|refresh[_-]?token|auth[_-]?token|password|passwd|secret)\b\s*[:=]\s*["']?([A-Za-z0-9_./+=-]{16,})["']?/i,
    allow: (value) =>
      /^(?:your|example|placeholder|replace|changeme|redacted|dummy|fake|test|synthetic|none|null|undefined|xxx+|<)/i.test(value) ||
      /^(?:YOUR_|EXAMPLE_|PLACEHOLDER_|REPLACE_)/.test(value) ||
      /^(?:process\.env|os\.environ|env\.|import\.meta|globalThis|window\.|Deno\.env)/.test(value),
  },
  {
    name: "credential in URL query",
    hard: true,
    re: /[?&](?:api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|client[_-]?secret|secret|token|password)=([A-Za-z0-9_./+=-]{16,})/i,
    allow: (value) =>
      /^(?:your|example|placeholder|replace|changeme|redacted|dummy|fake|test|synthetic|xxx+|<)/i.test(value),
  },
  {
    name: "credentials embedded in URL",
    hard: true,
    re: /\bhttps?:\/\/[^/\s:@]+:[^/\s@]{6,}@[^\s/]+/i,
  },
];

const emailPattern = /\b[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g;
const phonePattern = /(?<!\d)(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})(?!\d)/g;
const streetPattern = /\b\d{2,6}\s+(?:[A-Z][A-Za-z0-9.'-]*\s){1,4}(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Way|Court|Ct)\b/g;

const errors = [];
const warnings = [];
let scanned = 0;

function scanText(file, text) {
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const location = `${file}:${index + 1}`;
    for (const pattern of secretPatterns) {
      const match = line.match(pattern.re);
      if (!match) continue;
      const value = match[1] || match[0];
      if (pattern.allow?.(value, match[1], match[2])) continue;
      errors.push(`${location}: possible ${pattern.name} (value redacted)`);
    }

    for (const match of line.matchAll(emailPattern)) {
      const domain = match[1].toLowerCase();
      if (
        domain === "example.com" ||
        domain.endsWith(".example") ||
        domain === "example.org" ||
        domain === "example.net" ||
        domain === "users.noreply.github.com"
      ) {
        continue;
      }
      errors.push(`${location}: email-like value (value redacted) — verify it is not personal data`);
    }

    for (const match of line.matchAll(phonePattern)) {
      const area = match[1];
      const exchange = match[2];
      if (area === "555" || exchange === "555" || area === "000") continue;
      errors.push(`${location}: phone-like value (value redacted) — use 555-01xx placeholders`);
    }

    for (const match of line.matchAll(streetPattern)) {
      // A real customer address is a hard privacy finding, not a stylistic
      // warning. Synthetic examples must use "Example", "Synthetic", or a
      // documented placeholder street.
      if (/example|synthetic|placeholder/i.test(match[0])) continue;
      errors.push(`${location}: street-address-like text (value redacted) — use a synthetic address or omit it`);
    }
  }
}

for (const file of files) {
  for (const [pattern, label] of forbiddenPaths) {
    if (pattern.test(file)) errors.push(`${file}: forbidden path (${label})`);
  }
  const absolute = path.join(ROOT, file);
  if (!fs.existsSync(absolute)) continue;
  if (BINARY_EXT.test(file)) continue;
  if (!TEXT_EXT.test(file)) continue;
  scanned += 1;
  try {
    scanText(file, fs.readFileSync(absolute, "utf8"));
  } catch (error) {
    warnings.push(`${file}: could not read as text (${error.code || "error"})`);
  }
}

if (history && !scanDir) {
  try {
    const patch = git(["log", "-p", "--all", "--no-color", "--no-ext-diff"]);
    scanText("git history", patch);
  } catch (error) {
    warnings.push(`git history scan failed: ${error.message}`);
  }
}

const uniqueErrors = [...new Set(errors)];
const uniqueWarnings = [...new Set(warnings)];
console.log(
  `Scanned ${scanned} text file(s)${history && !scanDir ? " plus Git history" : ""} under ${scanDir ? ROOT : "the repository"}.`
);
for (const warning of uniqueWarnings.slice(0, 50)) console.log(`warn  ${warning}`);
if (uniqueWarnings.length > 50) console.log(`warn  ... ${uniqueWarnings.length - 50} more`);
for (const error of uniqueErrors) console.error(`FAIL  ${error}`);

if (uniqueErrors.length) {
  console.error(
    `\n${uniqueErrors.length} hard privacy finding(s). Remove the data and rotate any exposed credential. Do not rewrite history without owner authorization.`
  );
  process.exit(1);
}
console.log("ok: no hard privacy findings.");
