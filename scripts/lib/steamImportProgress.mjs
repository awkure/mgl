import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";

export const PROGRESS_VERSION = 1;
export const DEFAULT_PROGRESS_FILENAME = "steam-import-progress.json";

const FLAG_KEYS = ["noCovers", "noAchievements", "skipDetails", "force", "playedOnly"];

export function createEmptyProgress(profileKey, flags, nowIso) {
  return {
    version: PROGRESS_VERSION,
    profileKey: String(profileKey),
    startedAt: nowIso,
    updatedAt: nowIso,
    flags: { ...flags },
    details: {},
    achievements: {},
  };
}

export function validateProgress(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "progress root must be an object" };
  }
  if (raw.version !== PROGRESS_VERSION) {
    return { ok: false, reason: `unsupported progress version ${JSON.stringify(raw.version)}` };
  }
  if (typeof raw.profileKey !== "string" || !raw.profileKey) {
    return { ok: false, reason: "progress.profileKey missing" };
  }
  if (typeof raw.startedAt !== "string" || typeof raw.updatedAt !== "string") {
    return { ok: false, reason: "progress timestamps missing" };
  }
  if (!raw.flags || typeof raw.flags !== "object") {
    return { ok: false, reason: "progress.flags missing" };
  }
  for (const key of FLAG_KEYS) {
    if (typeof raw.flags[key] !== "boolean") {
      return { ok: false, reason: `progress.flags.${key} must be boolean` };
    }
  }
  if (!isPlainMap(raw.details) || !isPlainMap(raw.achievements)) {
    return { ok: false, reason: "progress details/achievements must be object maps" };
  }
  return { ok: true, value: raw };
}

function isPlainMap(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function assertProgressCompatible(progress, profileKey, flags) {
  if (progress.profileKey !== profileKey) {
    throw new Error(
      `Progress profileKey ${progress.profileKey} !== ${profileKey}. Drop --continue or delete steam-import-progress.json.`,
    );
  }
  for (const key of FLAG_KEYS) {
    if (progress.flags[key] !== flags[key]) {
      throw new Error(
        `Progress flags.${key}=${progress.flags[key]} !== ${flags[key]}. Drop --continue or delete steam-import-progress.json.`,
      );
    }
  }
}

export function loadProgressFile(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid progress file: ${msg}`);
  }
}

export function loadForContinue(filePath, profileKey, flags) {
  if (!existsSync(filePath)) {
    throw new Error(
      `Missing ${filePath} for --continue. Omit --continue to start a fresh progress file.`,
    );
  }
  const raw = loadProgressFile(filePath);
  const validated = validateProgress(raw);
  if (!validated.ok) throw new Error(`Invalid progress file: ${validated.reason}`);
  assertProgressCompatible(validated.value, profileKey, flags);
  return validated.value;
}

export function writeAtomic(filePath, progress) {
  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(progress, null, 2)}\n`, "utf8");
  renameSync(tmp, filePath);
}

export function upsertDetail(progress, appid, entry, nowIso) {
  progress.details[String(appid)] = entry;
  progress.updatedAt = nowIso;
  return progress;
}

export function upsertAchievement(progress, appid, entry, nowIso) {
  progress.achievements[String(appid)] = entry;
  progress.updatedAt = nowIso;
  return progress;
}

export function removeProgress(filePath) {
  if (existsSync(filePath)) unlinkSync(filePath);
}

export function progressEnabledForFlags({ skipDetails, noAchievements, dryRun }) {
  const willFetchDetails = !skipDetails && !dryRun;
  const willFetchAchievements = !noAchievements && !dryRun;
  return willFetchDetails || willFetchAchievements;
}

export function assertContinueRequiresProgress(continueFlag, flagSlice) {
  const progressEnabled = progressEnabledForFlags(flagSlice);
  if (continueFlag && !progressEnabled) {
    throw new Error(
      "--continue requires details and/or achievements fetch (do not combine with --skip-details and --no-achievements).",
    );
  }
  return progressEnabled;
}

/** @returns {boolean} true when `cached` was provided (skip network fetch) */
export function applyCachedDetails(candidate, cached) {
  if (cached == null) return false;
  if (cached.ok) {
    candidate.details = cached.value;
    if (cached.name) candidate.name = cached.name;
    else if (cached.value?.name) candidate.name = cached.value.name;
  } else {
    candidate.details = null;
  }
  return true;
}

/** @returns {{ hit: boolean; counts: { unlocked: number | null; total: number | null } | null }} */
export function applyCachedAchievements(cached) {
  if (cached == null) return { hit: false, counts: null };
  if (cached.ok) {
    if (cached.unlocked == null && cached.total == null) {
      return { hit: true, counts: null };
    }
    return {
      hit: true,
      counts: { unlocked: cached.unlocked ?? null, total: cached.total ?? null },
    };
  }
  return { hit: true, counts: null };
}
