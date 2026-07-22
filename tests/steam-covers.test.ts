import { describe, expect, it } from "vitest";
import {
  selectSteamCoverTargets,
  steamCoverRefreshAction,
  withSteamCover,
} from "../src/domain/steamCovers";
import { buildSteamUpsertPatch } from "../src/domain/steamReimport";
import type { Game } from "../src/domain/types";

const NOW = "2026-07-22T12:00:00.000Z";
const COVER_A = "a".repeat(64);
const COVER_B = "b".repeat(64);

function game(overrides: Partial<Game> & Pick<Game, "id" | "title">): Game {
  return {
    coverAssetId: null,
    steamAppId: null,
    importedVia: "steam",
    hoursPlayed: null,
    lastPlayedAt: null,
    achievementsUnlocked: null,
    achievementsTotal: null,
    steamOverrides: {},
    platforms: ["Steam"],
    tags: [],
    status: "played",
    placement: { tierId: "unranked", rank: 1024 },
    reviewMarkdown: "",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("selectSteamCoverTargets", () => {
  const games = {
    g1: game({ id: "g1", title: "A", steamAppId: 10 }),
    g2: game({ id: "g2", title: "B", steamAppId: 20 }),
    g3: game({ id: "g3", title: "Manual", steamAppId: null }),
    g4: game({ id: "g4", title: "Zero", steamAppId: 0 }),
  };

  it("keeps only positive steamAppId", () => {
    const ids = selectSteamCoverTargets(games, {}).map((g) => g.id).sort();
    expect(ids).toEqual(["g1", "g2"]);
  });

  it("filters by appids", () => {
    expect(selectSteamCoverTargets(games, { appids: [20] }).map((g) => g.id)).toEqual(["g2"]);
  });

  it("empty appids selects no targets", () => {
    expect(selectSteamCoverTargets(games, { appids: [] })).toEqual([]);
  });

  it("filters by gameId", () => {
    expect(selectSteamCoverTargets(games, { gameId: "g1" }).map((g) => g.id)).toEqual(["g1"]);
  });

  it("applies limit after filter", () => {
    expect(selectSteamCoverTargets(games, { limit: 1 })).toHaveLength(1);
  });
});

describe("steamCoverRefreshAction", () => {
  it("skips locked without force", () => {
    const g = game({
      id: "g1",
      title: "A",
      steamAppId: 10,
      coverAssetId: COVER_A,
      steamOverrides: { coverAssetId: true },
    });
    expect(steamCoverRefreshAction(g, COVER_B, { force: false })).toBe("locked");
  });

  it("updates locked with force", () => {
    const g = game({
      id: "g1",
      title: "A",
      steamAppId: 10,
      coverAssetId: COVER_A,
      steamOverrides: { coverAssetId: true },
    });
    expect(steamCoverRefreshAction(g, COVER_B, { force: true })).toBe("update");
  });

  it("unchanged when same id", () => {
    const g = game({ id: "g1", title: "A", steamAppId: 10, coverAssetId: COVER_A });
    expect(steamCoverRefreshAction(g, COVER_A, { force: false })).toBe("unchanged");
  });

  it("overwrite when same id with force", () => {
    const g = game({ id: "g1", title: "A", steamAppId: 10, coverAssetId: COVER_A });
    expect(steamCoverRefreshAction(g, COVER_A, { force: true })).toBe("overwrite");
  });

  it("overwrite locked same id with force", () => {
    const g = game({
      id: "g1",
      title: "A",
      steamAppId: 10,
      coverAssetId: COVER_A,
      steamOverrides: { coverAssetId: true },
    });
    expect(steamCoverRefreshAction(g, COVER_A, { force: true })).toBe("overwrite");
  });

  it("unchanged when proposed cover is null", () => {
    const g = game({ id: "g1", title: "A", steamAppId: 10, coverAssetId: COVER_A });
    expect(steamCoverRefreshAction(g, null, { force: false })).toBe("unchanged");
  });

  it("update when different id", () => {
    const g = game({ id: "g1", title: "A", steamAppId: 10, coverAssetId: COVER_A });
    expect(steamCoverRefreshAction(g, COVER_B, { force: false })).toBe("update");
  });

  it("locked wins over same-id check without force", () => {
    const g = game({
      id: "g1",
      title: "A",
      steamAppId: 10,
      coverAssetId: COVER_A,
      steamOverrides: { coverAssetId: true },
    });
    expect(steamCoverRefreshAction(g, COVER_A, { force: false })).toBe("locked");
  });
});

describe("withSteamCover + patch shape", () => {
  it("emits only coverAssetId field op (updatedAt comes from op changedAt on apply)", () => {
    const previous = game({
      id: "g1",
      title: "A",
      steamAppId: 10,
      coverAssetId: COVER_A,
      updatedAt: "2026-07-21T12:00:00.000Z",
    });
    const next = withSteamCover(previous, COVER_B, NOW);
    expect(next.updatedAt).toBe(NOW);
    expect(next.steamOverrides).toEqual({});
    const cover = {
      asset: {
        id: COVER_B,
        kind: "image" as const,
        mime: "image/webp",
        width: 512,
        height: 512,
        byteLength: 10,
        alt: "A",
        originalName: "steam-10.webp",
      },
      base64: "QQ==",
    };
    const patch = buildSteamUpsertPatch("rev", [
      { kind: "update", game: next, previousGame: previous, cover },
    ], { now: NOW, transactionId: "t" });
    const paths = Object.keys(patch.operations).sort();
    expect(paths).toEqual([
      `/assets/${COVER_B}`,
      `/games/g1/coverAssetId`,
    ]);
    expect(patch.operations[`/games/g1/coverAssetId`]?.changedAt).toBe(NOW);
  });
});
