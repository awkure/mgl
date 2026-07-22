#!/usr/bin/env node

/**
 * Refresh Steam covers for existing library games (coverAssetId only).
 *
 * Usage:
 *   npm run import:steam-covers -- [flags]
 *   just steam-import-covers-via-patch --limit 5
 *   just steam-import-covers --limit 5
 *
 * Flags:
 *   --out <path>       patch JSON (default steam-covers.patch.json unless --apply)
 *   --apply            write public/data/library.json + public/media
 *   --dry-run          counts only; no fetch / no write
 *   --force            ignore steamOverrides.coverAssetId
 *   --limit <n>
 *   --appids <a,b,c>
 *   --game-id <uuid>
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fetchAndEncodeSteamCover } from "./lib/steamCover.mjs";
import { pruneUnreferencedMediaFiles } from "./lib/pruneUnreferencedMedia.mjs";
import { applyPatch } from "./publish-patch.mjs";
import { computeRevision, externalAssetPath } from "./validate-data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const libraryPath = path.join(root, "public", "data", "library.json");

function loadEnvLocal() {
  const envPath = path.join(root, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = value;
  }
}

function parseArgs(argv) {
  const flags = {
    apply: false,
    dryRun: false,
    force: false,
    out: null,
    outExplicit: false,
    limit: null,
    appids: null,
    gameId: null,
    help: false,
  };
  const args = [...argv];
  const next = () => {
    if (!args.length) throw new Error("Missing value for flag");
    return args.shift();
  };
  while (args.length) {
    const arg = args.shift();
    if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--apply") flags.apply = true;
    else if (arg === "--force") flags.force = true;
    else if (arg === "--out") {
      flags.out = next();
      flags.outExplicit = true;
    } else if (arg === "--limit") flags.limit = Number(next());
    else if (arg === "--appids") {
      flags.appids = next().split(",").map((part) => Number(part.trim())).filter((n) => Number.isSafeInteger(n) && n > 0);
    } else if (arg === "--game-id") flags.gameId = next();
    else if (arg === "--help" || arg === "-h") flags.help = true;
    else throw new Error(`Unknown flag: ${arg}`);
  }
  if (flags.limit != null && (!Number.isSafeInteger(flags.limit) || flags.limit < 0)) {
    throw new Error("--limit must be a non-negative integer");
  }
  if (flags.apply && flags.dryRun) throw new Error("Use either --apply or --dry-run, not both");
  if (flags.gameId && flags.appids) throw new Error("Use either --game-id or --appids, not both");
  if (!flags.outExplicit) {
    flags.out = flags.apply ? null : "steam-covers.patch.json";
  }
  return flags;
}

function printHelp() {
  console.log(`Usage: npm run import:steam-covers -- [flags]

Flags:
  --out <path>       write patch JSON (default steam-covers.patch.json unless --apply)
  --apply            write covers into public/data + public/media
  --dry-run          counts only; no fetch / no write
  --force            ignore steamOverrides.coverAssetId
  --limit <n>
  --appids <a,b,c>
  --game-id <uuid>`);
}

loadEnvLocal();

let flags;
try {
  flags = parseArgs(process.argv.slice(2));
} catch (reason) {
  console.error(reason instanceof Error ? reason.message : String(reason));
  printHelp();
  process.exit(2);
}

if (flags.help) {
  printHelp();
  process.exit(0);
}

try {
  if (!existsSync(libraryPath)) throw new Error(`Missing library at ${libraryPath}`);
  const library = JSON.parse(readFileSync(libraryPath, "utf8"));
  if (flags.gameId && !library.games?.[flags.gameId]) {
    throw new Error(`Game not found: ${flags.gameId}`);
  }

  const {
    selectSteamCoverTargets,
    steamCoverRefreshAction,
    withSteamCover,
  } = await import(pathToFileURL(path.join(root, "src/domain/steamCovers.ts")).href);

  const targets = selectSteamCoverTargets(library.games ?? {}, {
    appids: flags.appids ?? undefined,
    gameId: flags.gameId ?? undefined,
    limit: flags.limit ?? undefined,
  });

  if (flags.dryRun) {
    console.log(JSON.stringify({
      targets: targets.length,
      dryRun: true,
    }));
    process.exit(0);
  }

  const { buildSteamUpsertPatch } = await import(pathToFileURL(path.join(root, "src/domain/steamReimport.ts")).href);

  const now = new Date().toISOString();
  let skippedLocked = 0;
  let unchanged = 0;
  let coversFailed = 0;
  const patchItems = [];

  for (let index = 0; index < targets.length; index += 1) {
    const game = targets[index];
    const appid = game.steamAppId;
    process.stdout.write(`covers ${index + 1}/${targets.length} appid=${appid}\r`);

    if (!flags.force && game.steamOverrides?.coverAssetId) {
      skippedLocked += 1;
      continue;
    }

    let cover = null;
    try {
      cover = await fetchAndEncodeSteamCover(appid, { alt: game.title });
    } catch (reason) {
      coversFailed += 1;
      console.warn(`\ncover failed for ${appid}: ${reason instanceof Error ? reason.message : reason}`);
      continue;
    }
    if (!cover) {
      coversFailed += 1;
      continue;
    }

    const action = steamCoverRefreshAction(game, cover.asset.id, { force: flags.force });
    if (action === "unchanged") {
      unchanged += 1;
      continue;
    }

    const nextGame = withSteamCover(game, cover.asset.id, now);
    patchItems.push({
      kind: "update",
      game: nextGame,
      previousGame: game,
      cover,
    });
  }
  if (targets.length) process.stdout.write("\n");

  const updated = patchItems.length;
  const baseRevision = library.revision || computeRevision(library);
  const patch = buildSteamUpsertPatch(baseRevision, patchItems, {
    now,
    transactionId: `steam-covers-${now}`,
  });

  for (const [id, base64] of Object.entries(patch.blobs)) {
    if (!patch.operations[`/assets/${id}`]) throw new Error(`Orphan blob ${id}`);
    if (typeof base64 !== "string" || !base64) throw new Error(`Empty blob ${id}`);
  }

  if (flags.out) {
    const outPath = path.resolve(root, flags.out);
    writeFileSync(outPath, `${JSON.stringify(patch, null, 2)}\n`);
    console.log(`wrote patch ${outPath}`);
  }

  if (flags.apply) {
    const mediaRoot = path.join(root, "public", "media");
    mkdirSync(mediaRoot, { recursive: true });
    const next = applyPatch(library, patch);
    for (const [id, base64] of Object.entries(patch.blobs)) {
      const asset = next.assets[id];
      if (!asset) throw new Error(`Applied library missing asset ${id}`);
      const filePath = externalAssetPath(mediaRoot, id, asset);
      const bytes = Buffer.from(base64, "base64");
      if (existsSync(filePath)) {
        const existing = readFileSync(filePath);
        if (!existing.equals(bytes)) throw new Error(`Media collision for ${id}`);
      } else {
        writeFileSync(filePath, bytes, { mode: 0o644, flag: "wx" });
      }
    }
    const pruned = pruneUnreferencedMediaFiles(mediaRoot, next.assets);
    writeFileSync(libraryPath, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`applied to ${libraryPath} (+ ${Object.keys(patch.blobs).length} media, pruned ${pruned})`);
  }

  console.log(JSON.stringify({
    targets: targets.length,
    updated,
    skippedLocked,
    unchanged,
    coversFailed,
    operations: Object.keys(patch.operations).length,
    blobs: Object.keys(patch.blobs).length,
    applied: flags.apply,
    baseRevision,
  }));
} catch (reason) {
  console.error(reason instanceof Error ? reason.message : String(reason));
  process.exit(1);
}
