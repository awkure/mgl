#!/usr/bin/env node

/**
 * Import owned Steam games into a V2 OperationPatch and/or published library.
 *
 * Usage:
 *   npm run import:steam -- [flags]
 *   just steam-import-via-patch --limit 5   # patch file only
 *   just steam-import --limit 5            # apply into public/data + media
 *
 * Flags:
 *   --profile <url|id|vanity>   default: STEAM_PROFILE_ID from env
 *   --out <path>                write patch JSON (default steam-import.patch.json unless --apply)
 *   --apply                     write into public/data/library.json + public/media
 *   --dry-run                   print candidates; no covers / no writes
 *   --played-only               only playtime_forever > 0
 *   --limit <n>                 max games after name/dedup filters
 *   --appids <a,b,c>            allowlist
 *   --no-covers                 skip cover download/encode
 *   --skip-details              skip storefront appdetails (no genres/type filter)
 */

import { randomUUID } from "node:crypto";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createThrottle,
  getAppDetails,
  getOwnedGames,
  resolveSteamId,
  SteamApiError,
  withRetry,
} from "./lib/steamApi.mjs";
import { fetchAndEncodeSteamCover } from "./lib/steamCover.mjs";
import { applyPatch } from "./publish-patch.mjs";
import { computeRevision, externalAssetPath } from "./validate-data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(path.join(root, ".env"));
loadEnvFile(path.join(root, ".env.local"));

function parseArgs(argv) {
  const flags = {
    profile: null,
    out: null,
    dryRun: false,
    apply: false,
    playedOnly: false,
    limit: null,
    appids: null,
    noCovers: false,
    skipDetails: false,
    outExplicit: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
      i += 1;
      return value;
    };
    if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--apply") flags.apply = true;
    else if (arg === "--played-only") flags.playedOnly = true;
    else if (arg === "--no-covers") flags.noCovers = true;
    else if (arg === "--skip-details") flags.skipDetails = true;
    else if (arg === "--profile") flags.profile = next();
    else if (arg === "--out") {
      flags.out = next();
      flags.outExplicit = true;
    } else if (arg === "--limit") flags.limit = Number(next());
    else if (arg === "--appids") {
      flags.appids = next().split(",").map((part) => Number(part.trim())).filter((n) => Number.isSafeInteger(n) && n > 0);
    } else if (arg === "--help" || arg === "-h") flags.help = true;
    else throw new Error(`Unknown flag: ${arg}`);
  }
  if (flags.limit != null && (!Number.isSafeInteger(flags.limit) || flags.limit < 0)) {
    throw new Error("--limit must be a non-negative integer");
  }
  if (flags.apply && flags.dryRun) throw new Error("Use either --apply or --dry-run, not both");
  if (!flags.outExplicit) {
    flags.out = flags.apply ? null : "steam-import.patch.json";
  }
  return flags;
}

function usage() {
  console.log(`Usage: npm run import:steam -- [flags]

Flags:
  --profile <url|id|vanity>   default: STEAM_PROFILE_ID
  --out <path>                write patch JSON (default steam-import.patch.json unless --apply)
  --apply                     write games+covers into public/data + public/media (no git commit)
  --dry-run                   candidates only
  --played-only
  --limit <n>
  --appids <a,b,c>
  --no-covers
  --skip-details`);
}

const {
  parseSteamProfileInput,
} = await import(pathToFileURL(path.join(root, "src/domain/steamIdentity.ts")).href);
const {
  buildSteamImportPatch,
  filterSteamImportCandidates,
  mapSteamCandidateToGame,
  rejectExcludedTypes,
} = await import(pathToFileURL(path.join(root, "src/domain/steamImport.ts")).href);

let flags;
try {
  flags = parseArgs(process.argv.slice(2));
} catch (reason) {
  console.error(reason instanceof Error ? reason.message : String(reason));
  usage();
  process.exit(2);
}

if (flags.help) {
  usage();
  process.exit(0);
}

const apiKey = process.env.STEAM_WEB_API_KEY?.trim();
if (!apiKey) {
  console.error("STEAM_WEB_API_KEY is missing. Add it to .env.local (Node-only).");
  process.exit(2);
}

const profileInput = (flags.profile ?? process.env.STEAM_PROFILE_ID ?? "").trim();
if (!profileInput) {
  console.error("Pass --profile or set STEAM_PROFILE_ID.");
  process.exit(2);
}

const libraryPath = path.join(root, "public", "data", "library.json");
if (!existsSync(libraryPath)) {
  console.error(`Missing ${libraryPath}`);
  process.exit(1);
}
const library = JSON.parse(readFileSync(libraryPath, "utf8"));

try {
  const ref = parseSteamProfileInput(profileInput);
  const steamid = await resolveSteamId(apiKey, ref);
  console.log(`steamid64: ${steamid}`);

  const owned = await getOwnedGames(apiKey, steamid, {
    includeAppInfo: true,
    includePlayedFreeGames: true,
  });
  if (!owned.visible) {
    console.error("Библиотека скрыта. Privacy → Game details → Public.");
    process.exit(1);
  }
  console.log(`owned: ${owned.gameCount}`);

  let { candidates, fetched, skippedDuplicate, skippedFilter } = filterSteamImportCandidates(
    owned.games,
    {
      existingGames: library.games ?? {},
      playedOnly: flags.playedOnly,
      appids: flags.appids ?? undefined,
      limit: flags.limit ?? undefined,
    },
  );
  console.log(
    `after filter: ${candidates.length} (fetched ${fetched}, skip dup ${skippedDuplicate}, skip filter ${skippedFilter})`,
  );

  const throttle = createThrottle(1500);
  let coversFailed = 0;
  let typeSkipped = 0;

  if (!flags.skipDetails && !flags.dryRun) {
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      process.stdout.write(`details ${index + 1}/${candidates.length} appid=${candidate.appid}\r`);
      await throttle();
      try {
        const details = await withRetry(() => getAppDetails(candidate.appid, { language: "russian" }));
        candidate.details = details;
        if (details?.name) candidate.name = details.name;
      } catch (reason) {
        console.warn(`\ndetails failed for ${candidate.appid}: ${reason instanceof Error ? reason.message : reason}`);
        candidate.details = null;
      }
    }
    process.stdout.write("\n");
    const rejected = rejectExcludedTypes(candidates);
    candidates = rejected.kept;
    typeSkipped = rejected.skippedFilter;
    skippedFilter += typeSkipped;
    console.log(`after type filter: ${candidates.length} (type skip ${typeSkipped})`);
  }

  if (flags.dryRun) {
    for (const candidate of candidates) {
      console.log(
        `- ${candidate.appid}\t${candidate.name}\tforever=${candidate.playtime_forever}\t2w=${candidate.playtime_2weeks}`,
      );
    }
    console.log(`dry-run complete: ${candidates.length} candidates`);
    process.exit(0);
  }

  const now = new Date().toISOString();
  const items = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    let cover = null;
    if (!flags.noCovers) {
      process.stdout.write(`covers ${index + 1}/${candidates.length} appid=${candidate.appid}\r`);
      try {
        cover = await fetchAndEncodeSteamCover(candidate.appid, {
          headerImage: candidate.details?.headerImage ?? null,
          alt: candidate.name,
        });
        if (!cover) coversFailed += 1;
      } catch (reason) {
        coversFailed += 1;
        console.warn(`\ncover failed for ${candidate.appid}: ${reason instanceof Error ? reason.message : reason}`);
        cover = null;
      }
    }
    const game = mapSteamCandidateToGame({
      id: randomUUID(),
      appid: candidate.appid,
      name: candidate.name,
      genres: candidate.details?.genres ?? [],
      playtimeForever: candidate.playtime_forever,
      playtime2Weeks: candidate.playtime_2weeks,
      rtimeLastPlayed: candidate.rtime_last_played,
      coverAssetId: cover?.asset.id ?? null,
      now,
      rankIndex: index,
    });
    items.push({ game, cover });
  }
  if (!flags.noCovers) process.stdout.write("\n");

  const baseRevision = library.revision || computeRevision(library);
  const patch = buildSteamImportPatch(baseRevision, items, { now });
  if (
    patch.patchVersion !== 2
    || typeof patch.baseRevision !== "string"
    || typeof patch.operations !== "object"
    || patch.operations === null
    || Array.isArray(patch.operations)
  ) {
    throw new Error("Built patch is malformed");
  }
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
    writeFileSync(libraryPath, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`applied to ${libraryPath} (+ ${Object.keys(patch.blobs).length} media)`);
  }

  console.log(
    JSON.stringify({
      fetched,
      skippedDuplicate,
      skippedFilter,
      written: items.length,
      coversFailed,
      operations: Object.keys(patch.operations).length,
      blobs: Object.keys(patch.blobs).length,
      applied: flags.apply,
      baseRevision,
    }),
  );
} catch (reason) {
  console.error(reason instanceof Error ? reason.message : String(reason));
  process.exit(reason instanceof SteamApiError ? 1 : 1);
}
