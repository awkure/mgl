#!/usr/bin/env node

/**
 * Import profile Steam screenshots + community videos into one game's «Медиа Steam» note.
 *
 * Media comes from IPublishedFileService/GetUserFiles for STEAM_PROFILE_ID
 * (screenshots filetype=4, videos filetype=3). Optional --prefill uses storefront appdetails.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  getAppDetails,
  getUserScreenshots,
  getUserVideos,
  resolveSteamId,
  withRetry,
} from "./lib/steamApi.mjs";
import { fetchAndEncodeSteamCover } from "./lib/steamCover.mjs";
import {
  buildMediaNotePatchFragment,
  importSteamMediaForGame,
  listLibraryGamesWithSteamAppId,
  mergePatchFragments,
  validateMediaTargetFlags,
} from "./lib/steamMediaImport.mjs";
import { applyPatch } from "./publish-patch.mjs";
import { computeRevision, externalAssetPath } from "./validate-data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MISSING_VALUE_HASH = "0".repeat(64);
const libraryPath = path.join(root, "public", "data", "library.json");

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

const { prefillGameFromSteamDetails } = await import(
  pathToFileURL(path.join(root, "src/domain/steamMedia.ts")).href,
);
const { findGameBySteamAppId, parseSteamProfileInput } = await import(
  pathToFileURL(path.join(root, "src/domain/steamIdentity.ts")).href,
);
const { canonicalHash } = await import(pathToFileURL(path.join(root, "src/domain/canonical.ts")).href);

function parseArgs(argv) {
  const flags = {
    appid: null,
    gameId: null,
    profile: null,
    out: null,
    dryRun: false,
    apply: false,
    prefill: false,
    noVideoThumbs: false,
    outExplicit: false,
    all: false,
    help: false,
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
    else if (arg === "--prefill") flags.prefill = true;
    else if (arg === "--all") flags.all = true;
    else if (arg === "--no-video-thumbs" || arg === "--no-trailer-thumbs") flags.noVideoThumbs = true;
    else if (arg === "--appid") flags.appid = Number(next());
    else if (arg === "--game-id") flags.gameId = next();
    else if (arg === "--profile") flags.profile = next();
    else if (arg === "--out") {
      flags.out = next();
      flags.outExplicit = true;
    } else if (arg === "--help" || arg === "-h") flags.help = true;
    else throw new Error(`Unknown flag: ${arg}`);
  }
  if (flags.appid != null && (!Number.isSafeInteger(flags.appid) || flags.appid <= 0)) {
    throw new Error("--appid must be a positive integer");
  }
  if (flags.apply && flags.dryRun) throw new Error("Use either --apply or --dry-run, not both");
  if (!flags.outExplicit) {
    if (flags.apply) {
      flags.out = null;
    } else if (flags.all) {
      flags.out = "steam-media-import-all.patch.json";
    } else {
      flags.out = "steam-media-import.patch.json";
    }
  }
  return flags;
}

function usage() {
  console.log(`Usage: npm run import:steam-media -- [flags]

Flags:
  --all                       every library game with steamAppId (mutually exclusive with --appid/--game-id)
  --appid <n>                 Steam app id (required with --game-id if game has no appid)
  --game-id <uuid>            Target library game
  --profile <url|id|vanity>   default: STEAM_PROFILE_ID from env
  --out <path>                write patch JSON (default steam-media-import.patch.json, or steam-media-import-all.patch.json with --all, unless --apply)
  --apply                     write note+assets into public/data + public/media
  --dry-run                   profile screenshot + video counts only; no downloads or writes
  --prefill                   empty-only title/tags/cover/platforms/steamAppId from storefront (one game only)
  --no-video-thumbs           skip profile video preview downloads
                              (alias: --no-trailer-thumbs)

Requires STEAM_WEB_API_KEY and STEAM_PROFILE_ID (or --profile) in .env / .env.local.
Media: published profile screenshots + videos only (not storefront marketing).
Per-item encode failures are skipped (best-effort); API failures for a game abort one-game mode or skip in --all.`);
}

function resolveTarget(library, flags) {
  let game = null;
  if (flags.gameId) {
    game = library.games?.[flags.gameId] ?? null;
    if (!game) throw new Error(`Game not found: ${flags.gameId}`);
  }

  if (flags.appid && game) {
    if (game.steamAppId != null && game.steamAppId !== flags.appid) {
      throw new Error(`Game steamAppId ${game.steamAppId} does not match --appid ${flags.appid}`);
    }
  }

  if (!game && flags.appid) {
    game = findGameBySteamAppId(library.games ?? {}, flags.appid);
    if (!game) throw new Error(`No library game with steamAppId ${flags.appid}`);
  }

  const appid = flags.appid ?? game.steamAppId;
  if (appid == null || !Number.isSafeInteger(appid) || appid <= 0) {
    throw new Error("Could not resolve Steam appid; pass --appid or set steamAppId on the game");
  }

  return { game, appid };
}

function applyAndWrite(library, patch) {
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
  return next;
}

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

try {
  validateMediaTargetFlags(flags);
} catch (reason) {
  console.error(reason instanceof Error ? reason.message : String(reason));
  usage();
  process.exit(2);
}

const apiKey = process.env.STEAM_WEB_API_KEY?.trim();
if (!apiKey) {
  console.error("STEAM_WEB_API_KEY is missing. Add it to .env.local (Node-only).");
  process.exit(1);
}

const profileInput = (flags.profile ?? process.env.STEAM_PROFILE_ID ?? "").trim();
if (!profileInput) {
  console.error("Pass --profile or set STEAM_PROFILE_ID.");
  process.exit(1);
}

if (!existsSync(libraryPath)) {
  console.error(`Missing ${libraryPath}`);
  process.exit(1);
}

const library = JSON.parse(readFileSync(libraryPath, "utf8"));

try {
  const ref = parseSteamProfileInput(profileInput);
  const steamid = await resolveSteamId(apiKey, ref);
  console.log(`steamid64: ${steamid}`);

  const now = new Date().toISOString();

  if (flags.all) {
    const targets = listLibraryGamesWithSteamAppId(library);
    if (!targets.length) {
      console.log(JSON.stringify({ all: true, games: 0, message: "no games with steamAppId" }));
      process.exit(0);
    }

    let working = library;
    const failedGames = [];
    const summaries = [];
    const transactionId = `steam-media-all-${now}`;
    let combinedPatch = {
      patchVersion: 2,
      schemaVersion: 2,
      baseRevision: library.revision || computeRevision(library),
      operations: {},
      blobs: {},
    };

    for (const { game, appid } of targets) {
      console.log(`media ${game.title} (${game.id}) appid=${appid}`);
      const result = await importSteamMediaForGame({
        apiKey,
        steamid,
        library: working,
        game,
        appid,
        now,
        noVideoThumbs: flags.noVideoThumbs,
      });
      if (!result.ok) {
        failedGames.push({ gameId: game.id, appid, error: result.error });
        console.warn(`skip game ${game.id}: ${result.error}`);
        continue;
      }
      const fragment = buildMediaNotePatchFragment({
        result,
        now,
        transactionId,
        existingAssetIds: new Set(Object.keys(working.assets ?? {})),
        libraryAssets: working.assets ?? {},
      });

      if (flags.apply) {
        const mini = {
          patchVersion: 2,
          schemaVersion: 2,
          baseRevision: working.revision || computeRevision(working),
          operations: fragment.operations,
          blobs: fragment.blobs,
        };
        working = applyAndWrite(working, mini);
      } else {
        combinedPatch = mergePatchFragments(combinedPatch, fragment);
        working = applyPatch(working, {
          patchVersion: 2,
          schemaVersion: 2,
          baseRevision: working.revision || "",
          operations: fragment.operations,
          blobs: {},
        });
      }
      summaries.push({
        gameId: game.id,
        appid,
        screenshotsEncoded: result.screenshotsEncoded,
        skipped: result.skipped.length,
        videos: result.videos,
      });
    }

    if (flags.out && !flags.apply) {
      writeFileSync(path.resolve(root, flags.out), `${JSON.stringify(combinedPatch, null, 2)}\n`);
    }

    console.log(
      JSON.stringify({
        all: true,
        games: summaries.length,
        failedGames,
        summaries,
        applied: flags.apply,
      }),
    );
    process.exit(0);
  }

  const { game, appid } = resolveTarget(library, flags);
  console.log(`game: ${game.title} (${game.id}) appid=${appid}`);

  if (flags.dryRun) {
    const screenshots = await withRetry(() => getUserScreenshots(apiKey, steamid, appid));
    const videos = await withRetry(() => getUserVideos(apiKey, steamid, appid));
    console.log(
      JSON.stringify({
        dryRun: true,
        appid,
        gameId: game.id,
        steamid,
        screenshots: screenshots.length,
        videos: videos.length,
        prefill: flags.prefill,
        noVideoThumbs: flags.noVideoThumbs,
      }),
    );
    process.exit(0);
  }

  let details = null;
  if (flags.prefill) {
    details = await withRetry(() => getAppDetails(appid, { language: "russian" }));
    if (!details) {
      console.error(`No storefront data for appid ${appid}`);
      process.exit(1);
    }
  }

  const result = await importSteamMediaForGame({
    apiKey,
    steamid,
    library,
    game,
    appid,
    now,
    noVideoThumbs: flags.noVideoThumbs,
  });

  if (!result.ok) {
    console.error(result.error);
    process.exit(1);
  }

  let coverEncoded = null;
  let nextGame = null;
  const previousGame = game;
  if (flags.prefill && details) {
    if (game.coverAssetId == null && details.headerImage) {
      coverEncoded = await fetchAndEncodeSteamCover(appid, {
        headerImage: details.headerImage,
        alt: details.name ?? game.title,
      });
    }
    const prefillPatch = prefillGameFromSteamDetails(game, details, {
      appid,
      coverAssetId: coverEncoded?.asset.id ?? null,
    });
    if (Object.keys(prefillPatch).length > 0) {
      nextGame = { ...game, ...prefillPatch, updatedAt: now };
    }
  }

  const transactionId = `steam-media-${now}`;
  const existingAssetIds = new Set(Object.keys(library.assets ?? {}));
  const baseRevision = library.revision || computeRevision(library);
  const fragment = buildMediaNotePatchFragment({
    result,
    now,
    transactionId,
    existingAssetIds,
    libraryAssets: library.assets ?? {},
  });

  const operations = { ...fragment.operations };
  const blobs = { ...fragment.blobs };

  if (coverEncoded) {
    const row = coverEncoded;
    const existed = existingAssetIds.has(row.asset.id);
    operations[`/assets/${row.asset.id}`] = {
      operation: "set",
      value: row.asset,
      baseExists: existed,
      baseHash: existed ? canonicalHash(library.assets[row.asset.id]) : MISSING_VALUE_HASH,
      changedAt: now,
      transactionId,
    };
    blobs[row.asset.id] = row.base64;
  }

  if (nextGame && previousGame) {
    operations[`/games/${nextGame.id}`] = {
      operation: "set",
      value: nextGame,
      baseExists: true,
      baseHash: canonicalHash(previousGame),
      changedAt: now,
      transactionId,
    };
  }

  const patch = {
    patchVersion: 2,
    schemaVersion: 2,
    baseRevision,
    operations,
    blobs,
  };

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
    applyAndWrite(library, patch);
  }

  const videoThumbCount = result.encodedAssets.length - result.screenshotsEncoded;
  console.log(
    JSON.stringify({
      appid,
      gameId: game.id,
      steamid,
      mediaNoteId: result.mediaNote.id,
      createdNote: !result.mediaNoteExisted,
      screenshots: result.screenshotsRequested,
      videos: result.videos,
      videoThumbs: videoThumbCount,
      prefillApplied: Boolean(nextGame),
      operations: Object.keys(patch.operations).length,
      blobs: Object.keys(patch.blobs).length,
      applied: flags.apply,
      baseRevision,
    }),
  );
} catch (reason) {
  console.error(reason instanceof Error ? reason.message : String(reason));
  process.exit(1);
}
