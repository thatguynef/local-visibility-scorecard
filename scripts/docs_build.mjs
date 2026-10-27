#!/usr/bin/env node
/** Run MkDocs with the local docs venv when available. */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const localPython = path.join(process.cwd(), ".venv-docs", "bin", "python");
const python = fs.existsSync(localPython) ? localPython : "python3";
const args = ["-m", "mkdocs", ...process.argv.slice(2)];
const result = spawnSync(python, args, { stdio: "inherit" });
if (result.error) {
  console.error(`error: could not start MkDocs: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
