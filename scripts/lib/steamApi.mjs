/** Steam Web API helpers for Node scripts. Key must never ship to the Vite client. */

const API_ROOT = "https://api.steampowered.com";

export class SteamApiError extends Error {
  constructor(message, { code = "steam_api_error", status = null } = {}) {
    super(message);
    this.name = "SteamApiError";
    this.code = code;
    this.status = status;
  }
}

async function steamGet(pathname, params) {
  const url = new URL(pathname, API_ROOT);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new SteamApiError(`Steam API HTTP ${response.status}`, {
      code: "http_error",
      status: response.status,
    });
  }
  return response.json();
}

/** @param {string} key @param {string} vanity */
export async function resolveVanityUrl(key, vanity) {
  const body = await steamGet("/ISteamUser/ResolveVanityURL/v1/", { key, vanityurl: vanity });
  const response = body?.response;
  if (!response || Number(response.success) !== 1 || !response.steamid) {
    throw new SteamApiError(`Не удалось найти vanity «${vanity}»`, { code: "vanity_not_found" });
  }
  return String(response.steamid);
}

/**
 * @param {string} key
 * @param {{ kind: "steamid64" | "vanity"; value: string }} ref
 */
export async function resolveSteamId(key, ref) {
  if (ref.kind === "steamid64") return ref.value;
  return resolveVanityUrl(key, ref.value);
}

/** @param {string} key @param {string} steamid */
export async function getPlayerSummary(key, steamid) {
  const body = await steamGet("/ISteamUser/GetPlayerSummaries/v2/", { key, steamids: steamid });
  const player = body?.response?.players?.[0];
  if (!player) {
    throw new SteamApiError(`Профиль ${steamid} не найден`, { code: "player_not_found" });
  }
  return player;
}

/**
 * Probe library visibility via GetOwnedGames (not communityvisibilitystate alone).
 * @param {string} key
 * @param {string} steamid
 * @returns {Promise<{ visible: boolean; gameCount: number }>}
 */
export async function probeOwnedGamesVisibility(key, steamid) {
  const result = await getOwnedGames(key, steamid, {
    includeAppInfo: false,
    includePlayedFreeGames: true,
  });
  if (!result.visible) return { visible: false, gameCount: 0 };
  return { visible: true, gameCount: result.gameCount };
}

/**
 * @param {string} key
 * @param {string} steamid
 * @param {{ includeAppInfo?: boolean; includePlayedFreeGames?: boolean }} [options]
 * @returns {Promise<{ visible: boolean; gameCount: number; games: Array<Record<string, unknown>> }>}
 */
export async function getOwnedGames(key, steamid, options = {}) {
  const body = await steamGet("/IPlayerService/GetOwnedGames/v1/", {
    key,
    steamid,
    include_appinfo: options.includeAppInfo === false ? 0 : 1,
    include_played_free_games: options.includePlayedFreeGames === false ? 0 : 1,
  });
  const response = body?.response;
  if (!response || !Array.isArray(response.games)) {
    return { visible: false, gameCount: 0, games: [] };
  }
  return {
    visible: true,
    gameCount: typeof response.game_count === "number" ? response.game_count : response.games.length,
    games: response.games,
  };
}

/**
 * Community-published screenshots for a Steam profile + app (UGC filetype=4).
 * Prefer file_url, else preview_url. Paginate until exhausted.
 * @param {string} key
 * @param {string} steamid
 * @param {number|string} appid
 * @returns {Promise<Array<{ id: string; pathFull: string }>>}
 */
export async function getUserScreenshots(key, steamid, appid) {
  const PAGE_SIZE = 100;
  /** @type {Array<{ id: string; pathFull: string }>} */
  const collected = [];
  let page = 1;
  let total = Infinity;

  while (page <= 1000) {
    const body = await steamGet("/IPublishedFileService/GetUserFiles/v1/", {
      key,
      steamid,
      appid,
      filetype: 4,
      numperpage: PAGE_SIZE,
      page,
      return_previews: 1,
    });
    const response = body?.response ?? {};
    total = typeof response.total === "number" ? response.total : 0;
    const details = Array.isArray(response.publishedfiledetails)
      ? response.publishedfiledetails
      : [];
    if (total === 0 || details.length === 0) break;

    for (const item of details) {
      const pathFull = String(item?.file_url || item?.preview_url || "").trim();
      if (!pathFull) continue;
      const id = String(item?.publishedfileid ?? "").trim();
      if (!id) continue;
      collected.push({ id, pathFull });
    }

    if (page * PAGE_SIZE >= total || details.length < PAGE_SIZE) break;
    page += 1;
  }

  return collected;
}

/**
 * Unofficial storefront API (no Web API key).
 * @param {number|string} appid
 * @param {{ language?: string }} [options]
 * @returns {Promise<null | { type?: string; name?: string; genres: string[]; headerImage: string | null; movies: Array<{ id: number; name: string; thumbnail: string | null }> }>}
 */
export async function getAppDetails(appid, options = {}) {
  const language = options.language ?? "russian";
  const url = new URL("https://store.steampowered.com/api/appdetails");
  url.searchParams.set("appids", String(appid));
  url.searchParams.set("l", language);
  const response = await fetch(url);
  if (!response.ok) {
    throw new SteamApiError(`Storefront HTTP ${response.status}`, {
      code: "http_error",
      status: response.status,
    });
  }
  const body = await response.json();
  const entry = body?.[String(appid)];
  if (!entry?.success || !entry.data) return null;
  const data = entry.data;
  const genres = Array.isArray(data.genres)
    ? data.genres.map((item) => String(item?.description ?? "").trim()).filter(Boolean)
    : [];
  const movies = Array.isArray(data.movies)
    ? data.movies.map((m) => ({
        id: Number(m.id),
        name: String(m.name ?? "Trailer").trim() || "Trailer",
        thumbnail: typeof m.thumbnail === "string" ? m.thumbnail : null,
      }))
    : [];
  return {
    type: typeof data.type === "string" ? data.type : undefined,
    name: typeof data.name === "string" ? data.name : undefined,
    genres,
    headerImage: typeof data.header_image === "string" ? data.header_image : null,
    movies,
  };
}

/**
 * @param {string} key
 * @param {number|string} appid
 * @returns {Promise<{ total: number } | null>}
 */
export async function getSchemaForGame(key, appid) {
  const body = await steamGet("/ISteamUserStats/GetSchemaForGame/v2/", { key, appid });
  const achievements = body?.game?.availableGameStats?.achievements;
  if (!Array.isArray(achievements)) return null;
  return { total: achievements.length };
}

/**
 * @param {string} key
 * @param {string} steamid
 * @param {number|string} appid
 * @returns {Promise<{ available: boolean; unlocked: number | null }>}
 */
export async function getPlayerAchievements(key, steamid, appid) {
  const body = await steamGet("/ISteamUserStats/GetPlayerAchievements/v1/", {
    key,
    steamid,
    appid,
  });
  const playerstats = body?.playerstats;
  if (!playerstats || playerstats.success === false) {
    return { available: false, unlocked: null };
  }
  const list = playerstats.achievements;
  if (!Array.isArray(list)) return { available: true, unlocked: 0 };
  const unlocked = list.filter((item) => Number(item?.achieved) === 1).length;
  return { available: true, unlocked };
}

/** @param {number} minIntervalMs */
export function createThrottle(minIntervalMs = 1500) {
  let lastAt = 0;
  return async function throttle() {
    const now = Date.now();
    const wait = lastAt + minIntervalMs - now;
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastAt = Date.now();
  };
}

/**
 * @template T
 * @param {() => Promise<T>} run
 * @param {{ retries?: number; retryDelayMs?: number }} [options]
 */
export async function withRetry(run, options = {}) {
  const retries = options.retries ?? 1;
  const retryDelayMs = options.retryDelayMs ?? 2000;
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await run();
    } catch (reason) {
      lastError = reason;
      if (attempt >= retries) break;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
  throw lastError;
}
