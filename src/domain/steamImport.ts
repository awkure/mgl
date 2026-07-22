import type { Game, StatusId } from "./types";

export interface SteamOwnedGame {
  appid: number;
  name?: string;
  playtime_forever?: number;
  playtime_2weeks?: number;
  rtime_last_played?: number;
}

export interface SteamAppDetailsSlice {
  type?: string;
  name?: string;
  genres?: string[];
  headerImage?: string | null;
  screenshots?: Array<{ id: number; pathFull: string; pathThumbnail: string }>;
  movies?: Array<{ id: number; name: string; thumbnail: string | null }>;
}

export interface SteamImportCandidate {
  appid: number;
  name: string;
  playtime_forever: number;
  playtime_2weeks: number;
  rtime_last_played: number;
  details: SteamAppDetailsSlice | null;
}

export interface SteamImportFilterOptions {
  playedOnly?: boolean;
  appids?: readonly number[];
  /** Max candidates after filters/dedup (before type filter if details missing). */
  limit?: number;
  existingGames: Iterable<Game> | Record<string, Game>;
}

export interface SteamImportFilterResult {
  candidates: SteamImportCandidate[];
  fetched: number;
  skippedDuplicate: number;
  skippedFilter: number;
}

const EXCLUDED_TYPES = new Set(["demo", "mod", "software", "video", "hardware", "dlc"]);
const NAME_EXCLUDE =
  /\b(demo|soundtrack|ost)\b|\(demo\)|official\s+soundtrack/i;

function toGameList(games: Iterable<Game> | Record<string, Game>): Game[] {
  if (Array.isArray(games)) return games;
  if (games && typeof games === "object" && Object.prototype.toString.call(games) === "[object Object]") {
    return Object.values(games as Record<string, Game>);
  }
  return [...(games as Iterable<Game>)];
}

function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru");
}

function findDuplicate(
  games: Iterable<Game> | Record<string, Game>,
  query: { steamAppId?: number | null; title?: string },
): Game | null {
  const list = toGameList(games);
  if (query.steamAppId != null) {
    const byId = list.find((game) => game.steamAppId === query.steamAppId);
    if (byId) return byId;
  }
  if (query.title != null && query.title.trim()) {
    const needle = normalizeTitle(query.title);
    if (needle) return list.find((game) => normalizeTitle(game.title) === needle) ?? null;
  }
  return null;
}

export function statusFromPlaytime(playtimeForever = 0, playtime2Weeks = 0): StatusId {
  if (playtime2Weeks > 0) return "playing";
  if (playtimeForever > 0) return "played";
  return "wishlist";
}

export function isExcludedSteamName(name: string): boolean {
  return NAME_EXCLUDE.test(name.trim());
}

export function isExcludedSteamType(type: string | undefined | null): boolean {
  if (!type) return false;
  return EXCLUDED_TYPES.has(type.trim().toLowerCase());
}

export interface SteamImportFilterResult {
  candidates: SteamImportCandidate[];
  fetched: number;
  skippedDuplicate: number;
  skippedFilter: number;
}

export interface SteamImportClassification {
  creates: SteamImportCandidate[];
  updates: Array<{ candidate: SteamImportCandidate; existing: Game }>;
  fetched: number;
  skippedFilter: number;
  /** kept for logs; preferably 0 when reimport enabled */
  skippedDuplicate: number;
}

type ClassifiedEntry =
  | { kind: "create"; candidate: SteamImportCandidate }
  | { kind: "update"; candidate: SteamImportCandidate; existing: Game };

function buildSteamImportCandidate(row: SteamOwnedGame, name: string): SteamImportCandidate {
  return {
    appid: row.appid,
    name,
    playtime_forever: row.playtime_forever ?? 0,
    playtime_2weeks: row.playtime_2weeks ?? 0,
    rtime_last_played: row.rtime_last_played ?? 0,
    details: null,
  };
}

function passesSteamImportRowFilters(
  row: SteamOwnedGame,
  options: SteamImportFilterOptions,
  appidAllow: Set<number> | null,
): { pass: true; name: string } | { pass: false } {
  const name = (row.name ?? "").trim();
  if (!row.appid || !name) return { pass: false };
  if (appidAllow && !appidAllow.has(row.appid)) return { pass: false };
  const playtimeForever = row.playtime_forever ?? 0;
  if (options.playedOnly && playtimeForever <= 0) return { pass: false };
  if (isExcludedSteamName(name)) return { pass: false };
  return { pass: true, name };
}

export function classifySteamOwnedGames(
  owned: readonly SteamOwnedGame[],
  options: SteamImportFilterOptions,
): SteamImportClassification {
  const appidAllow = options.appids?.length ? new Set(options.appids) : null;
  const entries: ClassifiedEntry[] = [];
  let skippedFilter = 0;

  for (const row of owned) {
    const filterResult = passesSteamImportRowFilters(row, options, appidAllow);
    if (!filterResult.pass) {
      skippedFilter += 1;
      continue;
    }
    const candidate = buildSteamImportCandidate(row, filterResult.name);
    const existing = findDuplicate(options.existingGames, {
      steamAppId: row.appid,
      title: filterResult.name,
    });
    if (existing) {
      entries.push({ kind: "update", candidate, existing });
    } else {
      entries.push({ kind: "create", candidate });
    }
  }

  const limited =
    options.limit != null && options.limit >= 0
      ? entries.slice(0, options.limit)
      : entries;

  const creates: SteamImportCandidate[] = [];
  const updates: Array<{ candidate: SteamImportCandidate; existing: Game }> = [];
  for (const entry of limited) {
    if (entry.kind === "create") {
      creates.push(entry.candidate);
    } else {
      updates.push({ candidate: entry.candidate, existing: entry.existing });
    }
  }

  return {
    creates,
    updates,
    fetched: owned.length,
    skippedFilter,
    skippedDuplicate: 0,
  };
}

export function filterSteamImportCandidates(
  owned: readonly SteamOwnedGame[],
  options: SteamImportFilterOptions,
): SteamImportFilterResult {
  const classified = classifySteamOwnedGames(owned, options);
  return {
    candidates: classified.creates,
    fetched: classified.fetched,
    skippedDuplicate: classified.skippedDuplicate,
    skippedFilter: classified.skippedFilter,
  };
}

/** Drop demos/DLC/etc. after storefront details are attached. */
export function rejectExcludedTypes(
  candidates: readonly SteamImportCandidate[],
): { kept: SteamImportCandidate[]; skippedFilter: number } {
  const kept: SteamImportCandidate[] = [];
  let skippedFilter = 0;
  for (const candidate of candidates) {
    if (isExcludedSteamType(candidate.details?.type)) {
      skippedFilter += 1;
      continue;
    }
    kept.push(candidate);
  }
  return { kept, skippedFilter };
}

export function uniqueTagList(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const trimmed = tag.trim();
    if (!trimmed) continue;
    const key = trimmed.toLocaleLowerCase("ru");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export interface MapSteamGameInput {
  id: string;
  appid: number;
  name: string;
  genres?: readonly string[];
  playtimeForever?: number;
  playtime2Weeks?: number;
  /** Steam unix seconds `rtime_last_played`. */
  rtimeLastPlayed?: number;
  coverAssetId: string | null;
  now: string;
  /** 0-based index among imported games for unique unranked ranks. */
  rankIndex: number;
}

/** Steam `playtime_forever` is minutes; store hours to 1 decimal. */
export function hoursFromSteamMinutes(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  return Math.round((minutes / 60) * 10) / 10;
}

/** Steam `rtime_last_played` is unix seconds; store ISO or null. */
export function lastPlayedAtFromSteam(rtimeLastPlayed?: number): string | null {
  if (!Number.isFinite(rtimeLastPlayed) || (rtimeLastPlayed as number) <= 0) return null;
  return new Date((rtimeLastPlayed as number) * 1000).toISOString();
}

export function mapSteamCandidateToGame(input: MapSteamGameInput): Game {
  const title = (input.name.trim() || `Steam ${input.appid}`).slice(0, 500);
  const playtimeForever = input.playtimeForever ?? 0;
  return {
    id: input.id,
    title,
    coverAssetId: input.coverAssetId,
    steamAppId: input.appid,
    importedVia: "steam",
    hoursPlayed: hoursFromSteamMinutes(playtimeForever),
    lastPlayedAt: lastPlayedAtFromSteam(input.rtimeLastPlayed),
    achievementsUnlocked: null,
    achievementsTotal: null,
    steamOverrides: {},
    platforms: ["Steam"],
    tags: uniqueTagList(input.genres ?? []),
    status: statusFromPlaytime(playtimeForever, input.playtime2Weeks ?? 0),
    placement: { tierId: "unranked", rank: (input.rankIndex + 1) * 1024 },
    reviewMarkdown: "",
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export interface SteamImportAssetBlob {
  asset: {
    id: string;
    kind: "image";
    mime: "image/webp";
    width: number;
    height: number;
    byteLength: number;
    alt: string;
    originalName: string;
  };
  base64: string;
}

export interface SteamImportPatchItem {
  game: Game;
  cover?: SteamImportAssetBlob | null;
}

const MISSING_VALUE_HASH = "0".repeat(64);

/** Build a V2 OperationPatch for new Steam games (+ optional cover assets). */
export function buildSteamImportPatch(
  baseRevision: string,
  items: readonly SteamImportPatchItem[],
  options: { now?: string; transactionId?: string } = {},
): {
  patchVersion: 2;
  schemaVersion: 2;
  baseRevision: string;
  operations: Record<string, {
    operation: "set";
    value: unknown;
    baseExists: false;
    baseHash: string;
    changedAt: string;
    transactionId: string;
  }>;
  blobs: Record<string, string>;
} {
  const now = options.now ?? new Date().toISOString();
  const transactionId = options.transactionId ?? `steam-import-${now}`;
  const operations: Record<string, {
    operation: "set";
    value: unknown;
    baseExists: false;
    baseHash: string;
    changedAt: string;
    transactionId: string;
  }> = {};
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
    operations[`/games/${item.game.id}`] = {
      operation: "set",
      value: item.game,
      baseExists: false,
      baseHash: MISSING_VALUE_HASH,
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
