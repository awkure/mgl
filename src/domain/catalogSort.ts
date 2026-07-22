import type { Game } from "./types";

export const CATALOG_SORT_KEYS = ["title", "lastPlayed", "hoursPlayed", "updated"] as const;
export type CatalogSortKey = (typeof CATALOG_SORT_KEYS)[number];
export type CatalogSortDir = "asc" | "desc";

export interface CatalogSort {
  key: CatalogSortKey;
  dir: CatalogSortDir;
}

export const DEFAULT_CATALOG_SORT: CatalogSort = { key: "updated", dir: "desc" };
export const CATALOG_SORT_STORAGE_KEY = "my-game-library.catalog-sort.v1";
export const CATALOG_SORT_EVENT = "mylib-catalog-sort";

export const CATALOG_SORT_LABELS: Record<CatalogSortKey, string> = {
  title: "Название",
  lastPlayed: "Последняя игра",
  hoursPlayed: "Часов в игре",
  updated: "Обновлено",
};

function isCatalogSortKey(value: unknown): value is CatalogSortKey {
  return typeof value === "string" && (CATALOG_SORT_KEYS as readonly string[]).includes(value);
}

function isCatalogSortDir(value: unknown): value is CatalogSortDir {
  return value === "asc" || value === "desc";
}

export function parseCatalogSort(raw: string | null): CatalogSort {
  if (!raw) return { ...DEFAULT_CATALOG_SORT };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ...DEFAULT_CATALOG_SORT };
    const record = parsed as Record<string, unknown>;
    if (!isCatalogSortKey(record.key) || !isCatalogSortDir(record.dir)) return { ...DEFAULT_CATALOG_SORT };
    return { key: record.key, dir: record.dir };
  } catch {
    return { ...DEFAULT_CATALOG_SORT };
  }
}

export function serializeCatalogSort(sort: CatalogSort): string {
  return JSON.stringify({ key: sort.key, dir: sort.dir });
}

export function loadCatalogSort(storage: Pick<Storage, "getItem">): CatalogSort {
  try {
    return parseCatalogSort(storage.getItem(CATALOG_SORT_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_CATALOG_SORT };
  }
}

export function saveCatalogSort(storage: Pick<Storage, "setItem">, sort: CatalogSort): void {
  storage.setItem(CATALOG_SORT_STORAGE_KEY, serializeCatalogSort(sort));
}

function titleCompare(left: Game, right: Game): number {
  return left.title.localeCompare(right.title, "ru", { sensitivity: "base", numeric: true }) || left.id.localeCompare(right.id);
}

function primaryValue(game: Game, key: CatalogSortKey): string | number | null {
  switch (key) {
    case "title":
      return game.title;
    case "lastPlayed":
      return game.lastPlayedAt;
    case "hoursPlayed":
      return game.hoursPlayed;
    case "updated":
      return game.updatedAt;
  }
}

function comparePrimary(left: string | number, right: string | number): number {
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right), "ru", { sensitivity: "base", numeric: true });
}

export function sortCatalogGames(games: readonly Game[], sort: CatalogSort): Game[] {
  const dir = sort.dir === "asc" ? 1 : -1;
  return [...games].sort((left, right) => {
    const leftValue = primaryValue(left, sort.key);
    const rightValue = primaryValue(right, sort.key);
    const leftNull = leftValue == null;
    const rightNull = rightValue == null;
    if (leftNull && rightNull) return titleCompare(left, right);
    if (leftNull) return 1;
    if (rightNull) return -1;
    const primary = comparePrimary(leftValue, rightValue) * dir;
    return primary || titleCompare(left, right);
  });
}
