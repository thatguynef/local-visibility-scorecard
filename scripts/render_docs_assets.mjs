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
    <rect width="44" height="44" rx="10" fill="${C.card}" stroke="#2A2A2E"/>
    <path d="M12 30 A 12 12 0 0 1 32 30" fill="none" stroke="${C.red}" stroke-width="5" stroke-linecap="round"/>
    <path d="M12 30 A 12 12 0 0 1 18 20" fill="none" stroke="${C.paper}" stroke-width="5" stroke-linecap="round"/>
    <circle cx="22" cy="30" r="2.5" fill="${C.paper}"/>
    <path d="M22 30 L28 23" stroke="${C.paper}" stroke-width="2.5" stroke-linecap="round"/>
  </g>
  <text x="126" y="94" fill="${C.soft}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="15" letter-spacing="4">LOCAL VISIBILITY SCORECARD</text>
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

const social = svg(1200, 630, "Local Visibility Scorecard — evidence-based diagnosis across Search, Maps, and AI answers", `
  <rect width="1200" height="630" fill="${C.ink}"/>
  <rect width="1200" height="630" fill="url(#grid)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <text x="72" y="120" fill="${C.soft}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="16" letter-spacing="4">LOCAL VISIBILITY SCORECARD</text>
  <text x="72" y="240" fill="${C.paper}" font-family="ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="64" font-weight="700" letter-spacing="-2">Can local customers</text>
  <text x="72" y="316" fill="${C.paper}" font-family="ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="64" font-weight="700" letter-spacing="-2">discover your business?</text>
  <text x="72" y="392" fill="${C.muted}" font-family="ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="22">100 points · 7 categories · evidence states · discovery first</text>
  <rect x="72" y="440" width="310" height="54" rx="8" fill="${C.red}"/>
  <text x="227" y="474" text-anchor="middle" fill="${C.ink}" font-family="ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="18" font-weight="700">Measure discovery</text>
  <text x="72" y="552" fill="${C.muted}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="13" letter-spacing="2">SYNTHETIC EXAMPLES · PUBLIC MODE · NO CREDENTIALS IN ARTIFACTS</text>
`);

const logo = svg(64, 64, "Local Visibility Scorecard", `
  <rect width="64" height="64" rx="15" fill="${C.ink}"/>
  <rect x="0.75" y="0.75" width="62.5" height="62.5" rx="14.25" fill="none" stroke="#2A2A2E" stroke-width="1.5"/>
  <path d="M17 42 A 15 15 0 0 1 47 42" fill="none" stroke="#2A2A2E" stroke-width="6" stroke-linecap="round"/>
  <path d="M17 42 A 15 15 0 0 1 39.5 29" fill="none" stroke="${C.red}" stroke-width="6" stroke-linecap="round"/>
  <circle cx="32" cy="42" r="3" fill="${C.paper}"/>
  <path d="M32 42 L39 33" stroke="${C.paper}" stroke-width="3" stroke-linecap="round"/>
`);
const favicon = svg(32, 32, "Local Visibility Scorecard", `
  <rect width="32" height="32" rx="7" fill="${C.red}"/>
  <path d="M8.5 21 A 7.5 7.5 0 0 1 23.5 21" fill="none" stroke="${C.ink}" stroke-opacity="0.28" stroke-width="3" stroke-linecap="round"/>
  <path d="M8.5 21 A 7.5 7.5 0 0 1 19.75 14.5" fill="none" stroke="${C.paper}" stroke-width="3" stroke-linecap="round"/>
  <circle cx="16" cy="21" r="1.5" fill="${C.paper}"/>
  <path d="M16 21 L19.5 16.5" stroke="${C.paper}" stroke-width="1.5" stroke-linecap="round"/>
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
