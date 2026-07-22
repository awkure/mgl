import { describe, expect, it } from "vitest";
import {
  filterSteamImportCandidates,
  hoursFromSteamMinutes,
  mapSteamCandidateToGame,
  rejectExcludedTypes,
  statusFromPlaytime,
} from "../src/domain/steamImport";
import type { Game } from "../src/domain/types";

const NOW = "2026-07-21T00:00:00.000Z";

function game(overrides: Partial<Game> & Pick<Game, "id" | "title">): Game {
  return {
    coverAssetId: null,
    steamAppId: null,
    importedVia: "manually", hoursPlayed: null, lastPlayedAt: null, steamOverrides: {}, platforms: ["Steam"],
    tags: [],
    status: "wishlist",
    placement: { tierId: "unranked", rank: 1024 },
    reviewMarkdown: "",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("statusFromPlaytime", () => {
  it("maps playtime to status", () => {
    expect(statusFromPlaytime(0, 0)).toBe("wishlist");
    expect(statusFromPlaytime(10, 0)).toBe("played");
    expect(statusFromPlaytime(10, 5)).toBe("playing");
  });
});

describe("filterSteamImportCandidates", () => {
  const owned = [
    { appid: 10, name: "Counter-Strike", playtime_forever: 100 },
    { appid: 20, name: "Some Demo", playtime_forever: 5 },
    { appid: 30, name: "Idle Clicker", playtime_forever: 0 },
    { appid: 40, name: "Half-Life 2", playtime_forever: 50 },
  ];

  it("dedups by steamAppId and excludes demo names", () => {
    const existing = {
      a: game({ id: "a", title: "Other", steamAppId: 40 }),
    };
    const result = filterSteamImportCandidates(owned, { existingGames: existing });
    expect(result.candidates.map((c) => c.appid)).toEqual([10, 30]);
    expect(result.skippedDuplicate).toBe(1);
    expect(result.skippedFilter).toBe(1);
  });

  it("supports played-only, appids, and limit", () => {
    const result = filterSteamImportCandidates(owned, {
      existingGames: {},
      playedOnly: true,
      appids: [10, 20, 30],
      limit: 1,
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].appid).toBe(10);
  });
});

describe("rejectExcludedTypes + mapSteamCandidateToGame", () => {
  it("drops dlc/demo types after details", () => {
    const { kept, skippedFilter } = rejectExcludedTypes([
      { appid: 1, name: "Game", playtime_forever: 1, playtime_2weeks: 0, rtime_last_played: 0, details: { type: "game" } },
      { appid: 2, name: "Pack", playtime_forever: 1, playtime_2weeks: 0, rtime_last_played: 0, details: { type: "dlc" } },
    ]);
    expect(kept).toHaveLength(1);
    expect(skippedFilter).toBe(1);
  });

  it("maps candidate fields onto Game", () => {
    const mapped = mapSteamCandidateToGame({
      id: "11111111-1111-4111-8111-111111111111",
      appid: 570,
      name: "Dota 2",
      genres: ["Action", "Free to Play", "action"],
      playtimeForever: 0,
      playtime2Weeks: 12,
      coverAssetId: null,
      now: NOW,
      rankIndex: 2,
    });
    expect(mapped).toMatchObject({
      title: "Dota 2",
      steamAppId: 570,
      importedVia: "steam",
      hoursPlayed: 0,
      lastPlayedAt: null, steamOverrides: {},
      platforms: ["Steam"],
      tags: ["Action", "Free to Play"],
      status: "playing",
      placement: { tierId: "unranked", rank: 3072 },
      reviewMarkdown: "",
      coverAssetId: null,
    });
  });

  it("converts Steam minutes to hoursPlayed", () => {
    expect(hoursFromSteamMinutes(90)).toBe(1.5);
    expect(hoursFromSteamMinutes(0)).toBe(0);
    const mapped = mapSteamCandidateToGame({
      id: "11111111-1111-4111-8111-111111111111",
      appid: 620,
      name: "Portal 2",
      playtimeForever: 125,
      coverAssetId: null,
      now: NOW,
      rankIndex: 0,
    });
    expect(mapped.hoursPlayed).toBe(2.1);
  });

  it("maps rtime_last_played to lastPlayedAt ISO", async () => {
    const { lastPlayedAtFromSteam } = await import("../src/domain/steamImport");
    expect(lastPlayedAtFromSteam(0)).toBeNull();
    expect(lastPlayedAtFromSteam(undefined)).toBeNull();
    expect(lastPlayedAtFromSteam(1_700_000_000)).toBe("2023-11-14T22:13:20.000Z");
    const mapped = mapSteamCandidateToGame({
      id: "11111111-1111-4111-8111-111111111111",
      appid: 620,
      name: "Portal 2",
      rtimeLastPlayed: 1_700_000_000,
      coverAssetId: null,
      now: NOW,
      rankIndex: 0,
    });
    expect(mapped.lastPlayedAt).toBe("2023-11-14T22:13:20.000Z");
  });

  it("builds a patch with game and cover ops", async () => {
    const { buildSteamImportPatch } = await import("../src/domain/steamImport");
    const game = mapSteamCandidateToGame({
      id: "11111111-1111-4111-8111-111111111111",
      appid: 570,
      name: "Dota 2",
      coverAssetId: "a".repeat(64),
      now: NOW,
      rankIndex: 0,
    });
    const cover = {
      asset: {
        id: "a".repeat(64),
        kind: "image" as const,
        mime: "image/webp" as const,
        width: 512,
        height: 512,
        byteLength: 4,
        alt: "Dota 2",
        originalName: "steam-570.webp",
      },
      base64: "AAAA",
    };
    const patch = buildSteamImportPatch("rev", [{ game, cover }], { now: NOW, transactionId: "t1" });
    expect(patch.patchVersion).toBe(2);
    expect(patch.baseRevision).toBe("rev");
    expect(Object.keys(patch.operations).sort()).toEqual([
      `/assets/${"a".repeat(64)}`,
      `/games/${game.id}`,
    ]);
    expect(patch.blobs["a".repeat(64)]).toBe("AAAA");
  });
});
