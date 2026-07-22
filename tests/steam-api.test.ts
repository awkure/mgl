import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAppDetails,
  getOwnedGames,
  getPlayerAchievements,
  getPlayerSummary,
  getSchemaForGame,
  probeOwnedGamesVisibility,
  resolveSteamId,
  resolveVanityUrl,
  SteamApiError,
} from "../scripts/lib/steamApi.mjs";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mockJson(data, ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok,
      status,
      json: async () => data,
    })),
  );
}

describe("steamApi", () => {
  it("resolves vanity URLs", async () => {
    mockJson({ response: { success: 1, steamid: "76561197960287930" } });
    await expect(resolveVanityUrl("key", "gabelogannewell")).resolves.toBe("76561197960287930");
    await expect(resolveSteamId("key", { kind: "steamid64", value: "76561197960287930" })).resolves.toBe(
      "76561197960287930",
    );
  });

  it("fails when vanity is missing", async () => {
    mockJson({ response: { success: 42 } });
    await expect(resolveVanityUrl("key", "nope")).rejects.toBeInstanceOf(SteamApiError);
  });

  it("reads player summary", async () => {
    mockJson({
      response: {
        players: [{ steamid: "76561197960287930", personaname: "Gabe" }],
      },
    });
    await expect(getPlayerSummary("key", "76561197960287930")).resolves.toMatchObject({
      personaname: "Gabe",
    });
  });

  it("detects hidden owned games", async () => {
    mockJson({ response: {} });
    await expect(probeOwnedGamesVisibility("key", "76561197960287930")).resolves.toEqual({
      visible: false,
      gameCount: 0,
    });
  });

  it("reports visible library game_count", async () => {
    mockJson({ response: { game_count: 2, games: [{ appid: 10 }, { appid: 20 }] } });
    await expect(probeOwnedGamesVisibility("key", "76561197960287930")).resolves.toEqual({
      visible: true,
      gameCount: 2,
    });
  });

  it("returns owned games with appinfo", async () => {
    mockJson({
      response: {
        game_count: 1,
        games: [{ appid: 570, name: "Dota 2", playtime_forever: 12 }],
      },
    });
    await expect(getOwnedGames("key", "76561197960287930")).resolves.toMatchObject({
      visible: true,
      gameCount: 1,
      games: [{ appid: 570, name: "Dota 2" }],
    });
  });

  it("parses schema achievement total", async () => {
    mockJson({
      game: {
        availableGameStats: {
          achievements: [{ name: "A" }, { name: "B" }, { name: "C" }],
        },
      },
    });
    await expect(getSchemaForGame("key", 570)).resolves.toEqual({ total: 3 });
  });

  it("returns null schema when achievements missing", async () => {
    mockJson({ game: { availableGameStats: {} } });
    await expect(getSchemaForGame("key", 570)).resolves.toBeNull();
  });

  it("counts player unlocks when stats available", async () => {
    mockJson({
      playerstats: {
        success: true,
        achievements: [
          { apiname: "a", achieved: 1 },
          { apiname: "b", achieved: 0 },
          { apiname: "c", achieved: 1 },
        ],
      },
    });
    await expect(getPlayerAchievements("key", "76561197960287930", 570)).resolves.toEqual({
      available: true,
      unlocked: 2,
    });
  });

  it("treats private or failed player stats as unavailable", async () => {
    mockJson({ playerstats: { success: false } });
    await expect(getPlayerAchievements("key", "76561197960287930", 570)).resolves.toEqual({
      available: false,
      unlocked: null,
    });
  });

  it("returns zero unlocks for empty achievement list", async () => {
    mockJson({ playerstats: { success: true, achievements: [] } });
    await expect(getPlayerAchievements("key", "76561197960287930", 570)).resolves.toEqual({
      available: true,
      unlocked: 0,
    });
  });

  it("parses storefront appdetails", async () => {
    mockJson({
      "570": {
        success: true,
        data: {
          type: "game",
          name: "Dota 2",
          genres: [{ description: "Action" }],
          header_image: "https://example.com/header.jpg",
        },
      },
    });
    await expect(getAppDetails(570)).resolves.toEqual({
      type: "game",
      name: "Dota 2",
      genres: ["Action"],
      headerImage: "https://example.com/header.jpg",
      screenshots: [],
      movies: [],
    });
  });

  it("parses storefront screenshots and movies", async () => {
    mockJson({
      "570": {
        success: true,
        data: {
          type: "game",
          name: "Dota 2",
          genres: [{ description: "Action" }],
          header_image: "https://example.com/header.jpg",
          screenshots: [
            { id: 1, path_full: "https://example.com/shot1.jpg", path_thumbnail: "https://example.com/t1.jpg" },
            { id: 2, path_full: "", path_thumbnail: "https://example.com/t2.jpg" },
          ],
          movies: [
            { id: 10, name: "  Launch  ", thumbnail: "https://example.com/thumb.jpg" },
            { id: 11, name: "", thumbnail: 42 },
          ],
        },
      },
    });
    await expect(getAppDetails(570)).resolves.toEqual({
      type: "game",
      name: "Dota 2",
      genres: ["Action"],
      headerImage: "https://example.com/header.jpg",
      screenshots: [
        { id: 1, pathFull: "https://example.com/shot1.jpg", pathThumbnail: "https://example.com/t1.jpg" },
      ],
      movies: [
        { id: 10, name: "Launch", thumbnail: "https://example.com/thumb.jpg" },
        { id: 11, name: "Trailer", thumbnail: null },
      ],
    });
  });
});
