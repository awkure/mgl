import { describe, expect, it } from "vitest";
import { validateHistoryFile } from "../src/domain/historyValidate";

describe("validateHistoryFile", () => {
  it("accepts empty events", () => {
    expect(validateHistoryFile({ schemaVersion: 1, events: [] }).events).toEqual([]);
  });

  it("rejects wrong schemaVersion", () => {
    expect(() => validateHistoryFile({ schemaVersion: 2, events: [] })).toThrow();
  });

  it("rejects event missing gameId", () => {
    expect(() => validateHistoryFile({
      schemaVersion: 1,
      events: [{
        id: "x",
        changedAt: "2026-01-01T00:00:00.000Z",
        entity: "game",
        entityId: "g1",
        field: "status",
        op: "set",
        before: "backlog",
        after: "playing",
        title: "Hades",
        coverAssetId: null,
      }],
    })).toThrow();
  });
});
