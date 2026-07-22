import { describe, expect, it } from "vitest";
import type { HistoryEvent } from "../src/domain/historyTypes";
import { clusterHistoryByConsecutiveGame } from "../src/domain/historyCluster";

function event(
  overrides: Partial<HistoryEvent> & Pick<HistoryEvent, "id" | "gameId" | "changedAt">,
): HistoryEvent {
  return {
    entity: "game",
    entityId: overrides.gameId,
    field: "status",
    op: "set",
    before: "wishlist",
    after: "playing",
    title: `Title ${overrides.gameId}`,
    coverAssetId: null,
    ...overrides,
  };
}

describe("clusterHistoryByConsecutiveGame", () => {
  it("returns empty array for no events", () => {
    expect(clusterHistoryByConsecutiveGame([])).toEqual([]);
  });

  it("keeps interleaved games as separate clusters", () => {
    const events = [
      event({ id: "e1", gameId: "gA", changedAt: "2026-01-03T00:00:00.000Z" }),
      event({ id: "e2", gameId: "gB", changedAt: "2026-01-02T00:00:00.000Z" }),
      event({ id: "e3", gameId: "gA", changedAt: "2026-01-01T00:00:00.000Z" }),
    ];
    const clusters = clusterHistoryByConsecutiveGame(events);
    expect(clusters).toHaveLength(3);
    expect(clusters.map((c) => c.gameId)).toEqual(["gA", "gB", "gA"]);
    expect(clusters[0]!.events.map((e) => e.id)).toEqual(["e1"]);
    expect(clusters[1]!.events.map((e) => e.id)).toEqual(["e2"]);
    expect(clusters[2]!.events.map((e) => e.id)).toEqual(["e3"]);
  });

  it("merges adjacent same-game events into one cluster newest-first", () => {
    const events = [
      event({
        id: "e2",
        gameId: "g1",
        changedAt: "2026-01-02T00:00:00.000Z",
        title: "Older title",
      }),
      event({
        id: "e1",
        gameId: "g1",
        changedAt: "2026-01-03T00:00:00.000Z",
        title: "Newest title",
        coverAssetId: "cover-new",
      }),
    ];
    const clusters = clusterHistoryByConsecutiveGame(events);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toMatchObject({
      gameId: "g1",
      title: "Newest title",
      coverAssetId: "cover-new",
      changedAt: "2026-01-03T00:00:00.000Z",
    });
    expect(clusters[0]!.events.map((e) => e.id)).toEqual(["e1", "e2"]);
  });

  it("sorts by changedAt desc with id asc tie-break before clustering", () => {
    const events = [
      event({ id: "e-b", gameId: "g1", changedAt: "2026-01-01T00:00:00.000Z" }),
      event({ id: "e-a", gameId: "g1", changedAt: "2026-01-01T00:00:00.000Z" }),
      event({ id: "e-c", gameId: "g2", changedAt: "2026-01-01T00:00:00.000Z" }),
    ];
    const clusters = clusterHistoryByConsecutiveGame(events);
    expect(clusters).toHaveLength(2);
    expect(clusters[0]!.events.map((e) => e.id)).toEqual(["e-a", "e-b"]);
    expect(clusters[1]!.gameId).toBe("g2");
  });
});
