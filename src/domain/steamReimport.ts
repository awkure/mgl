import { canonicalHash, MISSING_VALUE_HASH } from "./canonical.ts";
import type { Game, StatusId, SteamOverrideKey } from "./types";
import {
  hoursFromSteamMinutes,
  lastPlayedAtFromSteam,
  statusFromPlaytime,
  uniqueTagList,
  type SteamImportAssetBlob,
} from "./steamImport.ts";

export const STEAM_SOFT_STATUSES = ["wishlist", "playing", "played"] as const;

/** Keep in sync with `LOCALLY_PATCHABLE_FIELDS.games` in validation.ts (avoid importing validation under Node strip-types). */
const STEAM_UPSERT_GAME_FIELDS = [
  "title",
  "coverAssetId",
  "steamAppId",
  "importedVia",
  "hoursPlayed",
  "lastPlayedAt",
  "achievementsUnlocked",
  "achievementsTotal",
  "steamOverrides",
  "platforms",
  "tags",
  "status",
  "placement",
  "reviewMarkdown",
  "updatedAt",
] as const;

export interface SteamSnapshotGame {
  name: string;
  playtimeForever: number;
  playtime2Weeks: number;
  rtimeLastPlayed: number;
  genres: string[];
  headerImage: string | null;
  achievementsUnlocked: number | null;
  achievementsTotal: number | null;
}

export interface SteamImportSnapshot {
  version: 1;
  profileKey: string;
  fetchedAt: string;
  games: Record<string, SteamSnapshotGame>;
}

export interface SteamProposedFields {
  title: string;
  tags: string[];
  status: StatusId;
  hoursPlayed: number;
  lastPlayedAt: string | null;
  coverAssetId: string | null;
  achievementsUnlocked: number | null;
  achievementsTotal: number | null;
}

export type SteamMergeSkipReason = "unchanged" | "locked";

export interface SteamMergeResult {
  game: Game | null;
  skipReason?: SteamMergeSkipReason;
  changedKeys: string[];
}

export function normalizedSteamHoursPlayed(hours: number | null | undefined): number {
  if (hours == null || !Number.isFinite(hours)) return 0;
  return hours;
}

export function canWriteAchievementProgress(status: StatusId, force: boolean): boolean {
  return force || status !== "platinum";
}

export function achievementCountsFromSteam(input: {
  schemaTotal: number | null;
  unlocked: number | null;
  available: boolean;
}): { unlocked: number; total: number } | null {
  if (!input.available) return null;
  const total = input.schemaTotal;
  const rawUnlocked = input.unlocked;
  if (total == null || total <= 0 || rawUnlocked == null) return null;
  const unlocked = Math.max(0, Math.min(rawUnlocked, total));
  return { unlocked, total };
}

function snapshotAchievementFieldsPresent(entry: SteamSnapshotGame): boolean {
  return "achievementsUnlocked" in entry && "achievementsTotal" in entry;
}

export function snapshotUnchangedForCandidate(
  snapshotEntry: SteamSnapshotGame | undefined,
  candidate: {
    name: string;
    playtime_forever: number;
    playtime_2weeks: number;
    rtime_last_played: number;
    details: { genres?: string[]; headerImage?: string | null } | null;
  },
): boolean {
  if (!snapshotEntry) return false;
  if (!snapshotAchievementFieldsPresent(snapshotEntry)) return false;
  if (snapshotEntry.achievementsUnlocked == null && snapshotEntry.achievementsTotal == null) {
    return false;
  }
  let fresh = buildSnapshotGameFromCandidate(candidate, {
    unlocked: snapshotEntry.achievementsUnlocked,
    total: snapshotEntry.achievementsTotal,
  });
  if (!candidate.details) {
    fresh = { ...fresh, genres: snapshotEntry.genres, headerImage: snapshotEntry.headerImage };
  }
  return snapshotGamesEqual(snapshotEntry, fresh);
}

export function proposeSteamFieldsFromCandidate(
  candidate: {
    appid: number;
    name: string;
    playtime_forever: number;
    playtime_2weeks: number;
    rtime_last_played: number;
    details: { genres?: string[] } | null;
  },
  coverAssetId: string | null,
  achievements?: { unlocked: number | null; total: number | null } | null,
): SteamProposedFields {
  const title = (candidate.name.trim() || `Steam ${candidate.appid}`).slice(0, 500);
  const achievementCounts = achievements ?? null;
  return {
    title,
    tags: uniqueTagList(candidate.details?.genres ?? []),
    status: statusFromPlaytime(candidate.playtime_forever, candidate.playtime_2weeks),
    hoursPlayed: hoursFromSteamMinutes(candidate.playtime_forever),
    lastPlayedAt: lastPlayedAtFromSteam(candidate.rtime_last_played),
    coverAssetId,
    achievementsUnlocked: achievementCounts?.unlocked ?? null,
    achievementsTotal: achievementCounts?.total ?? null,
  };
}

export type SteamUpsertPatchItem = {
  kind: "create" | "update";
  game: Game;
  previousGame?: Game;
  cover?: SteamImportAssetBlob | null;
};

/** Build a V2 OperationPatch for Steam creates and updates (+ optional cover assets). */
export function buildSteamUpsertPatch(
  baseRevision: string,
  items: readonly SteamUpsertPatchItem[],
  options: { now?: string; transactionId?: string } = {},
): {
  patchVersion: 2;
  schemaVersion: 2;
  baseRevision: string;
  operations: Record<
    string,
    {
      operation: "set";
      value: unknown;
      baseExists: boolean;
      baseHash: string;
      changedAt: string;
      transactionId: string;
    }
  >;
  blobs: Record<string, string>;
} {
  const now = options.now ?? new Date().toISOString();
  const transactionId = options.transactionId ?? `steam-import-${now}`;
  const operations: Record<
    string,
    {
      operation: "set";
      value: unknown;
      baseExists: boolean;
      baseHash: string;
      changedAt: string;
      transactionId: string;
    }
  > = {};
  const blobs: Record<string, string> = {};

  for (const item of items) {
    const cover = item.cover ?? null;
    if (cover) {
      operations[`/assets/${cover.asset.id}`] = {
        operation: "set",
        value: cover.asset,
        baseExists: false,
        baseHash: MISSING_VALUE_HASH,
        changedAt: now,
        transactionId,
      };
      blobs[cover.asset.id] = cover.base64;
    }
    const isUpdate = item.kind === "update";
    if (isUpdate && !item.previousGame) {
      throw new Error("Steam update patch item requires previousGame");
    }
    if (isUpdate && item.previousGame) {
      const previous = item.previousGame as unknown as Record<string, unknown>;
      const next = item.game as unknown as Record<string, unknown>;
      for (const field of STEAM_UPSERT_GAME_FIELDS) {
        const before = previous[field];
        const after = next[field];
        if (canonicalHash(before) === canonicalHash(after)) continue;
        operations[`/games/${item.game.id}/${field}`] = {
          operation: "set",
          value: after,
          baseExists: true,
          baseHash: canonicalHash(before),
          changedAt: now,
          transactionId,
        };
      }
    } else {
      operations[`/games/${item.game.id}`] = {
        operation: "set",
        value: item.game,
        baseExists: false,
        baseHash: MISSING_VALUE_HASH,
        changedAt: now,
        transactionId,
      };
    }
  }

  return {
    patchVersion: 2,
    schemaVersion: 2,
    baseRevision,
    operations,
    blobs,
  };
}

export function snapshotGamesEqual(a: SteamSnapshotGame, b: SteamSnapshotGame): boolean {
  if (a.name !== b.name) return false;
  if (a.playtimeForever !== b.playtimeForever) return false;
  if (a.playtime2Weeks !== b.playtime2Weeks) return false;
  if (a.rtimeLastPlayed !== b.rtimeLastPlayed) return false;
  if (a.headerImage !== b.headerImage) return false;
  if (!snapshotAchievementFieldsPresent(a) || !snapshotAchievementFieldsPresent(b)) return false;
  if (a.achievementsUnlocked !== b.achievementsUnlocked) return false;
  if (a.achievementsTotal !== b.achievementsTotal) return false;
  const norm = (tags: string[]) => [...tags].map((t) => t.trim().toLocaleLowerCase("ru")).filter(Boolean).sort();
  return JSON.stringify(norm(a.genres)) === JSON.stringify(norm(b.genres));
}

function tagsEqual(a: readonly string[], b: readonly string[]): boolean {
  return JSON.stringify(uniqueTagList(a)) === JSON.stringify(uniqueTagList(b));
}

export function buildSnapshotGameFromCandidate(
  candidate: {
    name: string;
    playtime_forever: number;
    playtime_2weeks: number;
    rtime_last_played: number;
    details: { genres?: string[]; headerImage?: string | null } | null;
  },
  achievements?: { unlocked: number | null; total: number | null },
): SteamSnapshotGame {
  return {
    name: candidate.name,
    playtimeForever: candidate.playtime_forever,
    playtime2Weeks: candidate.playtime_2weeks,
    rtimeLastPlayed: candidate.rtime_last_played,
    genres: uniqueTagList(candidate.details?.genres ?? []),
    headerImage: candidate.details?.headerImage ?? null,
    achievementsUnlocked: achievements?.unlocked ?? null,
    achievementsTotal: achievements?.total ?? null,
  };
}

export function mergeSteamGameUpdate(input: {
  existing: Game;
  proposed: SteamProposedFields;
  force: boolean;
  now: string;
}): SteamMergeResult {
  const { existing, proposed, force, now } = input;
  const next: Game = {
    ...existing,
    placement: { ...existing.placement },
    tags: [...existing.tags],
    platforms: [...existing.platforms],
    steamOverrides: { ...existing.steamOverrides },
  };
  const changedKeys: string[] = [];
  const wantedKeys: string[] = [];

  const apply = (key: string, canWrite: boolean, equal: boolean, write: () => void) => {
    if (equal) return;
    wantedKeys.push(key);
    if (!canWrite) return;
    write();
    changedKeys.push(key);
  };

  apply(
    "hoursPlayed",
    true,
    normalizedSteamHoursPlayed(next.hoursPlayed) === proposed.hoursPlayed,
    () => {
      next.hoursPlayed = proposed.hoursPlayed;
    },
  );
  apply("lastPlayedAt", true, next.lastPlayedAt === proposed.lastPlayedAt, () => {
    next.lastPlayedAt = proposed.lastPlayedAt;
  });

  apply(
    "title",
    force || !next.steamOverrides.title,
    next.title === proposed.title,
    () => {
      next.title = proposed.title;
    },
  );
  apply(
    "tags",
    force || !next.steamOverrides.tags,
    tagsEqual(next.tags, proposed.tags),
    () => {
      next.tags = [...proposed.tags];
    },
  );
  apply(
    "coverAssetId",
    force || !next.steamOverrides.coverAssetId,
    proposed.coverAssetId == null || next.coverAssetId === proposed.coverAssetId,
    () => {
      if (proposed.coverAssetId != null) next.coverAssetId = proposed.coverAssetId;
    },
  );

  const soft = (STEAM_SOFT_STATUSES as readonly string[]).includes(next.status);
  apply(
    "status",
    force || (!next.steamOverrides.status && soft),
    next.status === proposed.status,
    () => {
      next.status = proposed.status;
    },
  );

  const canWriteAchievements = canWriteAchievementProgress(existing.status, force);
  const proposedCountsReady =
    proposed.achievementsUnlocked != null && proposed.achievementsTotal != null;
  const countsEqual =
    next.achievementsUnlocked === proposed.achievementsUnlocked &&
    next.achievementsTotal === proposed.achievementsTotal;

  if (proposedCountsReady && !countsEqual) {
    wantedKeys.push("achievementsUnlocked", "achievementsTotal");
    if (canWriteAchievements) {
      next.achievementsUnlocked = proposed.achievementsUnlocked;
      next.achievementsTotal = proposed.achievementsTotal;
      changedKeys.push("achievementsUnlocked", "achievementsTotal");
    }
  }

  const resolvedUnlocked = next.achievementsUnlocked;
  const resolvedTotal = next.achievementsTotal;
  const fullCompletion =
    resolvedUnlocked != null &&
    resolvedTotal != null &&
    resolvedTotal > 0 &&
    resolvedUnlocked === resolvedTotal;
  const statusWritableForPlatinum = force || (!next.steamOverrides.status && soft);

  if (fullCompletion && canWriteAchievements && statusWritableForPlatinum && next.status !== "platinum") {
    if (next.status !== proposed.status) {
      wantedKeys.push("status");
    }
    next.status = "platinum";
    if (!changedKeys.includes("status")) {
      changedKeys.push("status");
    }
  }

  if (changedKeys.length === 0) {
    return {
      game: null,
      skipReason: wantedKeys.length > 0 ? "locked" : "unchanged",
      changedKeys,
    };
  }
  next.updatedAt = now;
  return { game: next, changedKeys };
}

export function nextSteamOverrides(
  previous: Game | undefined,
  nextFields: Pick<Game, "title" | "tags" | "status" | "coverAssetId" | "importedVia">,
): Partial<Record<SteamOverrideKey, true>> {
  const base = { ...(previous?.steamOverrides ?? {}) };
  if ((previous?.importedVia ?? nextFields.importedVia) !== "steam" && nextFields.importedVia !== "steam") {
    return base;
  }
  if (!previous) return base;
  if (previous.title !== nextFields.title) base.title = true;
  if (JSON.stringify(previous.tags) !== JSON.stringify(nextFields.tags)) base.tags = true;
  if (previous.status !== nextFields.status) base.status = true;
  if (previous.coverAssetId !== nextFields.coverAssetId) base.coverAssetId = true;
  return base;
}
