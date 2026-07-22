#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  emptyHistoryFile,
  formatHistoryFile,
  relativeHistoryPath,
  seedHistoryEventsFromLibrary,
  validateHistoryFile,
} from "./lib/history.mjs";
import { validateLibrary } from "./validate-data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const libraryPath = path.join(root, "public", "data", "library.json");
const historyPath = path.join(root, relativeHistoryPath);

function usage() {
  process.stderr.write("Usage: node scripts/seed-history.mjs [--force]\n");
}

const force = process.argv.includes("--force");
if (process.argv.some((arg) => arg === "--help" || arg === "-h")) {
  usage();
  process.exit(0);
}
if (process.argv.some((arg) => arg !== "--force" && arg.startsWith("-"))) {
  usage();
  process.exitCode = 1;
  process.exit();
}

if (existsSync(historyPath) && !force) {
  process.stderr.write(`${relativeHistoryPath} already exists; pass --force to overwrite\n`);
  process.exitCode = 1;
  process.exit();
}

let library;
try {
  library = JSON.parse(readFileSync(libraryPath, "utf8"));
} catch (cause) {
  process.stderr.write(`${libraryPath} is not valid JSON: ${cause.message}\n`);
  process.exitCode = 1;
  process.exit();
}

validateLibrary(library);
const events = seedHistoryEventsFromLibrary(library);
const history = validateHistoryFile({ ...emptyHistoryFile(), events });
const tempPath = `${historyPath}.tmp-${process.pid}`;
writeFileSync(tempPath, formatHistoryFile(history), { encoding: "utf8", mode: 0o644, flag: "wx" });
renameSync(tempPath, historyPath);
process.stdout.write(`Seeded ${events.length} history event(s) → ${relativeHistoryPath}\n`);
