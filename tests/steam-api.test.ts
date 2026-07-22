import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAppDetails,
  getOwnedGames,
  getPlayerAchievements,
  getPlayerSummary,
  getSchemaForGame,
  getUserScreenshots,
  getUserVideos,
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

  it("treats HTTP 400 no-stats as unavailable, not throw", async () => {
    mockJson(
      { playerstats: { error: "Requested app has no stats", success: false } },
      false,
      400,
    );
    await expect(getPlayerAchievements("key", "76561197960287930", 70)).resolves.toEqual({
      available: false,
      unlocked: null,
    });
  });

  it("still throws on non-400 player achievement HTTP errors", async () => {
    mockJson({ playerstats: { error: "boom" } }, false, 500);
    await expect(getPlayerAchievements("key", "76561197960287930", 70)).rejects.toMatchObject({
      status: 500,
      code: "http_error",
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
    });
  });

  it("ignores storefront movies for appdetails prefill slice", async () => {
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
          ],
          movies: [
            { id: 10, name: "  Launch  ", thumbnail: "https://example.com/thumb.jpg" },
          ],
        },
      },
    });
    await expect(getAppDetails(570)).resolves.toEqual({
      type: "game",
      name: "Dota 2",
      genres: ["Action"],
      headerImage: "https://example.com/header.jpg",
    });
  });

  it("paginates profile screenshots and prefers file_url", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.pathname).toContain("/IPublishedFileService/GetUserFiles/v1/");
      expect(url.searchParams.get("filetype")).toBe("4");
      expect(url.searchParams.get("appid")).toBe("570");
      expect(url.searchParams.get("numperpage")).toBe("100");
      const page = Number(url.searchParams.get("page"));
      if (page === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            response: {
              total: 2,
              publishedfiledetails: [
                {
                  publishedfileid: "111",
                  file_url: "https://cdn.example/full1.jpg",
                  preview_url: "https://cdn.example/preview1.jpg",
                },
                {
                  publishedfileid: "222",
                  preview_url: "https://cdn.example/preview2.jpg",
                },
              ],
            },
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ response: { total: 2, publishedfiledetails: [] } }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getUserScreenshots("key", "76561197960287930", 570)).resolves.toEqual([
      { id: "111", pathFull: "https://cdn.example/full1.jpg" },
      { id: "222", pathFull: "https://cdn.example/preview2.jpg" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("walks multiple GetUserFiles pages", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const page = Number(new URL(String(input)).searchParams.get("page"));
      if (page === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            response: {
              total: 101,
              publishedfiledetails: Array.from({ length: 100 }, (_, index) => ({
                publishedfileid: String(index + 1),
                file_url: `https://cdn.example/${index + 1}.jpg`,
              })),
            },
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          response: {
            total: 101,
            publishedfiledetails: [
              { publishedfileid: "101", file_url: "https://cdn.example/101.jpg" },
            ],
          },
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const shots = await getUserScreenshots("key", "76561197960287930", 570);
    expect(shots).toHaveLength(101);
    expect(shots[100]).toEqual({ id: "101", pathFull: "https://cdn.example/101.jpg" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("maps profile videos with sharedfiles links and optional thumbs", async () => {
    mockJson({
      response: {
        total: 1,
        publishedfiledetails: [
          {
            publishedfileid: "999",
            title: "My clip",
            preview_url: "https://cdn.example/preview.jpg",
          },
        ],
      },
    });
    await expect(getUserVideos("key", "76561197960287930", 570)).resolves.toEqual([
      {
        id: "999",
        name: "My clip",
        url: "https://steamcommunity.com/sharedfiles/filedetails/?id=999",
        previewUrl: "https://cdn.example/preview.jpg",
      },
    ]);
  });

  it("skips profile screenshots without image URLs", async () => {
    mockJson({
      response: {
        total: 2,
        publishedfiledetails: [
          { publishedfileid: "1", file_url: "", preview_url: "" },
          { publishedfileid: "2", file_url: "https://cdn.example/ok.jpg" },
        ],
      },
    });
    await expect(getUserScreenshots("key", "76561197960287930", 570)).resolves.toEqual([
      { id: "2", pathFull: "https://cdn.example/ok.jpg" },
    ]);
  });
});
