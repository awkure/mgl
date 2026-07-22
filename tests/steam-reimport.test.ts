import { describe, expect, it } from "vitest";
import type { Game } from "../src/domain/types";
import {
  achievementCountsFromSteam,
  buildSnapshotGameFromCandidate,
  canWriteAchievementProgress,
  mergeSteamGameUpdate,
  nextSteamOverrides,
  proposeSteamFieldsFromCandidate,
  snapshotGamesEqual,
  type SteamProposedFields,
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
    achievementsUnlocked: null,
    achievementsTotal: null,
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
    achievementsUnlocked: null,
    achievementsTotal: null,
    ...overrides,
  };
}

function proposed(overrides: Partial<SteamProposedFields> = {}): SteamProposedFields {
  return {
    title: "Test Game",
    tags: ["Action"],
    status: "played",
    hoursPlayed: 10,
    lastPlayedAt: "2026-01-01T00:00:00.000Z",
    coverAssetId: null,
    achievementsUnlocked: null,
    achievementsTotal: null,
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

  it("returns false when achievement counts differ", () => {
    expect(snapshotGamesEqual(snap(), snap({ achievementsUnlocked: 5, achievementsTotal: 10 }))).toBe(false);
  });

  it("returns true when achievement counts match", () => {
    expect(
      snapshotGamesEqual(
        snap({ achievementsUnlocked: 12, achievementsTotal: 40 }),
        snap({ achievementsUnlocked: 12, achievementsTotal: 40 }),
      ),
    ).toBe(true);
  });

  it("returns false when one snapshot lacks achievement keys (legacy)", () => {
    const legacy = {
      name: "Test Game",
      playtimeForever: 600,
      playtime2Weeks: 0,
      rtimeLastPlayed: 1735689600,
      genres: ["Action"],
      headerImage: "https://cdn.example/header.jpg",
    } as SteamSnapshotGame;
    expect(snapshotGamesEqual(legacy, snap())).toBe(false);
  });
});

describe("achievementCountsFromSteam", () => {
  it("returns null when stats unavailable", () => {
    expect(
      achievementCountsFromSteam({ schemaTotal: 10, unlocked: 5, available: false }),
    ).toBeNull();
  });

  it("returns null for invalid schema or unlocked", () => {
    expect(achievementCountsFromSteam({ schemaTotal: null, unlocked: 5, available: true })).toBeNull();
    expect(achievementCountsFromSteam({ schemaTotal: 0, unlocked: 5, available: true })).toBeNull();
    expect(achievementCountsFromSteam({ schemaTotal: 10, unlocked: null, available: true })).toBeNull();
  });

  it("returns clamped counts when valid", () => {
    expect(achievementCountsFromSteam({ schemaTotal: 40, unlocked: 12, available: true })).toEqual({
      unlocked: 12,
      total: 40,
    });
    expect(achievementCountsFromSteam({ schemaTotal: 10, unlocked: 99, available: true })).toEqual({
      unlocked: 10,
      total: 10,
    });
    expect(achievementCountsFromSteam({ schemaTotal: 5, unlocked: -1, available: true })).toEqual({
      unlocked: 0,
      total: 5,
    });
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
      proposed: proposed({ hoursPlayed: 20 }),
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
      proposed: proposed({ title: "Steam Title" }),
      force: false,
      now: NOW,
    });
    expect(noForce.game).toBeNull();
    expect(noForce.skipReason).toBe("locked");

    const forced = mergeSteamGameUpdate({
      existing: locked,
      proposed: proposed({ title: "Steam Title" }),
      force: true,
      now: NOW,
    });
    expect(forced.game?.title).toBe("Steam Title");
  });

  it("does not overwrite platinum status without force; does with force", () => {
    const platinum = baseGame({ status: "platinum", steamOverrides: {} });
    const noForce = mergeSteamGameUpdate({
      existing: platinum,
      proposed: proposed({ status: "playing" }),
      force: false,
      now: NOW,
    });
    expect(noForce.game).toBeNull();
    expect(noForce.skipReason).toBe("locked");

    const forced = mergeSteamGameUpdate({
      existing: platinum,
      proposed: proposed({ status: "playing" }),
      force: true,
      now: NOW,
    });
    expect(forced.game?.status).toBe("playing");
  });

  it("updates soft played to playing when proposed is playing", () => {
    const result = mergeSteamGameUpdate({
      existing: baseGame({ status: "played" }),
      proposed: proposed({ status: "playing" }),
      force: false,
      now: NOW,
    });
    expect(result.game?.status).toBe("playing");
  });

  it("writes achievement counts when proposed differs and lock allows", () => {
    const result = mergeSteamGameUpdate({
      existing: baseGame({ achievementsUnlocked: null, achievementsTotal: null }),
      proposed: proposed({ achievementsUnlocked: 12, achievementsTotal: 40 }),
      force: false,
      now: NOW,
    });
    expect(result.game?.achievementsUnlocked).toBe(12);
    expect(result.game?.achievementsTotal).toBe(40);
    expect(result.changedKeys).toContain("achievementsUnlocked");
    expect(result.changedKeys).toContain("achievementsTotal");
  });

  it("skips achievement count writes on platinum without force", () => {
    const result = mergeSteamGameUpdate({
      existing: baseGame({
        status: "platinum",
        achievementsUnlocked: 30,
        achievementsTotal: 40,
      }),
      proposed: proposed({ achievementsUnlocked: 40, achievementsTotal: 40 }),
      force: false,
      now: NOW,
    });
    expect(result.game).toBeNull();
    expect(result.skipReason).toBe("locked");
  });

  it("auto-platinum on 100% when status is soft", () => {
    const result = mergeSteamGameUpdate({
      existing: baseGame({ status: "played" }),
      proposed: proposed({
        status: "wishlist",
        achievementsUnlocked: 40,
        achievementsTotal: 40,
      }),
      force: false,
      now: NOW,
    });
    expect(result.game?.status).toBe("platinum");
    expect(result.game?.achievementsUnlocked).toBe(40);
    expect(result.changedKeys).toContain("status");
  });

  it("100% does not auto-platinum completed without force", () => {
    const result = mergeSteamGameUpdate({
      existing: baseGame({ status: "completed" }),
      proposed: proposed({ achievementsUnlocked: 10, achievementsTotal: 10 }),
      force: false,
      now: NOW,
    });
    expect(result.game?.status).toBe("completed");
    expect(result.game?.achievementsUnlocked).toBe(10);
  });

  it("100% achievements override playtime status on soft game", () => {
    const result = mergeSteamGameUpdate({
      existing: baseGame({ status: "playing" }),
      proposed: proposed({
        status: "played",
        achievementsUnlocked: 5,
        achievementsTotal: 5,
      }),
      force: false,
      now: NOW,
    });
    expect(result.game?.status).toBe("platinum");
  });

  it("leaves existing counts when proposed achievement fields are null", () => {
    const result = mergeSteamGameUpdate({
      existing: baseGame({ achievementsUnlocked: 3, achievementsTotal: 20 }),
      proposed: proposed({ achievementsUnlocked: null, achievementsTotal: null }),
      force: false,
      now: NOW,
    });
    expect(result.skipReason).toBe("unchanged");
    expect(result.game).toBeNull();
  });

  it("never changes placement or reviewMarkdown even with force", () => {
    const existing = baseGame({
      placement: { tierId: "s", rank: 512 },
      reviewMarkdown: "My review",
    });
    const result = mergeSteamGameUpdate({
      existing,
      proposed: proposed({
        title: "New Title",
        tags: ["RPG"],
        status: "playing",
        hoursPlayed: 99,
        lastPlayedAt: null,
        coverAssetId: "abc123",
      }),
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
      proposed: proposed({
        title: "Other",
        tags: ["RPG"],
        status: "playing",
        coverAssetId: "new-cover",
      }),
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
      proposed: proposed({
        title: existing.title,
        tags: [...existing.tags],
        status: existing.status,
        hoursPlayed: existing.hoursPlayed ?? 0,
        lastPlayedAt: existing.lastPlayedAt,
      }),
      force: false,
      now: NOW,
    });
    expect(result.game).toBeNull();
    expect(result.skipReason).toBe("unchanged");
    expect(result.changedKeys).toEqual([]);
  });
  it("treats null hoursPlayed as 0 vs Steam zero minutes", () => {
    const result = mergeSteamGameUpdate({
      existing: baseGame({ hoursPlayed: null }),
      proposed: proposed({ hoursPlayed: 0 }),
      force: false,
      now: NOW,
    });
    expect(result.skipReason).toBe("unchanged");
    expect(result.game).toBeNull();
  });
});

describe("buildSteamUpsertPatch", () => {
  it("emits field ops for updates, not whole-game replace", async () => {
    const { buildSteamUpsertPatch } = await import("../src/domain/steamReimport");
    const { canonicalHash } = await import("../src/domain/canonical");
    const previous = baseGame({ title: "Before", hoursPlayed: 1 });
    const updated = baseGame({
      title: "After",
      hoursPlayed: 2,
      updatedAt: "2026-07-22T13:00:00.000Z",
    });
    const patch = buildSteamUpsertPatch(
      "rev-base",
      [{ kind: "update", game: updated, previousGame: previous }],
      { now: NOW, transactionId: "tx1" },
    );
    expect(patch.operations[`/games/${previous.id}`]).toBeUndefined();
    expect(patch.operations[`/games/${previous.id}/title`]).toMatchObject({
      operation: "set",
      value: "After",
      baseExists: true,
      baseHash: canonicalHash(previous.title),
      transactionId: "tx1",
    });
    expect(patch.operations[`/games/${previous.id}/hoursPlayed`]).toMatchObject({
      operation: "set",
      value: 2,
      baseExists: true,
      baseHash: canonicalHash(previous.hoursPlayed),
    });
    expect(patch.operations[`/games/${previous.id}/status`]).toBeUndefined();
  });

  it("keeps create ops on MISSING_VALUE_HASH base", async () => {
    const { buildSteamUpsertPatch } = await import("../src/domain/steamReimport");
    const { MISSING_VALUE_HASH } = await import("../src/domain/canonical");
    const created = baseGame({ id: "22222222-2222-4222-8222-222222222222" });
    const patch = buildSteamUpsertPatch("rev", [{ kind: "create", game: created }], { now: NOW });
    expect(patch.operations[`/games/${created.id}`]).toMatchObject({
      baseExists: false,
      baseHash: MISSING_VALUE_HASH,
    });
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
      achievementsUnlocked: null,
      achievementsTotal: null,
    });
  });

  it("includes optional achievement counts", () => {
    const built = buildSnapshotGameFromCandidate(
      {
        name: "Dota 2",
        playtime_forever: 120,
        playtime_2weeks: 30,
        rtime_last_played: 1700000000,
        details: { genres: ["Action"], headerImage: null },
      },
      { unlocked: 3, total: 10 },
    );
    expect(built.achievementsUnlocked).toBe(3);
    expect(built.achievementsTotal).toBe(10);
  });
});

describe("proposeSteamFieldsFromCandidate", () => {
  it("defaults achievement counts to null", () => {
    const fields = proposeSteamFieldsFromCandidate(
      {
        appid: 570,
        name: "Dota 2",
        playtime_forever: 0,
        playtime_2weeks: 0,
        rtime_last_played: 0,
        details: null,
      },
      null,
    );
    expect(fields.achievementsUnlocked).toBeNull();
    expect(fields.achievementsTotal).toBeNull();
  });

  it("passes through optional achievement counts", () => {
    const fields = proposeSteamFieldsFromCandidate(
      {
        appid: 570,
        name: "Dota 2",
        playtime_forever: 0,
        playtime_2weeks: 0,
        rtime_last_played: 0,
        details: null,
      },
      null,
      { unlocked: 7, total: 20 },
    );
    expect(fields.achievementsUnlocked).toBe(7);
    expect(fields.achievementsTotal).toBe(20);
  });
});

describe("nextSteamOverrides", () => {
  const fields = (game: Game) => ({
    title: game.title,
    tags: game.tags,
    status: game.status,
    coverAssetId: game.coverAssetId,
    importedVia: game.importedVia,
  });

  it("marks title when a Steam game title changes", () => {
    const previous = baseGame();
    const next = baseGame({ title: "Renamed" });
    expect(nextSteamOverrides(previous, fields(next))).toEqual({ title: true });
  });

  it("does not mark fields for manual games", () => {
    const previous = baseGame({ importedVia: "manually", steamAppId: null });
    const next = baseGame({ importedVia: "manually", steamAppId: null, title: "Renamed", status: "completed" });
    expect(nextSteamOverrides(previous, fields(next))).toEqual({});
  });

  it("marks coverAssetId when cover changes", () => {
    const coverAssetId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const previous = baseGame();
    const next = baseGame({ coverAssetId });
    expect(nextSteamOverrides(previous, fields(next))).toEqual({ coverAssetId: true });
  });
});
