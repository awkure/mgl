import { describe, expect, it } from "vitest";
import type { Game, LibraryDatabase, Note, PatchEnvelope } from "../src/domain/types";
import {
  diffLibraryToHistoryEvents,
  historyEventId,
  seedHistoryEventsFromLibrary,
} from "../src/domain/historyDiff";

const REV = "a".repeat(64);

function emptyLibrary(): LibraryDatabase {
  return {
    schemaVersion: 2,
    revision: REV,
    publicationId: null,
    games: {},
    notes: {},
    assets: {},
  };
}

function baseGame(overrides: Partial<Game> & Pick<Game, "id">): Game {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    title: "Hades",
    coverAssetId: "cover".padEnd(64, "0"),
    steamAppId: null,
    importedVia: "manually",
    hoursPlayed: null,
    lastPlayedAt: null,
    achievementsUnlocked: null,
    achievementsTotal: null,
    steamOverrides: {},
    platforms: [],
    tags: [],
    status: "wishlist",
    placement: { tierId: "unranked", rank: 1024 },
    reviewMarkdown: "",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function baseNote(overrides: Partial<Note> & Pick<Note, "id" | "gameId">): Note {
  const now = "2026-01-02T00:00:00.000Z";
  return {
    bodyMarkdown: "note body",
    attachments: [],
    rank: 1024,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function minimalPatch(operations: PatchEnvelope["operations"]): PatchEnvelope {
  return {
    patchVersion: 2,
    schemaVersion: 2,
    baseRevision: REV,
    operations,
    blobs: {},
  };
}

describe("diffLibraryToHistoryEvents", () => {
  it("emits status field change with patch changedAt", () => {
    const g1 = baseGame({ id: "g1", status: "wishlist", updatedAt: "2026-01-03T00:00:00.000Z" });
    const before = emptyLibrary();
    before.games.g1 = g1;
    const after = emptyLibrary();
    after.games.g1 = { ...g1, status: "playing", updatedAt: "2026-01-04T00:00:00.000Z" };
    const patchChangedAt = "2026-07-01T12:00:00.000Z";
    const patch = minimalPatch({
      "/games/g1/status": {
        operation: "set",
        value: "playing",
        baseExists: true,
        baseHash: REV,
        changedAt: patchChangedAt,
        transactionId: "tx-1",
      },
    });

    const events = diffLibraryToHistoryEvents({ before, after, patch });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      changedAt: patchChangedAt,
      entity: "game",
      entityId: "g1",
      gameId: "g1",
      field: "status",
      op: "set",
      before: "wishlist",
      after: "playing",
      title: "Hades",
      coverAssetId: g1.coverAssetId,
    });
    const { id, ...parts } = events[0];
    expect(id).toBe(historyEventId(parts));
  });

  it("emits create for new game", () => {
    const g1 = baseGame({ id: "g1", createdAt: "2026-02-01T10:00:00.000Z", updatedAt: "2026-02-01T10:00:00.000Z" });
    const before = emptyLibrary();
    const after = emptyLibrary();
    after.games.g1 = g1;

    const events = diffLibraryToHistoryEvents({ before, after });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      changedAt: g1.createdAt,
      entity: "game",
      entityId: "g1",
      gameId: "g1",
      field: null,
      op: "create",
      before: null,
      after: null,
      title: "Hades",
      coverAssetId: g1.coverAssetId,
    });
  });

  it("emits note body update under parent gameId", () => {
    const g1 = baseGame({ id: "g1" });
    const n1 = baseNote({ id: "n1", gameId: "g1", bodyMarkdown: "old", updatedAt: "2026-03-01T00:00:00.000Z" });
    const before = emptyLibrary();
    before.games.g1 = g1;
    before.notes.n1 = n1;
    const after = emptyLibrary();
    after.games.g1 = g1;
    after.notes.n1 = { ...n1, bodyMarkdown: "new", updatedAt: "2026-03-02T00:00:00.000Z" };

    const events = diffLibraryToHistoryEvents({ before, after });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      entity: "note",
      entityId: "n1",
      gameId: "g1",
      field: "bodyMarkdown",
      op: "set",
      before: null,
      after: null,
      title: "Hades",
      coverAssetId: g1.coverAssetId,
    });
  });

  it("seed emits create per game and note", () => {
    const g1 = baseGame({ id: "g1", createdAt: "2026-04-01T08:00:00.000Z" });
    const n1 = baseNote({ id: "n1", gameId: "g1", createdAt: "2026-04-02T09:00:00.000Z" });
    const library = emptyLibrary();
    library.games.g1 = g1;
    library.notes.n1 = n1;

    const events = seedHistoryEventsFromLibrary(library);
    expect(events).toHaveLength(2);
    const gameEvent = events.find((e) => e.entity === "game");
    const noteEvent = events.find((e) => e.entity === "note");
    expect(gameEvent).toMatchObject({
      op: "create",
      entityId: "g1",
      gameId: "g1",
      changedAt: g1.createdAt,
      field: null,
    });
    expect(noteEvent).toMatchObject({
      op: "create",
      entityId: "n1",
      gameId: "g1",
      changedAt: n1.createdAt,
      field: null,
    });
  });

  it("stable id is deterministic", () => {
    const parts = {
      changedAt: "2026-05-01T00:00:00.000Z",
      entity: "game" as const,
      entityId: "g1",
      gameId: "g1",
      field: "status",
      op: "set" as const,
      before: "wishlist",
      after: "playing",
      title: "Hades",
      coverAssetId: null,
    };
    expect(historyEventId(parts)).toBe(historyEventId(parts));
    expect(historyEventId(parts)).toMatch(/^[0-9a-f]{64}$/);
  });
});
