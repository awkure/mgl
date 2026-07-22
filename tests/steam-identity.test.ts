import { describe, expect, it } from "vitest";
import {
  findDuplicateGame,
  normalizeGameTitle,
  parseSteamProfileInput,
} from "../src/domain/steamIdentity";
import type { Game } from "../src/domain/types";

const NOW = "2026-07-21T00:00:00.000Z";

function game(overrides: Partial<Game> & Pick<Game, "id" | "title">): Game {
  return {
    coverAssetId: null,
    steamAppId: null,
    importedVia: "manually", hoursPlayed: null, lastPlayedAt: null, achievementsUnlocked: null, achievementsTotal: null, steamOverrides: {}, platforms: ["Steam"],
    tags: [],
    status: "wishlist",
    placement: { tierId: "unranked", rank: 1024 },
    reviewMarkdown: "",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("parseSteamProfileInput", () => {
  it("parses steamID64, vanity, and profile URLs", () => {
    expect(parseSteamProfileInput("76561197960287930")).toEqual({ kind: "steamid64", value: "76561197960287930" });
    expect(parseSteamProfileInput("gabelogannewell")).toEqual({ kind: "vanity", value: "gabelogannewell" });
    expect(parseSteamProfileInput("https://steamcommunity.com/id/gabelogannewell/")).toEqual({
      kind: "vanity",
      value: "gabelogannewell",
    });
    expect(parseSteamProfileInput("https://steamcommunity.com/profiles/76561197960287930")).toEqual({
      kind: "steamid64",
      value: "76561197960287930",
    });
    expect(parseSteamProfileInput("steamcommunity.com/id/valve")).toEqual({ kind: "vanity", value: "valve" });
  });

  it("rejects empty and non-steam input", () => {
    expect(() => parseSteamProfileInput("")).toThrow(/Пустой/);
    expect(() => parseSteamProfileInput("https://example.com/id/foo")).toThrow(/steamcommunity/);
    expect(() => parseSteamProfileInput("not a profile!!!")).toThrow(/разобрать/);
  });
});

describe("normalizeGameTitle + findDuplicateGame", () => {
  it("normalizes whitespace and case", () => {
    expect(normalizeGameTitle("  Half-Life   2 ")).toBe("half-life 2");
  });

  it("prefers steamAppId over title", () => {
    const byId = game({ id: "a", title: "Other", steamAppId: 570 });
    const byTitle = game({ id: "b", title: "Dota 2", steamAppId: null });
    const games = { a: byId, b: byTitle };
    expect(findDuplicateGame(games, { steamAppId: 570, title: "Dota 2" })?.id).toBe("a");
    expect(findDuplicateGame(games, { title: "dota  2" })?.id).toBe("b");
    expect(findDuplicateGame(games, { steamAppId: 999 })).toBeNull();
  });
});
