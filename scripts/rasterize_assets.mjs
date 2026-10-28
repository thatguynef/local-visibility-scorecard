#!/usr/bin/env node
/**
 * Rasterize the canonical documentation SVGs into the GitHub/social PNGs.
 *
 * The SVGs are the source of truth:
 *   docs/assets/scorecard-preview.svg -> docs/assets/scorecard-preview.png (1200x820)
 *   docs/assets/social-preview.svg    -> docs/assets/social-preview.png    (1200x630)
 *
 * Chrome is used only for local rasterization. The assets are synthetic.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = path.join(ROOT, "docs", "assets");
const HELP = `Local Visibility Scorecard — report asset rasterizer

Usage:
  node scripts/render_docs_assets.mjs [--help]

Rasterizes:
  docs/assets/scorecard-preview.svg -> docs/assets/scorecard-preview.png (1200x820)
  docs/assets/social-preview.svg    -> docs/assets/social-preview.png    (1200x630)

Requires Chrome or Chromium. Set CHROME_PATH to override.
The sources are synthetic; never point this at a real client report.
`;

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(HELP);
  process.exit(0);
}

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    console.error("error: Chrome/Chromium not found. Set CHROME_PATH.");
    process.exit(1);
  }
  return found;
}

const chrome = chromePath();
const jobs = [
  ["scorecard-preview.svg", "scorecard-preview.png", 1200, 820],
  ["social-preview.svg", "social-preview.png", 1200, 630],
];

for (const [source, target, width, height] of jobs) {
  const sourcePath = path.join(ASSETS, source);
  const targetPath = path.join(ASSETS, target);
  if (!fs.existsSync(sourcePath)) {
    console.error(`error: missing source ${path.relative(ROOT, sourcePath)}`);
    process.exit(1);
  }
  const temporary = path.join(ASSETS, `.${target}.tmp.png`);
  execFileSync(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      `--window-size=${width},${height}`,
      `--screenshot=${temporary}`,
      pathToFileURL(sourcePath).href,
    ],
    { stdio: "ignore" },
  );
  fs.renameSync(temporary, targetPath);
  console.log(`wrote docs/assets/${target} (${width}x${height})`);
}
