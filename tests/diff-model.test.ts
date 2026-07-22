import { describe, expect, it } from "vitest";
import {
  assetSummary,
  classifyDiff,
  entityName,
} from "../src/App/diffModel";
import type { LibraryDatabase, PatchOperation } from "../src/domain";

const GAME_ID = "11111111-1111-4111-8111-111111111111";
const NOTE_ID = "22222222-2222-4222-8222-222222222222";
const ASSET_ID = "a".repeat(64);
const NOW = "2026-07-16T10:00:00.000Z";

function empty(): LibraryDatabase {
  return { schemaVersion: 2, revision: "", publicationId: null, games: {}, notes: {}, assets: {} };
}

function op(overrides: Partial<PatchOperation> & Pick<PatchOperation, "operation">): PatchOperation {
  return {
    baseExists: false,
    baseHash: "",
    changedAt: NOW,
    transactionId: "tx-1",
    ...overrides,
  };
}

describe("classifyDiff", () => {
  it("marks asset paths as assets", () => {
    expect(classifyDiff(`/assets/${ASSET_ID}`, op({ operation: "set", value: {} }))).toBe("assets");
  });

  it("marks rank-related fields as moved", () => {
    expect(classifyDiff(`/games/${GAME_ID}/placement`, op({ operation: "set", value: {}, baseExists: true }))).toBe("moved");
    expect(classifyDiff(`/notes/${NOTE_ID}/rank`, op({ operation: "set", value: 2048, baseExists: true }))).toBe("moved");
  });

  it("marks new root entities as added", () => {
    expect(classifyDiff(`/games/${GAME_ID}`, op({ operation: "set", value: {}, baseExists: false }))).toBe("added");
  });

  it("marks root deletes as deleted", () => {
    expect(classifyDiff(`/games/${GAME_ID}`, op({ operation: "delete", baseExists: true }))).toBe("deleted");
  });

  it("marks field edits as changed", () => {
    expect(classifyDiff(`/games/${GAME_ID}/title`, op({ operation: "set", value: "New", baseExists: true }))).toBe("changed");
  });
});

describe("assetSummary", () => {
  it("passes through non-objects", () => {
    expect(assetSummary(null)).toBe(null);
    expect(assetSummary("raw")).toBe("raw");
  });

  it("summarizes asset metadata for conflict display", () => {
    expect(assetSummary({
      kind: "image",
      mime: "image/webp",
      width: 100,
      height: 50,
      byteLength: 1234,
      alt: "cover",
      originalName: "cover.webp",
    })).toEqual({
      kind: "image",
      type: "image/webp",
      width: 100,
      height: 50,
      bytes: 1234,
      alt: "cover",
      originalName: "cover.webp",
    });
  });
});

describe("entityName", () => {
  it("uses game title from effective or base", () => {
    const effective = empty();
    effective.games[GAME_ID] = {
      id: GAME_ID,
      title: "Effective Title",
      coverAssetId: null,
      steamAppId: null,
      importedVia: "manually",
      hoursPlayed: null,
      lastPlayedAt: null, steamOverrides: {},
      platforms: [],
      tags: [],
      status: "playing",
      placement: { tierId: "a", rank: 1024 },
      reviewMarkdown: "",
      createdAt: NOW,
      updatedAt: NOW,
    };
    expect(entityName("games", GAME_ID, op({ operation: "delete", baseExists: true }), effective, empty())).toBe("Effective Title");
  });

  it("labels notes with linked game title", () => {
    const base = empty();
    base.games[GAME_ID] = {
      id: GAME_ID,
      title: "DuckTales",
      coverAssetId: null,
      steamAppId: null,
      importedVia: "manually",
      hoursPlayed: null,
      lastPlayedAt: null, steamOverrides: {},
      platforms: [],
      tags: [],
      status: "playing",
      placement: { tierId: "a", rank: 1024 },
      reviewMarkdown: "",
      createdAt: NOW,
      updatedAt: NOW,
    };
    base.notes[NOTE_ID] = {
      id: NOTE_ID,
      gameId: GAME_ID,
      bodyMarkdown: "text",
      attachments: [],
      rank: 1024,
      createdAt: NOW,
      updatedAt: NOW,
    };
    expect(entityName("notes", NOTE_ID, op({ operation: "set", value: {}, baseExists: true }), empty(), base)).toBe("Заметка · DuckTales");
  });
});
