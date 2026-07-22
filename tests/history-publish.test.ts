import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { publishPatchInRepository, MISSING_VALUE_HASH } from "../scripts/publish-patch.mjs";
import {
  appendHistoryEvents,
  diffLibraryToHistoryEvents,
  emptyHistoryFile,
  formatHistoryFile,
  relativeHistoryPath,
} from "../scripts/lib/history.mjs";
import { computeRevision } from "../scripts/validate-data.mjs";
import { historyEventId } from "../src/domain/historyDiff";

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const CELESTE_ID = "00000000-0000-4000-8000-000000000003";
const TRANSACTION_ID = "00000000-0000-4000-8000-000000000002";
const NOW = "2026-07-16T06:00:00.000Z";
const temporaryPaths: string[] = [];

afterEach(() => {
  while (temporaryPaths.length > 0) rmSync(temporaryPaths.pop()!, { recursive: true, force: true });
});

function emptyDatabase() {
  return {
    schemaVersion: 2,
    revision: "",
    publicationId: null,
    games: {},
    notes: {},
    assets: {},
  };
}

function git(root: string, ...args: string[]) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function makeRepository(database = emptyDatabase()) {
  const root = mkdtempSync(path.join(tmpdir(), "mylib-history-publish-"));
  temporaryPaths.push(root);
  mkdirSync(path.join(root, "public", "data"), { recursive: true });
  writeFileSync(path.join(root, "public", "data", "library.json"), `${JSON.stringify(database, null, 2)}\n`);
  writeFileSync(path.join(root, "package.json"), '{"private":true}\n');
  git(root, "init");
  git(root, "branch", "-M", "main");
  git(root, "config", "user.name", "History Test");
  git(root, "config", "user.email", "history-test@example.invalid");
  git(root, "add", "--", ".");
  git(root, "commit", "-m", "Initial library");
  return root;
}

function celesteGame() {
  return {
    id: CELESTE_ID,
    title: "Celeste",
    coverAssetId: null,
    steamAppId: null,
    importedVia: "manually" as const,
    hoursPlayed: null,
    lastPlayedAt: null,
    achievementsUnlocked: null,
    achievementsTotal: null,
    steamOverrides: {},
    platforms: ["PC"],
    tags: ["platformer"],
    status: "playing" as const,
    placement: { tierId: "unranked", rank: 2048 },
    reviewMarkdown: "",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function duckTalesGame() {
  return {
    id: GAME_ID,
    title: "DuckTales",
    coverAssetId: null,
    steamAppId: null,
    importedVia: "manually" as const,
    hoursPlayed: null,
    lastPlayedAt: null,
    achievementsUnlocked: null,
    achievementsTotal: null,
    steamOverrides: {},
    platforms: ["NES"],
    tags: ["platformer"],
    status: "playing" as const,
    placement: { tierId: "unranked", rank: 1024 },
    reviewMarkdown: "",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createGamePatch(database = emptyDatabase(), gameId = GAME_ID) {
  const gameValue = gameId === GAME_ID ? duckTalesGame() : celesteGame();
  return {
    patchVersion: 2,
    schemaVersion: 2,
    baseRevision: database.revision || computeRevision(database),
    operations: {
      [`/games/${gameId}`]: {
        operation: "set",
        value: gameValue,
        baseExists: false,
        baseHash: MISSING_VALUE_HASH,
        changedAt: NOW,
        transactionId: TRANSACTION_ID,
      },
    },
    blobs: {},
  };
}

describe("appendHistoryEvents", () => {
  it("dedupes incoming events by stable id", () => {
    const base = emptyHistoryFile();
    const event = {
      changedAt: NOW,
      entity: "game" as const,
      entityId: GAME_ID,
      gameId: GAME_ID,
      field: null,
      op: "create" as const,
      before: null,
      after: null,
      title: "DuckTales",
      coverAssetId: null,
    };
    const id = historyEventId(event);
    const first = { id, ...event };
    const merged = appendHistoryEvents({ ...base, events: [first] }, [first, { ...first }]);
    expect(merged.events).toHaveLength(1);
    expect(merged.events[0]?.id).toBe(id);
  });
});

describe("publishPatchInRepository history", () => {
  it("appends history events into the publication commit", () => {
    const root = makeRepository();
    const database = emptyDatabase();
    const patch = createGamePatch(database);

    publishPatchInRepository(root, patch);

    const historyPath = path.join(root, relativeHistoryPath);
    expect(existsSync(historyPath)).toBe(true);
    const history = JSON.parse(readFileSync(historyPath, "utf8"));
    expect(history.schemaVersion).toBe(1);
    expect(history.events.length).toBeGreaterThan(0);
    expect(history.events.some((event: { op: string; entityId: string }) => event.op === "create" && event.entityId === GAME_ID)).toBe(true);

    const committed = git(root, "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD").split("\n").sort();
    expect(committed).toEqual(["public/data/history.json", "public/data/library.json"].sort());
  });

  it("does not duplicate events when diff yields the same ids again", () => {
    const before = emptyDatabase();
    const after = structuredClone(before);
    after.games[GAME_ID] = duckTalesGame();
    const patch = createGamePatch(before);
    const incoming = diffLibraryToHistoryEvents({ before, after, patch });
    const existing = appendHistoryEvents(emptyHistoryFile(), incoming);
    const again = appendHistoryEvents(existing, incoming);
    expect(again.events).toHaveLength(existing.events.length);
  });

  it("appends new events when history.json already exists from a prior publish", () => {
    const root = makeRepository();
    const database = emptyDatabase();
    publishPatchInRepository(root, createGamePatch(database));

    const historyPath = path.join(root, relativeHistoryPath);
    const afterFirst = JSON.parse(readFileSync(historyPath, "utf8"));
    const firstEventIds = afterFirst.events.map((event: { id: string }) => event.id);
    expect(firstEventIds.length).toBeGreaterThan(0);

    const published = JSON.parse(readFileSync(path.join(root, "public", "data", "library.json"), "utf8"));
    publishPatchInRepository(root, createGamePatch(published, CELESTE_ID));

    const afterSecond = JSON.parse(readFileSync(historyPath, "utf8"));
    expect(afterSecond.events.length).toBeGreaterThan(afterFirst.events.length);
    for (const id of firstEventIds) {
      expect(afterSecond.events.some((event: { id: string }) => event.id === id)).toBe(true);
    }
    expect(afterSecond.events.some((event: { op: string; entityId: string }) => event.op === "create" && event.entityId === CELESTE_ID)).toBe(true);
  });

  it("removes created history.json when the publication commit fails", () => {
    const root = makeRepository();
    const database = emptyDatabase();
    const historyPath = path.join(root, relativeHistoryPath);
    const hook = path.join(root, ".git", "hooks", "pre-commit");
    writeFileSync(hook, "#!/bin/sh\nexit 1\n");
    chmodSync(hook, 0o755);

    expect(() => publishPatchInRepository(root, createGamePatch(database))).toThrow(/git commit/);
    expect(existsSync(historyPath)).toBe(false);
  });

  it("restores committed history.json when the publication commit fails", () => {
    const root = makeRepository();
    const database = emptyDatabase();
    const before = emptyDatabase();
    const afterSeed = structuredClone(before);
    afterSeed.games[CELESTE_ID] = celesteGame();
    const seedPatch = createGamePatch(before, CELESTE_ID);
    const seeded = appendHistoryEvents(
      emptyHistoryFile(),
      diffLibraryToHistoryEvents({ before, after: afterSeed, patch: seedPatch }),
    );
    const historyPath = path.join(root, relativeHistoryPath);
    writeFileSync(historyPath, formatHistoryFile(seeded));
    git(root, "add", "--", relativeHistoryPath);
    git(root, "commit", "-m", "Seed history");
    const originalHistory = readFileSync(historyPath, "utf8");

    const hook = path.join(root, ".git", "hooks", "pre-commit");
    writeFileSync(hook, "#!/bin/sh\nexit 1\n");
    chmodSync(hook, 0o755);

    expect(() => publishPatchInRepository(root, createGamePatch(database))).toThrow(/git commit/);
    expect(readFileSync(historyPath, "utf8")).toBe(originalHistory);
  });
});
