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
  const body = await steamGet("/IPlayerService/GetOwnedGames/v1/", {
    key,
    steamid,
    include_appinfo: 0,
    include_played_free_games: 1,
  });
  const response = body?.response;
  if (!response || !Array.isArray(response.games)) {
    return { visible: false, gameCount: 0 };
  }
  return {
    visible: true,
    gameCount: typeof response.game_count === "number" ? response.game_count : response.games.length,
  };
}
