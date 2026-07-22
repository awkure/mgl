import { bench, describe } from "vitest";
import {
  assertValidLibrary,
  catalogueFacets,
  gameMatchesFilters,
  type LibraryDatabase,
} from "../../src/domain";
import { generateGames } from "../fixtures/generateGames";

const TINY_GAME_ID = "11111111-1111-4111-8111-111111111111";

describe("catalog filter pipeline", () => {
  const games = generateGames(2000);

  bench("filter+sort 2000 games query=bench", () => {
    games
      .filter((game) =>
        gameMatchesFilters(game, {
          query: "bench",
          statuses: [],
          tiers: [],
          platforms: [],
          tags: [],
        }),
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  });

  bench("filter 2000 games status+tier facets", () => {
    games.filter((game) =>
      gameMatchesFilters(game, {
        query: "",
        statuses: ["playing", "completed"],
        tiers: ["s", "a"],
        platforms: ["PC"],
        tags: ["rpg"],
      }),
    );
  });

  const facetDatabase: LibraryDatabase = {
    schemaVersion: 2,
    revision: "",
    publicationId: null,
    games: Object.fromEntries(games.map((game) => [game.id, game])),
    notes: {},
    assets: {},
  };

  bench("catalogueFacets 2000 games", () => {
    catalogueFacets(facetDatabase);
  });
});

describe("library validation", () => {
  const [sample] = generateGames(1);
  const tinyLibrary: LibraryDatabase = {
    schemaVersion: 2,
    revision: "",
    publicationId: null,
    games: { [TINY_GAME_ID]: { ...sample, id: TINY_GAME_ID } },
    notes: {},
    assets: {},
  };

  bench("assertValidLibrary single-game library", () => {
    assertValidLibrary(structuredClone(tinyLibrary));
  });
});
