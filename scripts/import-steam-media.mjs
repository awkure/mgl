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
import { fetchAndEncodeSteamImage } from "./lib/steamImage.mjs";
import { applyPatch } from "./publish-patch.mjs";
import { computeRevision, externalAssetPath } from "./validate-data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MISSING_VALUE_HASH = "0".repeat(64);

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

const {
  buildSteamMediaAttachments,
  isSteamMediaNote,
  prefillGameFromSteamDetails,
  upsertSteamMediaNote,
} = await import(pathToFileURL(path.join(root, "src/domain/steamMedia.ts")).href);
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
    flags.out = flags.apply ? null : "steam-media-import.patch.json";
  }
  return flags;
}

function usage() {
  console.log(`Usage: npm run import:steam-media -- [flags]

Flags:
  --appid <n>                 Steam app id (required with --game-id if game has no appid)
  --game-id <uuid>            Target library game
  --profile <url|id|vanity>   default: STEAM_PROFILE_ID from env
  --out <path>                write patch JSON (default steam-media-import.patch.json unless --apply)
  --apply                     write note+assets into public/data + public/media
  --dry-run                   profile screenshot + video counts only; no downloads or writes
  --prefill                   empty-only title/tags/cover/platforms/steamAppId from storefront
  --no-video-thumbs           skip profile video preview downloads
                              (alias: --no-trailer-thumbs)

Requires STEAM_WEB_API_KEY and STEAM_PROFILE_ID (or --profile) in .env / .env.local.
Media: published profile screenshots + videos only (not storefront marketing).`);
}

function resolveTarget(library, flags) {
  if (!flags.appid && !flags.gameId) {
    throw new Error("Pass --appid and/or --game-id");
  }

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

function buildMediaImportPatch(input) {
  const {
    now,
    transactionId,
    encodedAssets,
    mediaNote,
    mediaNoteExisted,
    previousNote,
    nextGame,
    previousGame,
    existingAssetIds,
    libraryAssets,
    baseRevision,
  } = input;

  const operations = {};
  const blobs = {};

  for (const row of encodedAssets) {
    const existed = existingAssetIds.has(row.asset.id);
    operations[`/assets/${row.asset.id}`] = {
      operation: "set",
      value: row.asset,
      baseExists: existed,
      baseHash: existed ? canonicalHash(libraryAssets[row.asset.id]) : MISSING_VALUE_HASH,
      changedAt: now,
      transactionId,
    };
    blobs[row.asset.id] = row.base64;
  }

  operations[`/notes/${mediaNote.id}`] = {
    operation: "set",
    value: mediaNote,
    baseExists: mediaNoteExisted,
    baseHash: mediaNoteExisted && previousNote ? canonicalHash(previousNote) : MISSING_VALUE_HASH,
    changedAt: now,
    transactionId,
  };

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

  return {
    patchVersion: 2,
    schemaVersion: 2,
    baseRevision,
    operations,
    blobs,
  };
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

  const { game, appid } = resolveTarget(library, flags);
  console.log(`game: ${game.title} (${game.id}) appid=${appid}`);

  const screenshots = await withRetry(() => getUserScreenshots(apiKey, steamid, appid));
  const videos = await withRetry(() => getUserVideos(apiKey, steamid, appid));

  let details = null;
  if (flags.prefill) {
    details = await withRetry(() => getAppDetails(appid, { language: "russian" }));
    if (!details) {
      console.error(`No storefront data for appid ${appid}`);
      process.exit(1);
    }
  }

  const screenshotCount = screenshots.length;
  const videoCount = videos.length;

  if (flags.dryRun) {
    console.log(
      JSON.stringify({
        dryRun: true,
        appid,
        gameId: game.id,
        steamid,
        screenshots: screenshotCount,
        videos: videoCount,
        prefill: flags.prefill,
        noVideoThumbs: flags.noVideoThumbs,
      }),
    );
    process.exit(0);
  }

  /** @type {{ asset: object; base64: string }[]} */
  const encodedAssets = [];

  for (let index = 0; index < screenshotCount; index += 1) {
    const shot = screenshots[index];
    process.stdout.write(`screenshot ${index + 1}/${screenshotCount}\r`);
    const encoded = await fetchAndEncodeSteamImage(shot.pathFull, {
      alt: `Screenshot ${index + 1}`,
      maxEdge: 1280,
      originalName: `steam-${appid}-shot-${shot.id}.webp`,
    });
    encodedAssets.push(encoded);
  }
  if (screenshotCount) process.stdout.write("\n");

  const movieRows = [];
  for (let index = 0; index < videoCount; index += 1) {
    const video = videos[index];
    let thumbAssetId = null;
    if (!flags.noVideoThumbs && video.previewUrl) {
      process.stdout.write(`video thumb ${index + 1}/${videoCount}\r`);
      const encoded = await fetchAndEncodeSteamImage(video.previewUrl, {
        alt: video.name,
        maxEdge: 512,
        originalName: `steam-${appid}-video-${video.id}.webp`,
      });
      encodedAssets.push(encoded);
      thumbAssetId = encoded.asset.id;
    }
    movieRows.push({ name: video.name, url: video.url, thumbAssetId });
  }
  if (videoCount && !flags.noVideoThumbs) process.stdout.write("\n");

  let coverEncoded = null;
  if (flags.prefill && details && game.coverAssetId == null && details.headerImage) {
    coverEncoded = await fetchAndEncodeSteamCover(appid, {
      headerImage: details.headerImage,
      alt: details.name ?? game.title,
    });
    if (coverEncoded) encodedAssets.push(coverEncoded);
  }

  const screenshotAssetIds = encodedAssets.slice(0, screenshotCount).map((row) => row.asset.id);
  const attachments = buildSteamMediaAttachments({
    screenshotAssetIds,
    movies: movieRows,
  });

  const now = new Date().toISOString();
  const transactionId = `steam-media-${now}`;
  const existingNotes = Object.values(library.notes ?? {});
  const previousNote = existingNotes.find(
    (note) => note.gameId === game.id && isSteamMediaNote(note),
  );
  const upsert = upsertSteamMediaNote({
    gameId: game.id,
    existingNotes,
    attachments,
    now,
  });
  const mediaNote = upsert.notes.find((note) => note.id === upsert.mediaNoteId);
  if (!mediaNote) throw new Error("Media note missing after upsert");

  let nextGame = null;
  const previousGame = game;
  if (flags.prefill && details) {
    const prefillPatch = prefillGameFromSteamDetails(game, details, {
      appid,
      coverAssetId: coverEncoded?.asset.id ?? null,
    });
    if (Object.keys(prefillPatch).length > 0) {
      nextGame = { ...game, ...prefillPatch, updatedAt: now };
    }
  }

  const existingAssetIds = new Set(Object.keys(library.assets ?? {}));
  const baseRevision = library.revision || computeRevision(library);
  const patch = buildMediaImportPatch({
    baseRevision,
    now,
    transactionId,
    encodedAssets,
    mediaNote,
    mediaNoteExisted: Boolean(previousNote),
    previousNote,
    nextGame,
    previousGame,
    existingAssetIds,
    libraryAssets: library.assets ?? {},
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
    writeFileSync(libraryPath, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`applied to ${libraryPath} (+ ${Object.keys(patch.blobs).length} media)`);
  }

  console.log(
    JSON.stringify({
      appid,
      gameId: game.id,
      steamid,
      mediaNoteId: upsert.mediaNoteId,
      createdNote: upsert.created,
      screenshots: screenshotCount,
      videos: videoCount,
      videoThumbs: movieRows.filter((row) => row.thumbAssetId).length,
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
