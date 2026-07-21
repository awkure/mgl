import type { Game } from "./types";

export type SteamProfileRef =
  | { kind: "steamid64"; value: string }
  | { kind: "vanity"; value: string };

const STEAM_ID64 = /^7656119\d{10}$/;
const VANITY = /^[A-Za-z0-9_-]{2,64}$/;

function toGameList(games: Iterable<Game> | Record<string, Game>): Game[] {
  if (Array.isArray(games)) return games;
  if (games && typeof games === "object" && Object.prototype.toString.call(games) === "[object Object]") {
    return Object.values(games as Record<string, Game>);
  }
  return [...(games as Iterable<Game>)];
}

/** Parse raw steamID64, vanity name, or steamcommunity profile URL. */
export function parseSteamProfileInput(input: string): SteamProfileRef {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Пустой Steam профиль");

  if (STEAM_ID64.test(trimmed)) return { kind: "steamid64", value: trimmed };

  let path = trimmed;
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("steamcommunity.com/")) {
    let url: URL;
    try {
      url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    } catch {
      throw new Error("Некорректный Steam URL");
    }
    if (!/(^|\.)steamcommunity\.com$/i.test(url.hostname)) {
      throw new Error("Ожидался URL steamcommunity.com");
    }
    path = url.pathname;
  }

  const normalizedPath = path.replace(/\/+$/, "");
  const profiles = normalizedPath.match(/\/profiles\/(7656119\d{10})$/i);
  if (profiles) return { kind: "steamid64", value: profiles[1] };
  const vanityMatch = normalizedPath.match(/\/id\/([^/]+)$/i);
  if (vanityMatch) {
    const name = decodeURIComponent(vanityMatch[1]);
    if (!VANITY.test(name)) throw new Error("Некорректный vanity URL");
    return { kind: "vanity", value: name };
  }

  if (VANITY.test(trimmed) && !trimmed.includes("/")) return { kind: "vanity", value: trimmed };
  throw new Error("Не удалось разобрать Steam профиль");
}

export function normalizeGameTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru");
}

export function findGameBySteamAppId(
  games: Iterable<Game> | Record<string, Game>,
  steamAppId: number,
): Game | null {
  if (!Number.isSafeInteger(steamAppId) || steamAppId <= 0) return null;
  return toGameList(games).find((game) => game.steamAppId === steamAppId) ?? null;
}

export function findGameByNormalizedTitle(
  games: Iterable<Game> | Record<string, Game>,
  title: string,
): Game | null {
  const needle = normalizeGameTitle(title);
  if (!needle) return null;
  return toGameList(games).find((game) => normalizeGameTitle(game.title) === needle) ?? null;
}

/** Prefer steamAppId match; fall back to normalized title. */
export function findDuplicateGame(
  games: Iterable<Game> | Record<string, Game>,
  query: { steamAppId?: number | null; title?: string },
): Game | null {
  if (query.steamAppId != null) {
    const byId = findGameBySteamAppId(games, query.steamAppId);
    if (byId) return byId;
  }
  if (query.title != null && query.title.trim()) {
    return findGameByNormalizedTitle(games, query.title);
  }
  return null;
}
