import { describe, expect, it } from "vitest";
import {
  DEFAULT_CATALOG_SORT,
  loadCatalogSort,
  parseCatalogSort,
  sortCatalogGames,
  type CatalogSort,
} from "../src/domain/catalogSort";
import type { Game } from "../src/domain/types";

const NOW = "2026-07-16T10:00:00.000Z";

function game(partial: Partial<Game> & Pick<Game, "id" | "title">): Game {
  return {
    coverAssetId: null,
    steamAppId: null,
    importedVia: "manually",
    hoursPlayed: null,
    lastPlayedAt: null,
    platforms: [],
    tags: [],
    status: "played",
    placement: { tierId: "unranked", rank: 1024 },
    reviewMarkdown: "",
    createdAt: NOW,
    updatedAt: NOW,
    ...partial,
  };
}

describe("catalogSort", () => {
  it("defaults corrupt storage to updated desc", () => {
    expect(parseCatalogSort(null)).toEqual(DEFAULT_CATALOG_SORT);
    expect(parseCatalogSort("{")).toEqual(DEFAULT_CATALOG_SORT);
    expect(parseCatalogSort(JSON.stringify({ key: "nope", dir: "asc" }))).toEqual(DEFAULT_CATALOG_SORT);
    expect(loadCatalogSort({ getItem: () => "not-json" })).toEqual(DEFAULT_CATALOG_SORT);
  });

  it("sorts by title ascending", () => {
    const games = [game({ id: "b", title: "Яблоко" }), game({ id: "a", title: "Абрикос" })];
    const sort: CatalogSort = { key: "title", dir: "asc" };
    expect(sortCatalogGames(games, sort).map((item) => item.title)).toEqual(["Абрикос", "Яблоко"]);
  });

  it("sorts by hoursPlayed descending with nulls last", () => {
    const games = [
      game({ id: "1", title: "A", hoursPlayed: 1 }),
      game({ id: "2", title: "B", hoursPlayed: null }),
      game({ id: "3", title: "C", hoursPlayed: 10 }),
    ];
    expect(sortCatalogGames(games, { key: "hoursPlayed", dir: "desc" }).map((item) => item.id)).toEqual(["3", "1", "2"]);
    expect(sortCatalogGames(games, { key: "hoursPlayed", dir: "asc" }).map((item) => item.id)).toEqual(["1", "3", "2"]);
  });

  it("sorts by lastPlayed with nulls always last", () => {
    const games = [
      game({ id: "old", title: "Old", lastPlayedAt: "2020-01-01T00:00:00.000Z" }),
      game({ id: "new", title: "New", lastPlayedAt: "2024-01-01T00:00:00.000Z" }),
      game({ id: "none", title: "None", lastPlayedAt: null }),
    ];
    expect(sortCatalogGames(games, { key: "lastPlayed", dir: "desc" }).map((item) => item.id)).toEqual(["new", "old", "none"]);
    expect(sortCatalogGames(games, { key: "lastPlayed", dir: "asc" }).map((item) => item.id)).toEqual(["old", "new", "none"]);
  });
});
