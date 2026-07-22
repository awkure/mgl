import { canonicalHash, MISSING_VALUE_HASH } from "./canonical";
import type { Game, StatusId, SteamOverrideKey } from "./types";
import {
  hoursFromSteamMinutes,
  lastPlayedAtFromSteam,
  statusFromPlaytime,
  uniqueTagList,
  type SteamImportAssetBlob,
} from "./steamImport";

export const STEAM_SOFT_STATUSES = ["wishlist", "playing", "played"] as const;

export interface SteamSnapshotGame {
  name: string;
  playtimeForever: number;
  playtime2Weeks: number;
  rtimeLastPlayed: number;
  genres: string[];
  headerImage: string | null;
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
  let fresh = buildSnapshotGameFromCandidate(candidate);
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
): SteamProposedFields {
  const title = (candidate.name.trim() || `Steam ${candidate.appid}`).slice(0, 500);
  return {
    title,
    tags: uniqueTagList(candidate.details?.genres ?? []),
    status: statusFromPlaytime(candidate.playtime_forever, candidate.playtime_2weeks),
    hoursPlayed: hoursFromSteamMinutes(candidate.playtime_forever),
    lastPlayedAt: lastPlayedAtFromSteam(candidate.rtime_last_played),
    coverAssetId,
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
    const previousGame = item.previousGame;
    operations[`/games/${item.game.id}`] = {
      operation: "set",
      value: item.game,
      baseExists: isUpdate,
      baseHash: isUpdate && previousGame ? canonicalHash(previousGame) : MISSING_VALUE_HASH,
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

export function snapshotGamesEqual(a: SteamSnapshotGame, b: SteamSnapshotGame): boolean {
  if (a.name !== b.name) return false;
  if (a.playtimeForever !== b.playtimeForever) return false;
  if (a.playtime2Weeks !== b.playtime2Weeks) return false;
  if (a.rtimeLastPlayed !== b.rtimeLastPlayed) return false;
  if (a.headerImage !== b.headerImage) return false;
  const norm = (tags: string[]) => [...tags].map((t) => t.trim().toLocaleLowerCase("ru")).filter(Boolean).sort();
  return JSON.stringify(norm(a.genres)) === JSON.stringify(norm(b.genres));
}

function tagsEqual(a: readonly string[], b: readonly string[]): boolean {
  return JSON.stringify(uniqueTagList(a)) === JSON.stringify(uniqueTagList(b));
}

export function buildSnapshotGameFromCandidate(candidate: {
  name: string;
  playtime_forever: number;
  playtime_2weeks: number;
  rtime_last_played: number;
  details: { genres?: string[]; headerImage?: string | null } | null;
}): SteamSnapshotGame {
  return {
    name: candidate.name,
    playtimeForever: candidate.playtime_forever,
    playtime2Weeks: candidate.playtime_2weeks,
    rtimeLastPlayed: candidate.rtime_last_played,
    genres: uniqueTagList(candidate.details?.genres ?? []),
    headerImage: candidate.details?.headerImage ?? null,
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
