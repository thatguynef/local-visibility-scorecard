#!/usr/bin/env node
/** Generate the deterministic documentation artwork from the shared visual tokens. */

import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "docs", "assets");
fs.mkdirSync(OUT, { recursive: true });

const C = {
  ink: "#0B0B0C",
  surface: "#141416",
  card: "#1C1C1F",
  paper: "#F7F7F5",
  muted: "#A6A6AA",
  red: "#FF3B3B",
  soft: "#FF8F8F",
  green: "#3FBF7F",
  amber: "#F5C766",
};

const svg = (width, height, title, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title">
  <title id="title">${title}</title>
  <defs>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M40 0H0V40" fill="none" stroke="#ffffff" stroke-opacity="0.035" stroke-width="1"/>
    </pattern>
    <radialGradient id="glow" cx="92%" cy="0%" r="80%">
      <stop offset="0" stop-color="${C.red}" stop-opacity="0.24"/>
      <stop offset="1" stop-color="${C.red}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  ${body}
</svg>
`;

const banner = svg(1200, 320, "Local Visibility Scorecard — find where local customers can and cannot discover the business", `
  <rect width="1200" height="320" fill="${C.ink}"/>
  <rect width="1200" height="320" fill="url(#grid)"/>
  <rect width="1200" height="320" fill="url(#glow)"/>
  <g transform="translate(64 56)">
    <circle cx="18" cy="18" r="24" fill="none" stroke="${C.red}" stroke-opacity="0.35"/>
    <circle cx="18" cy="18" r="15" fill="none" stroke="${C.red}" stroke-opacity="0.55"/>
    <path d="M18 2C10.3 2 4 8.3 4 16c0 10.5 14 24 14 24s14-13.5 14-24C32 8.3 25.7 2 18 2Z" fill="${C.red}"/>
    <circle cx="18" cy="16" r="5" fill="${C.ink}"/>
  </g>
  <text x="120" y="92" fill="${C.soft}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="15" letter-spacing="4">LOCAL VISIBILITY SCORECARD</text>
  <text x="64" y="166" fill="${C.paper}" font-family="ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="46" font-weight="700" letter-spacing="-1.8">Find where local customers can —</text>
  <text x="64" y="218" fill="${C.paper}" font-family="ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="46" font-weight="700" letter-spacing="-1.8">and cannot — discover your business.</text>
  <text x="64" y="270" fill="${C.muted}" font-family="ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="18">Search · Maps · AI answers · Competitors · Authority</text>
  <text x="1136" y="270" text-anchor="end" fill="${C.soft}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="13" letter-spacing="2">PUBLIC MODE</text>
`);

const journeyStages = [
  ["1", "Search", "scored"],
  ["2", "Discover", "scored"],
  ["3", "Ask", "scored"],
  ["4", "Compare", "scored"],
  ["5", "Resilience", "scored"],
  ["6", "Handoff", "observed"],
  ["7", "Measure", "owner"],
];
let journeyBoxes = "";
journeyStages.forEach(([number, label, status], index) => {
  const x = 56 + index * 156;
  const y = 92;
  const color = status === "scored" ? C.red : status === "observed" ? "#2A2A2E" : "#2A2A2E";
  const text = status === "scored" ? "SCORED" : status === "observed" ? "SIBLING" : "OWNER DATA";
  journeyBoxes += `
    <rect x="${x}" y="${y}" width="136" height="112" rx="10" fill="${C.card}" stroke="${color}" stroke-opacity="${status === "scored" ? "0.7" : "1"}"/>
    <text x="${x + 14}" y="${y + 24}" fill="${status === "scored" ? C.soft : C.muted}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="10" letter-spacing="1.5">${number.padStart(2, "0")} · ${text}</text>
    <text x="${x + 14}" y="${y + 62}" fill="${C.paper}" font-family="ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="20" font-weight="600">${label}</text>
    <text x="${x + 14}" y="${y + 88}" fill="${C.muted}" font-family="ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="11">${status === "scored" ? "visibility outcome" : status === "observed" ? "GBP · website" : "revenue · leads"}</text>
  `;
});
const journey = svg(1200, 250, "The local discovery journey from search and ask through compare and resilience, with handoff and measurement owned elsewhere", `
  <rect width="1200" height="250" fill="${C.ink}"/>
  <rect width="1200" height="250" fill="url(#grid)"/>
  <text x="56" y="48" fill="${C.soft}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="13" letter-spacing="3">THE LOCAL DISCOVERY JOURNEY</text>
  ${journeyBoxes}
`);

const preview = svg(1200, 820, "Synthetic Acme Plumbing local visibility report showing 60 out of 100 and three labeled visibility gaps", `
  <rect width="1200" height="820" fill="${C.ink}"/>
  <rect width="1200" height="820" fill="url(#grid)"/>
  <rect x="36" y="36" width="1128" height="748" rx="18" fill="${C.surface}" stroke="#2A2A2E"/>
  <text x="76" y="90" fill="${C.soft}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="12" letter-spacing="3">SYNTHETIC SAMPLE REPORT</text>
  <text x="76" y="138" fill="${C.paper}" font-family="ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="34" font-weight="700">Local Visibility Scorecard</text>
  <text x="76" y="176" fill="${C.muted}" font-family="ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="18">Acme Plumbing (synthetic) · Example County, CA</text>
  <rect x="76" y="208" width="300" height="150" rx="12" fill="${C.card}" stroke="#2A2A2E"/>
  <text x="100" y="268" fill="${C.paper}" font-family="ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="68" font-weight="700">60</text>
  <text x="204" y="266" fill="${C.muted}" font-family="ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="20">/ 100</text>
  <text x="100" y="306" fill="${C.amber}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="13" letter-spacing="2">C · AVERAGE</text>
  <text x="100" y="334" fill="${C.muted}" font-family="ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="14">Public visibility score</text>
  <g transform="translate(408 208)">
    <text x="0" y="20" fill="${C.soft}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="12" letter-spacing="2">THE THREE BIGGEST VISIBILITY GAPS</text>
    <rect x="0" y="42" width="680" height="94" rx="10" fill="${C.card}" stroke="#2A2A2E"/>
    <text x="20" y="72" fill="${C.paper}" font-family="ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="19" font-weight="600">Emergency demand is effectively invisible</text>
    <text x="20" y="104" fill="${C.green}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="12" letter-spacing="1">VERIFIED</text>
    <text x="150" y="104" fill="${C.muted}" font-family="ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="13">14.3% emergency intent coverage.</text>
    <rect x="0" y="150" width="680" height="94" rx="10" fill="${C.card}" stroke="#2A2A2E"/>
    <text x="20" y="180" fill="${C.paper}" font-family="ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="19" font-weight="600">The Local Pack is thin across the market</text>
    <text x="20" y="212" fill="${C.green}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="12" letter-spacing="1">VERIFIED</text>
    <text x="150" y="212" fill="${C.muted}" font-family="ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="13">42.2% top-10 coverage; southwest weakest.</text>
    <rect x="0" y="258" width="680" height="94" rx="10" fill="${C.card}" stroke="#2A2A2E"/>
    <text x="20" y="288" fill="${C.paper}" font-family="ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="19" font-weight="600">Competitors win most service clusters</text>
    <text x="20" y="320" fill="${C.green}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="12" letter-spacing="1">VERIFIED</text>
    <text x="150" y="320" fill="${C.muted}" font-family="ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="13">Only 1 of 6 clusters meets the cohort median.</text>
  </g>
  <g transform="translate(76 500)">
    <text x="0" y="0" fill="${C.soft}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="12" letter-spacing="2">SIGNATURE VISIBILITY MATRIX</text>
    ${["plumber|Strong|Strong|Partial|Improve", "emergency plumber|Weak|Absent|Absent|Critical", "drain cleaning|Partial|Strong|Absent|Critical", "water heaters|Weak|Partial|Partial|High"].map((row, index) => {
      const [name, maps, organic, ai, opportunity] = row.split("|");
      const y = 34 + index * 48;
      return `<g transform="translate(0 ${y})">
        <text x="0" y="16" fill="${C.paper}" font-family="ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="15">${name}</text>
        <text x="230" y="16" fill="${maps === "Strong" ? C.green : maps === "Partial" ? C.amber : C.soft}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="13">${maps}</text>
        <text x="360" y="16" fill="${organic === "Strong" ? C.green : organic === "Partial" ? C.amber : C.soft}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="13">${organic}</text>
        <text x="490" y="16" fill="${ai === "Strong" ? C.green : ai === "Partial" ? C.amber : C.soft}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="13">${ai}</text>
        <text x="620" y="16" fill="${C.muted}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="13">${opportunity}</text>
      </g>`;
    }).join("")}
  </g>
  <g transform="translate(800 500)">
    <text x="0" y="0" fill="${C.soft}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="12" letter-spacing="2">SCORE BREAKDOWN</text>
    ${["Intent & Demand|15|8", "Maps & Local Pack|25|15", "Organic Search|15|8", "AI & Generative|20|16", "Competitive Share|10|4", "Authority & Entity|10|6", "Resilience|5|4"].map((row, index) => {
      const [name, max, score] = row.split("|");
      const y = 28 + index * 32;
      return `<g transform="translate(0 ${y})">
        <text x="0" y="14" fill="${C.muted}" font-family="ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="12">${name}</text>
        <text x="300" y="14" text-anchor="end" fill="${C.paper}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="14">${score} / ${max}</text>
      </g>`;
    }).join("")}
  </g>
  <text x="76" y="752" fill="${C.muted}" font-family="ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="12">Synthetic example. Not a real business. Public Mode · evidence first · owner data separate.</text>
`);

const social = svg(1280, 640, "Local Visibility Scorecard — evidence-based diagnosis across Search, Maps, and AI answers", `
  <rect width="1280" height="640" fill="${C.ink}"/>
  <rect width="1280" height="640" fill="url(#grid)"/>
  <rect width="1280" height="640" fill="url(#glow)"/>
  <text x="80" y="132" fill="${C.soft}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="16" letter-spacing="4">LOCAL VISIBILITY SCORECARD</text>
  <text x="80" y="252" fill="${C.paper}" font-family="ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="60" font-weight="700" letter-spacing="-2">Can local customers</text>
  <text x="80" y="324" fill="${C.paper}" font-family="ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="60" font-weight="700" letter-spacing="-2">discover your business?</text>
  <text x="80" y="400" fill="${C.muted}" font-family="ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="22">Search · Maps · AI answers · competitors · authority</text>
  <rect x="80" y="452" width="370" height="56" rx="8" fill="${C.red}"/>
  <text x="265" y="487" text-anchor="middle" fill="${C.ink}" font-family="ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="18" font-weight="700">Measure discovery</text>
  <text x="80" y="582" fill="${C.muted}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="13" letter-spacing="2">SYNTHETIC EXAMPLES · PUBLIC MODE · NO CREDENTIALS IN ARTIFACTS</text>
`);

const logo = svg(64, 64, "Local Visibility Scorecard", `
  <rect width="64" height="64" rx="14" fill="${C.ink}"/>
  <circle cx="32" cy="30" r="20" fill="none" stroke="${C.red}" stroke-opacity="0.3"/>
  <path d="M32 12c-8 0-14 6-14 14 0 10.5 14 26 14 26s14-15.5 14-26c0-8-6-14-14-14Z" fill="${C.red}"/>
  <circle cx="32" cy="26" r="5" fill="${C.ink}"/>
`);
const favicon = svg(32, 32, "Local Visibility Scorecard", `
  <rect width="32" height="32" rx="8" fill="${C.ink}"/>
  <path d="M16 5c-4.4 0-8 3.6-8 8 0 5.8 8 14 8 14s8-8.2 8-14c0-4.4-3.6-8-8-8Z" fill="${C.red}"/>
  <circle cx="16" cy="13" r="2.8" fill="${C.ink}"/>
`);

const sanitizeSvg = (content) =>
  content
    .replace(/&(?!(?:amp|lt|gt|quot|apos);)/g, "&amp;")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");
const files = {
  "banner.svg": banner,
  "journey.svg": journey,
  "scorecard-preview.svg": preview,
  "social-preview.svg": social,
  "logo.svg": logo,
  "favicon.svg": favicon,
};
let stale = 0;
for (const [file, content] of Object.entries(files)) {
  const out = path.join(OUT, file);
  const rendered = sanitizeSvg(content).trimStart();
  if (process.argv.includes("--check")) {
    const current = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
    if (current !== rendered) {
      console.error(`stale docs/assets/${file}`);
      stale += 1;
    } else {
      console.log(`ok docs/assets/${file}`);
    }
  } else {
    fs.writeFileSync(out, rendered, "utf8");
    console.log(`wrote docs/assets/${file}`);
  }
}
if (stale) {
  console.error(`\n${stale} stale asset(s). Run: node scripts/render_docs_assets.mjs`);
  process.exit(1);
}
if (process.argv.includes("--check")) console.log("ok: documentation assets are current");
