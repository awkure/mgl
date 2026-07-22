import type { Game, StatusId } from "./types";
import { uniqueTagList } from "./steamImport";

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

export function canWriteAchievementProgress(status: StatusId, force: boolean): boolean {
  return force || status !== "platinum";
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

  apply("hoursPlayed", true, next.hoursPlayed === proposed.hoursPlayed, () => {
    next.hoursPlayed = proposed.hoursPlayed;
  });
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
