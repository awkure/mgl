import { STATUS_IDS, type StatusId } from "../domain/types";

export const RANDOM_GAME_STATUSES_STORAGE_KEY = "my-game-library.random-game-statuses.v1";

export const DEFAULT_RANDOM_GAME_STATUSES: readonly StatusId[] = ["wishlist", "playing", "played"];

export const RANDOM_GAME_STATUSES_CHANGED_EVENT = "mgl:random-game-statuses";

const STATUS_SET = new Set<string>(STATUS_IDS);

function isStatusId(value: unknown): value is StatusId {
  return typeof value === "string" && STATUS_SET.has(value);
}

/** Dedupes, keeps STATUS_IDS order, requires ≥1 valid status. */
export function normalizeRandomGameStatuses(value: unknown): StatusId[] | null {
  if (!Array.isArray(value)) return null;
  const selected = new Set<StatusId>();
  for (const item of value) {
    if (isStatusId(item)) selected.add(item);
  }
  const ordered = STATUS_IDS.filter((id) => selected.has(id));
  return ordered.length ? ordered : null;
}

export function loadRandomGameStatuses(): StatusId[] {
  try {
    const raw = localStorage.getItem(RANDOM_GAME_STATUSES_STORAGE_KEY);
    if (raw === null) return [...DEFAULT_RANDOM_GAME_STATUSES];
    const parsed: unknown = JSON.parse(raw);
    return normalizeRandomGameStatuses(parsed) ?? [...DEFAULT_RANDOM_GAME_STATUSES];
  } catch {
    return [...DEFAULT_RANDOM_GAME_STATUSES];
  }
}

export function saveRandomGameStatuses(statuses: StatusId[]): void {
  const normalized = normalizeRandomGameStatuses(statuses) ?? [...DEFAULT_RANDOM_GAME_STATUSES];
  try {
    localStorage.setItem(RANDOM_GAME_STATUSES_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Safari private mode / storage blocked
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(RANDOM_GAME_STATUSES_CHANGED_EVENT));
  }
}
