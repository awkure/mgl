import { describe, expect, it } from "vitest";
import type { Game } from "../src/domain/types";
import {
  buildSnapshotGameFromCandidate,
  canWriteAchievementProgress,
  mergeSteamGameUpdate,
  snapshotGamesEqual,
  type SteamSnapshotGame,
} from "../src/domain/steamReimport";

const NOW = "2026-07-22T12:00:00.000Z";

function baseGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Test Game",
    coverAssetId: null,
    steamAppId: 570,
    importedVia: "steam",
    hoursPlayed: 10,
    lastPlayedAt: "2026-01-01T00:00:00.000Z",
    steamOverrides: {},
    platforms: ["Steam"],
    tags: ["Action"],
    status: "played",
    placement: { tierId: "a", rank: 2048 },
    reviewMarkdown: "Great game",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function snap(overrides: Partial<SteamSnapshotGame> = {}): SteamSnapshotGame {
  return {
    name: "Test Game",
    playtimeForever: 600,
    playtime2Weeks: 0,
    rtimeLastPlayed: 1735689600,
    genres: ["Action"],
    headerImage: "https://cdn.example/header.jpg",
    ...overrides,
  };
}

describe("snapshotGamesEqual", () => {
  it("returns true for identical data", () => {
    expect(snapshotGamesEqual(snap(), snap())).toBe(true);
  });

  it("is order-insensitive for genres", () => {
    expect(snapshotGamesEqual(snap({ genres: ["RPG", "Action"] }), snap({ genres: ["Action", "RPG"] }))).toBe(true);
  });

  it("returns false on header or playtime mismatch", () => {
    expect(snapshotGamesEqual(snap(), snap({ headerImage: null }))).toBe(false);
    expect(snapshotGamesEqual(snap(), snap({ playtimeForever: 601 }))).toBe(false);
  });
});

describe("canWriteAchievementProgress", () => {
  it("blocks platinum without force", () => {
    expect(canWriteAchievementProgress("platinum", false)).toBe(false);
  });

  it("allows platinum with force", () => {
    expect(canWriteAchievementProgress("platinum", true)).toBe(true);
  });

  it("allows other statuses without force", () => {
    expect(canWriteAchievementProgress("played", false)).toBe(true);
    expect(canWriteAchievementProgress("completed", false)).toBe(true);
  });
});

describe("mergeSteamGameUpdate", () => {
  it("always updates hours when proposed differs", () => {
    const result = mergeSteamGameUpdate({
      existing: baseGame({ hoursPlayed: 10 }),
      proposed: {
        title: "Test Game",
        tags: ["Action"],
        status: "played",
        hoursPlayed: 20,
        lastPlayedAt: "2026-01-01T00:00:00.000Z",
        coverAssetId: null,
      },
      force: false,
      now: NOW,
    });
    expect(result.game?.hoursPlayed).toBe(20);
    expect(result.changedKeys).toContain("hoursPlayed");
  });

  it("keeps marked title without force; updates with force", () => {
    const locked = baseGame({ steamOverrides: { title: true } });
    const noForce = mergeSteamGameUpdate({
      existing: locked,
      proposed: {
        title: "Steam Title",
        tags: ["Action"],
        status: "played",
        hoursPlayed: 10,
        lastPlayedAt: "2026-01-01T00:00:00.000Z",
        coverAssetId: null,
      },
      force: false,
      now: NOW,
    });
    expect(noForce.game).toBeNull();
    expect(noForce.skipReason).toBe("locked");

    const forced = mergeSteamGameUpdate({
      existing: locked,
      proposed: {
        title: "Steam Title",
        tags: ["Action"],
        status: "played",
        hoursPlayed: 10,
        lastPlayedAt: "2026-01-01T00:00:00.000Z",
        coverAssetId: null,
      },
      force: true,
      now: NOW,
    });
    expect(forced.game?.title).toBe("Steam Title");
  });

  it("does not overwrite platinum status without force; does with force", () => {
    const platinum = baseGame({ status: "platinum", steamOverrides: {} });
    const noForce = mergeSteamGameUpdate({
      existing: platinum,
      proposed: {
        title: "Test Game",
        tags: ["Action"],
        status: "playing",
        hoursPlayed: 10,
        lastPlayedAt: "2026-01-01T00:00:00.000Z",
        coverAssetId: null,
      },
      force: false,
      now: NOW,
    });
    expect(noForce.game).toBeNull();
    expect(noForce.skipReason).toBe("locked");

    const forced = mergeSteamGameUpdate({
      existing: platinum,
      proposed: {
        title: "Test Game",
        tags: ["Action"],
        status: "playing",
        hoursPlayed: 10,
        lastPlayedAt: "2026-01-01T00:00:00.000Z",
        coverAssetId: null,
      },
      force: true,
      now: NOW,
    });
    expect(forced.game?.status).toBe("playing");
  });

  it("updates soft played to playing when proposed is playing", () => {
    const result = mergeSteamGameUpdate({
      existing: baseGame({ status: "played" }),
      proposed: {
        title: "Test Game",
        tags: ["Action"],
        status: "playing",
        hoursPlayed: 10,
        lastPlayedAt: "2026-01-01T00:00:00.000Z",
        coverAssetId: null,
      },
      force: false,
      now: NOW,
    });
    expect(result.game?.status).toBe("playing");
  });

  it("never changes placement or reviewMarkdown even with force", () => {
    const existing = baseGame({
      placement: { tierId: "s", rank: 512 },
      reviewMarkdown: "My review",
    });
    const result = mergeSteamGameUpdate({
      existing,
      proposed: {
        title: "New Title",
        tags: ["RPG"],
        status: "playing",
        hoursPlayed: 99,
        lastPlayedAt: null,
        coverAssetId: "abc123",
      },
      force: true,
      now: NOW,
    });
    expect(result.game?.placement).toEqual({ tierId: "s", rank: 512 });
    expect(result.game?.reviewMarkdown).toBe("My review");
  });

  it("returns locked skip when only locked fields would change", () => {
    const result = mergeSteamGameUpdate({
      existing: baseGame({
        steamOverrides: { title: true, tags: true, status: true, coverAssetId: true },
      }),
      proposed: {
        title: "Other",
        tags: ["RPG"],
        status: "playing",
        hoursPlayed: 10,
        lastPlayedAt: "2026-01-01T00:00:00.000Z",
        coverAssetId: "new-cover",
      },
      force: false,
      now: NOW,
    });
    expect(result.game).toBeNull();
    expect(result.skipReason).toBe("locked");
  });

  it("returns unchanged skip when nothing differs", () => {
    const existing = baseGame();
    const result = mergeSteamGameUpdate({
      existing,
      proposed: {
        title: existing.title,
        tags: [...existing.tags],
        status: existing.status,
        hoursPlayed: existing.hoursPlayed ?? 0,
        lastPlayedAt: existing.lastPlayedAt,
        coverAssetId: null,
      },
      force: false,
      now: NOW,
    });
    expect(result.game).toBeNull();
    expect(result.skipReason).toBe("unchanged");
    expect(result.changedKeys).toEqual([]);
  });
});

describe("buildSnapshotGameFromCandidate", () => {
  it("maps candidate fields onto snapshot slice", () => {
    const built = buildSnapshotGameFromCandidate({
      name: "Dota 2",
      playtime_forever: 120,
      playtime_2weeks: 30,
      rtime_last_played: 1700000000,
      details: { genres: ["Action", "Free to Play"], headerImage: "https://cdn/h.jpg" },
    });
    expect(built).toEqual({
      name: "Dota 2",
      playtimeForever: 120,
      playtime2Weeks: 30,
      rtimeLastPlayed: 1700000000,
      genres: ["Action", "Free to Play"],
      headerImage: "https://cdn/h.jpg",
    });
  });
});
