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
 *   --apply                     write into public/data/library.json + public/media + snapshot
 *   --dry-run                   merge stats only; no covers / no writes
 *   --force                     ignore steamOverrides; allow terminal status rewrite
 *   --played-only               only playtime_forever > 0
 *   --limit <n>                 max games after name filters (creates + updates)
 *   --appids <a,b,c>            allowlist
 *   --no-covers                 skip cover download/encode
 *   --skip-details              skip storefront appdetails (no genres/type filter)
 *   --no-achievements           skip Steam stats API for achievement counts
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
  getPlayerAchievements,
  getSchemaForGame,
  resolveSteamId,
  SteamApiError,
  withRetry,
} from "./lib/steamApi.mjs";
import { fetchAndEncodeSteamCover } from "./lib/steamCover.mjs";
import {
  createEmptyProgress,
  DEFAULT_PROGRESS_FILENAME,
  loadForContinue,
  removeProgress,
  upsertAchievement,
  upsertDetail,
  writeAtomic,
} from "./lib/steamImportProgress.mjs";
import { applyPatch } from "./publish-patch.mjs";
import { computeRevision, externalAssetPath } from "./validate-data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT_PATH = path.join(root, "public", "data", "steam-import-snapshot.json");

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
    force: false,
    playedOnly: false,
    limit: null,
    appids: null,
    noCovers: false,
    skipDetails: false,
    noAchievements: false,
    continue: false,
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
    else if (arg === "--force") flags.force = true;
    else if (arg === "--played-only") flags.playedOnly = true;
    else if (arg === "--no-covers") flags.noCovers = true;
    else if (arg === "--skip-details") flags.skipDetails = true;
    else if (arg === "--no-achievements") flags.noAchievements = true;
    else if (arg === "--continue") flags.continue = true;
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
  if (flags.continue && flags.dryRun) throw new Error("Do not combine --continue with --dry-run");
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
  --apply                     write games+covers into public/data + public/media (+ snapshot)
  --dry-run                   merge stats only; no writes
  --force                     ignore steamOverrides; rewrite terminal status
  --played-only
  --limit <n>
  --appids <a,b,c>
  --no-covers
  --skip-details
  --no-achievements           skip achievement count fetch (default: on)
  --continue                  resume from steam-import-progress.json (skip cached appids)`);
}

function loadSteamSnapshot(profileKey) {
  if (!existsSync(SNAPSHOT_PATH)) return null;
  try {
    const raw = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));
    if (raw?.version !== 1) {
      console.warn(`Invalid steam snapshot at ${SNAPSHOT_PATH}: bad version`);
      return null;
    }
    if (typeof raw.profileKey !== "string" || !raw.profileKey) {
      console.warn(`Invalid steam snapshot at ${SNAPSHOT_PATH}: missing profileKey`);
      return null;
    }
    if (raw.profileKey !== profileKey) return null;
    if (typeof raw.games !== "object" || raw.games === null || Array.isArray(raw.games)) {
      console.warn(`Invalid steam snapshot at ${SNAPSHOT_PATH}: bad games map`);
      return null;
    }
    return raw;
  } catch (reason) {
    console.warn(
      `Invalid steam snapshot JSON at ${SNAPSHOT_PATH}: ${reason instanceof Error ? reason.message : reason}`,
    );
    return null;
  }
}

const {
  parseSteamProfileInput,
} = await import(pathToFileURL(path.join(root, "src/domain/steamIdentity.ts")).href);
const {
  classifySteamOwnedGames,
  mapSteamCandidateToGame,
  rejectExcludedTypes,
} = await import(pathToFileURL(path.join(root, "src/domain/steamImport.ts")).href);
const {
  achievementCountsFromSteam,
  buildSnapshotGameFromCandidate,
  buildSteamUpsertPatch,
  mergeSteamGameUpdate,
  proposeSteamFieldsFromCandidate,
  snapshotUnchangedForCandidate,
} = await import(pathToFileURL(path.join(root, "src/domain/steamReimport.ts")).href);

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

  const now = new Date().toISOString();
  const progressPath = path.join(root, DEFAULT_PROGRESS_FILENAME);
  const progressFlags = {
    noCovers: flags.noCovers,
    noAchievements: flags.noAchievements,
    skipDetails: flags.skipDetails,
    force: flags.force,
    playedOnly: flags.playedOnly,
  };
  const willFetchDetails = !flags.skipDetails && !flags.dryRun;
  const willFetchAchievements = !flags.noAchievements && !flags.dryRun;
  const progressEnabled = willFetchDetails || willFetchAchievements;

  /** @type {ReturnType<typeof createEmptyProgress> | null} */
  let progress = null;
  if (progressEnabled) {
    if (flags.continue) {
      progress = loadForContinue(progressPath, steamid, progressFlags);
      console.log(
        `continue: loaded ${progressPath} (details ${Object.keys(progress.details).length}, achievements ${Object.keys(progress.achievements).length})`,
      );
    } else {
      progress = createEmptyProgress(steamid, progressFlags, now);
      writeAtomic(progressPath, progress);
      console.log(`progress: wrote fresh ${progressPath}`);
    }
  }

  function flushProgress() {
    if (progress) writeAtomic(progressPath, progress);
  }

  const classified = classifySteamOwnedGames(owned.games, {
    existingGames: library.games ?? {},
    playedOnly: flags.playedOnly,
    appids: flags.appids ?? undefined,
    limit: flags.limit ?? undefined,
  });
  let { creates, updates, fetched, skippedFilter } = classified;
  console.log(
    `after filter: ${creates.length} create, ${updates.length} update (fetched ${fetched}, skip filter ${skippedFilter})`,
  );

  const snapshotDoc = loadSteamSnapshot(steamid);
  const snapshotGames = snapshotDoc?.games ?? {};

  const throttle = createThrottle(1500);
  let typeSkipped = 0;
  let coversFailed = 0;
  let skippedUnchanged = 0;
  let skippedLocked = 0;

  const needsDetails = (candidate, existing) => {
    if (flags.skipDetails || flags.dryRun) return false;
    if (!existing) return true;
    if (flags.force) return true;
    const entry = snapshotGames[String(candidate.appid)];
    return !snapshotUnchangedForCandidate(entry, candidate);
  };

  const fetchDetailsFor = async (candidate, existing, label, index, total) => {
    if (!needsDetails(candidate, existing)) return;
    const cached = progress?.details?.[String(candidate.appid)];
    if (cached) {
      if (cached.ok) {
        candidate.details = cached.value;
        if (cached.name) candidate.name = cached.name;
        else if (cached.value?.name) candidate.name = cached.value.name;
      } else {
        candidate.details = null;
      }
      return;
    }
    process.stdout.write(`details ${label} ${index + 1}/${total} appid=${candidate.appid}\r`);
    await throttle();
    try {
      const details = await withRetry(() => getAppDetails(candidate.appid, { language: "russian" }));
      candidate.details = details;
      if (details?.name) candidate.name = details.name;
      if (progress) {
        upsertDetail(
          progress,
          candidate.appid,
          {
            ok: true,
            value: details,
            ...(details?.name ? { name: details.name } : {}),
          },
          new Date().toISOString(),
        );
        flushProgress();
      }
    } catch (reason) {
      candidate.details = null;
      if (progress) {
        upsertDetail(
          progress,
          candidate.appid,
          {
            ok: false,
            error: reason instanceof Error ? reason.message : String(reason),
          },
          new Date().toISOString(),
        );
        flushProgress();
      }
      console.warn(`\ndetails failed for ${candidate.appid}: ${reason instanceof Error ? reason.message : reason}`);
    }
  };

  if (!flags.skipDetails && !flags.dryRun) {
    for (let index = 0; index < creates.length; index += 1) {
      await fetchDetailsFor(creates[index], null, "create", index, creates.length);
    }
    for (let index = 0; index < updates.length; index += 1) {
      const { candidate, existing } = updates[index];
      await fetchDetailsFor(candidate, existing, "update", index, updates.length);
    }
    process.stdout.write("\n");
    const allWithDetails = [...creates, ...updates.map((row) => row.candidate)];
    const rejected = rejectExcludedTypes(allWithDetails);
    const keptSet = new Set(rejected.kept.map((c) => c.appid));
    creates = creates.filter((c) => keptSet.has(c.appid));
    updates = updates.filter((row) => keptSet.has(row.candidate.appid));
    typeSkipped = rejected.skippedFilter;
    skippedFilter += typeSkipped;
    console.log(`after type filter: ${creates.length} create, ${updates.length} update (type skip ${typeSkipped})`);
  }

  const achievementsEnabled = !flags.noAchievements && !flags.dryRun;
  let achievementsUpdated = 0;
  let achievementsSkipped = 0;
  let achievementsFailed = 0;
  /** @type {Map<number, { unlocked: number; total: number } | { unlocked: number | null; total: number | null }>} */
  const achievementByAppid = new Map();

  const isSnapshotSkippedUpdate = (candidate) => {
    if (flags.force) return false;
    const snapEntry = snapshotGames[String(candidate.appid)];
    return snapshotUnchangedForCandidate(snapEntry, candidate);
  };

  if (achievementsEnabled) {
    const achievementTargets = [
      ...creates.map((candidate) => ({ candidate, existing: null })),
      ...updates
        .filter(({ candidate }) => !isSnapshotSkippedUpdate(candidate))
        .map(({ candidate, existing }) => ({ candidate, existing })),
    ];
    for (let index = 0; index < achievementTargets.length; index += 1) {
      const { candidate, existing } = achievementTargets[index];
      const key = String(candidate.appid);
      const cached = progress?.achievements?.[key];
      if (cached) {
        if (cached.ok) {
          achievementByAppid.set(candidate.appid, {
            unlocked: cached.unlocked,
            total: cached.total,
          });
          if (cached.unlocked != null && cached.total != null) achievementsUpdated += 1;
          else achievementsSkipped += 1;
        } else {
          achievementByAppid.set(candidate.appid, {
            unlocked: existing?.achievementsUnlocked ?? null,
            total: existing?.achievementsTotal ?? null,
          });
          achievementsSkipped += 1;
        }
        continue;
      }
      process.stdout.write(
        `achievements ${index + 1}/${achievementTargets.length} appid=${candidate.appid}\r`,
      );
      await throttle();
      try {
        const schema = await withRetry(() => getSchemaForGame(apiKey, candidate.appid));
        const player = await withRetry(() =>
          getPlayerAchievements(apiKey, steamid, candidate.appid),
        );
        const parsed = achievementCountsFromSteam({
          schemaTotal: schema?.total ?? null,
          unlocked: player.unlocked,
          available: player.available,
        });
        if (parsed) {
          achievementByAppid.set(candidate.appid, parsed);
          achievementsUpdated += 1;
          if (progress) {
            upsertAchievement(
              progress,
              candidate.appid,
              { ok: true, unlocked: parsed.unlocked, total: parsed.total },
              new Date().toISOString(),
            );
            flushProgress();
          }
        } else {
          achievementByAppid.set(candidate.appid, {
            unlocked: existing?.achievementsUnlocked ?? null,
            total: existing?.achievementsTotal ?? null,
          });
          if (progress) {
            upsertAchievement(
              progress,
              candidate.appid,
              { ok: true, unlocked: null, total: null },
              new Date().toISOString(),
            );
            flushProgress();
          }
        }
      } catch (reason) {
        achievementsFailed += 1;
        const message = reason instanceof Error ? reason.message : String(reason);
        console.warn(`\nachievements failed for ${candidate.appid}: ${message}`);
        achievementByAppid.set(candidate.appid, {
          unlocked: existing?.achievementsUnlocked ?? null,
          total: existing?.achievementsTotal ?? null,
        });
        if (progress) {
          upsertAchievement(
            progress,
            candidate.appid,
            { ok: false, error: message },
            new Date().toISOString(),
          );
          flushProgress();
        }
      }
    }
    if (achievementTargets.length) process.stdout.write("\n");
  }

  const snapshotRows = new Map();
  const recordSnapshotRow = (candidate, existing = null) => {
    const fromFetch = achievementByAppid.get(candidate.appid);
    const achievements = fromFetch ?? {
      unlocked: existing?.achievementsUnlocked ?? null,
      total: existing?.achievementsTotal ?? null,
    };
    snapshotRows.set(
      String(candidate.appid),
      buildSnapshotGameFromCandidate(candidate, achievements),
    );
  };

  const patchItems = [];

  for (const { candidate, existing } of updates) {
    const snapEntry = snapshotGames[String(candidate.appid)];
    if (!flags.force && snapshotUnchangedForCandidate(snapEntry, candidate)) {
      skippedUnchanged += 1;
      if (achievementsEnabled) achievementsSkipped += 1;
      recordSnapshotRow(candidate, existing);
      continue;
    }

    const mayFetchCover = !flags.noCovers && !flags.dryRun
      && (flags.force || !existing.steamOverrides?.coverAssetId);
    let cover = null;
    if (mayFetchCover) {
      try {
        cover = await fetchAndEncodeSteamCover(candidate.appid, {
          headerImage: candidate.details?.headerImage ?? null,
          alt: candidate.name,
        });
        if (!cover) coversFailed += 1;
      } catch (reason) {
        coversFailed += 1;
        console.warn(`\ncover failed for ${candidate.appid}: ${reason instanceof Error ? reason.message : reason}`);
      }
    }

    const proposedCoverId = cover?.asset.id ?? null;
    const achievementSlice = achievementByAppid.get(candidate.appid);
    const proposed = proposeSteamFieldsFromCandidate(
      candidate,
      proposedCoverId,
      achievementSlice,
    );
    const merged = mergeSteamGameUpdate({
      existing,
      proposed,
      force: flags.force,
      now,
    });
    if (!merged.game) {
      if (merged.skipReason === "locked") skippedLocked += 1;
      else skippedUnchanged += 1;
      recordSnapshotRow(candidate, existing);
      continue;
    }

    patchItems.push({
      kind: "update",
      game: merged.game,
      previousGame: existing,
      cover,
    });
    recordSnapshotRow(candidate, merged.game);
  }

  for (let index = 0; index < creates.length; index += 1) {
    const candidate = creates[index];
    let cover = null;
    if (!flags.noCovers && !flags.dryRun) {
      process.stdout.write(`covers create ${index + 1}/${creates.length} appid=${candidate.appid}\r`);
      try {
        cover = await fetchAndEncodeSteamCover(candidate.appid, {
          headerImage: candidate.details?.headerImage ?? null,
          alt: candidate.name,
        });
        if (!cover) coversFailed += 1;
      } catch (reason) {
        coversFailed += 1;
        console.warn(`\ncover failed for ${candidate.appid}: ${reason instanceof Error ? reason.message : reason}`);
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
    const counts = achievementByAppid.get(candidate.appid);
    if (counts?.unlocked != null && counts?.total != null) {
      game.achievementsUnlocked = counts.unlocked;
      game.achievementsTotal = counts.total;
      if (
        counts.total > 0
        && counts.unlocked === counts.total
        && ["wishlist", "playing", "played"].includes(game.status)
      ) {
        game.status = "platinum";
      }
    }
    patchItems.push({ kind: "create", game, cover });
    recordSnapshotRow(candidate, game);
  }
  if (!flags.noCovers && !flags.dryRun && creates.length) process.stdout.write("\n");

  const created = patchItems.filter((item) => item.kind === "create").length;
  const updated = patchItems.filter((item) => item.kind === "update").length;

  if (flags.dryRun) {
    console.log(
      JSON.stringify({
        fetched,
        skippedFilter,
        created,
        updated,
        skippedUnchanged,
        skippedLocked,
        achievementsUpdated,
        achievementsSkipped,
        achievementsFailed,
        dryRun: true,
      }),
    );
    process.exit(0);
  }

  const baseRevision = library.revision || computeRevision(library);
  const patch = buildSteamUpsertPatch(baseRevision, patchItems, { now });
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

    const snapshotOut = {
      version: 1,
      profileKey: steamid,
      fetchedAt: now,
      games: Object.fromEntries(snapshotRows),
    };
    mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
    writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshotOut, null, 2)}\n`);
    console.log(`wrote snapshot ${SNAPSHOT_PATH}`);

    removeProgress(progressPath);
    console.log(`removed ${progressPath}`);
  }

  console.log(
    JSON.stringify({
      fetched,
      skippedFilter,
      created,
      updated,
      skippedUnchanged,
      skippedLocked,
      achievementsUpdated,
      achievementsSkipped,
      achievementsFailed,
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
