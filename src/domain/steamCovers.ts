import type { Game } from "./types";

export type SteamCoverRefreshAction = "locked" | "unchanged" | "update";

export type SelectSteamCoverTargetsOptions = {
  appids?: readonly number[];
  gameId?: string;
  limit?: number;
};

/** Library games with positive steamAppId, optional filters. Stable order by title then id. */
export function selectSteamCoverTargets(
  games: Record<string, Game>,
  options: SelectSteamCoverTargetsOptions = {},
): Game[] {
  const appidSet = options.appids?.length
    ? new Set(options.appids)
    : null;
  let list = Object.values(games).filter((game) => {
    if (typeof game.steamAppId !== "number" || !Number.isSafeInteger(game.steamAppId) || game.steamAppId <= 0) {
      return false;
    }
    if (options.gameId != null && game.id !== options.gameId) return false;
    if (appidSet && !appidSet.has(game.steamAppId)) return false;
    return true;
  });
  list.sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  if (options.limit != null && Number.isSafeInteger(options.limit) && options.limit >= 0) {
    list = list.slice(0, options.limit);
  }
  return list;
}

export function steamCoverRefreshAction(
  game: Game,
  proposedCoverAssetId: string | null,
  options: { force?: boolean } = {},
): SteamCoverRefreshAction {
  const locked = Boolean(game.steamOverrides?.coverAssetId);
  if (locked && !options.force) return "locked";
  if (proposedCoverAssetId == null) return "unchanged";
  if (game.coverAssetId === proposedCoverAssetId) return "unchanged";
  return "update";
}

export function withSteamCover(game: Game, coverAssetId: string, now: string): Game {
  return {
    ...game,
    coverAssetId,
    updatedAt: now,
  };
}
