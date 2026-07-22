import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  getUserScreenshots as defaultGetUserScreenshots,
  getUserVideos as defaultGetUserVideos,
} from "./steamApi.mjs";
import { fetchAndEncodeSteamImage as defaultFetchAndEncode } from "./steamImage.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const domain = await import(pathToFileURL(path.join(root, "src/domain/steamMedia.ts")).href);
const { canonicalHash } = await import(pathToFileURL(path.join(root, "src/domain/canonical.ts")).href);

const MISSING_VALUE_HASH = "0".repeat(64);

export function listLibraryGamesWithSteamAppId(library) {
  const rows = [];
  for (const game of Object.values(library.games ?? {})) {
    const appid = game?.steamAppId;
    if (typeof appid === "number" && Number.isSafeInteger(appid) && appid > 0) {
      rows.push({ game, appid });
    }
  }
  return rows;
}

export function mediaTargetsFromPatchItems(patchItems) {
  const out = [];
  for (const item of patchItems) {
    const appid = item.game?.steamAppId;
    if (typeof appid === "number" && Number.isSafeInteger(appid) && appid > 0) {
      out.push({ game: item.game, appid });
    }
  }
  return out;
}

export function validateMediaTargetFlags(flags) {
  if (flags.all && (flags.appid != null || flags.gameId)) {
    throw new Error("Cannot combine --all with --appid/--game-id");
  }
  if (!flags.all && flags.appid == null && !flags.gameId) {
    throw new Error("Pass --appid and/or --game-id, or --all");
  }
}

export async function importSteamMediaForGame(input) {
  const getShots = input.getUserScreenshots ?? defaultGetUserScreenshots;
  const getVideos = input.getUserVideos ?? defaultGetUserVideos;
  const encode = input.fetchAndEncodeSteamImage ?? defaultFetchAndEncode;
  const { apiKey, steamid, library, game, appid, now } = input;
  const noVideoThumbs = Boolean(input.noVideoThumbs);

  let screenshots;
  let videos;
  try {
    screenshots = await getShots(apiKey, steamid, appid);
    videos = await getVideos(apiKey, steamid, appid);
  } catch (reason) {
    return {
      ok: false,
      gameId: game.id,
      appid,
      error: reason instanceof Error ? reason.message : String(reason),
    };
  }

  const skipped = [];
  const encodedAssets = [];
  const screenshotAssetIds = [];

  for (let index = 0; index < screenshots.length; index += 1) {
    const shot = screenshots[index];
    try {
      const encoded = await encode(shot.pathFull, {
        alt: `Screenshot ${index + 1}`,
        maxEdge: 1280,
        originalName: `steam-${appid}-shot-${shot.id}.webp`,
      });
      encodedAssets.push(encoded);
      screenshotAssetIds.push(encoded.asset.id);
    } catch (reason) {
      skipped.push({
        kind: "screenshot",
        id: String(shot.id),
        error: reason instanceof Error ? reason.message : String(reason),
      });
    }
  }

  const movieRows = [];
  for (const video of videos) {
    let thumbAssetId = null;
    if (!noVideoThumbs && video.previewUrl) {
      try {
        const encoded = await encode(video.previewUrl, {
          alt: video.name,
          maxEdge: 512,
          originalName: `steam-${appid}-video-${video.id}.webp`,
        });
        encodedAssets.push(encoded);
        thumbAssetId = encoded.asset.id;
      } catch (reason) {
        skipped.push({
          kind: "video-thumb",
          id: String(video.id),
          error: reason instanceof Error ? reason.message : String(reason),
        });
      }
    }
    movieRows.push({ name: video.name, url: video.url, thumbAssetId });
  }

  const attachments = domain.buildSteamMediaAttachments({
    screenshotAssetIds,
    movies: movieRows,
  });
  const existingNotes = Object.values(library.notes ?? {});
  const previousNote =
    existingNotes.find((note) => note.gameId === game.id && domain.isSteamMediaNote(note)) ?? null;
  const upsert = domain.upsertSteamMediaNote({
    gameId: game.id,
    existingNotes,
    attachments,
    now,
  });
  const mediaNote = upsert.notes.find((note) => note.id === upsert.mediaNoteId);
  if (!mediaNote) {
    return { ok: false, gameId: game.id, appid, error: "Media note missing after upsert" };
  }

  return {
    ok: true,
    gameId: game.id,
    appid,
    encodedAssets,
    mediaNote,
    previousNote,
    mediaNoteExisted: Boolean(previousNote),
    skipped,
    screenshotsRequested: screenshots.length,
    screenshotsEncoded: screenshotAssetIds.length,
    videos: videos.length,
  };
}

export function buildMediaNotePatchFragment(input) {
  const { result, now, transactionId, existingAssetIds, libraryAssets } = input;
  const operations = {};
  const blobs = {};
  for (const row of result.encodedAssets) {
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
  operations[`/notes/${result.mediaNote.id}`] = {
    operation: "set",
    value: result.mediaNote,
    baseExists: result.mediaNoteExisted,
    baseHash:
      result.mediaNoteExisted && result.previousNote
        ? canonicalHash(result.previousNote)
        : MISSING_VALUE_HASH,
    changedAt: now,
    transactionId,
  };
  return { operations, blobs };
}

export function mergePatchFragments(basePatch, fragment) {
  const operations = { ...basePatch.operations, ...fragment.operations };
  const blobs = { ...basePatch.blobs, ...fragment.blobs };
  for (const id of Object.keys(blobs)) {
    if (!operations[`/assets/${id}`]) throw new Error(`Orphan blob ${id}`);
  }
  return { ...basePatch, operations, blobs };
}
