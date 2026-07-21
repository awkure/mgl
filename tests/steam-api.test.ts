import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getPlayerSummary,
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
});
