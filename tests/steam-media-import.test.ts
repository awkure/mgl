import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { MISSING_VALUE_HASH, validatePatchEnvelope } from "../scripts/publish-patch.mjs";
import { computeRevision } from "../scripts/validate-data.mjs";
import {
  listLibraryGamesWithSteamAppId,
  importSteamMediaForGame,
  mergePatchFragments,
  mediaTargetsFromPatchItems,
  shouldSkipMediaEncodeForBulk,
  summarizeBulkMediaDryRun,
  validateMediaTargetFlags,
} from "../scripts/lib/steamMediaImport.mjs";

const NOW = "2026-07-22T12:00:00.000Z";

function game(id: string, appid: number | null) {
  return {
    id,
    title: id,
    steamAppId: appid,
    coverAssetId: null,
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
  };
}

describe("listLibraryGamesWithSteamAppId", () => {
  it("returns only games with positive steamAppId", () => {
    const library = {
      games: {
        a: game("a", 570),
        b: game("b", null),
        c: game("c", 0),
        d: game("d", 440),
      },
    };
    const rows = listLibraryGamesWithSteamAppId(library);
    expect(rows.map((r) => r.appid).sort()).toEqual([440, 570]);
  });
});

describe("validateMediaTargetFlags", () => {
  it("rejects --all with --appid", () => {
    expect(() => validateMediaTargetFlags({ all: true, appid: 570, gameId: null })).toThrow(
      /Cannot combine --all/,
    );
  });

  it("requires a target mode", () => {
    expect(() => validateMediaTargetFlags({ all: false, appid: null, gameId: null })).toThrow(
      /--appid|--all/,
    );
  });
});

describe("mediaTargetsFromPatchItems", () => {
  it("includes create/update games with appid only", () => {
    const rows = mediaTargetsFromPatchItems([
      { kind: "create", game: game("c1", 10) },
      { kind: "update", game: game("u1", 20) },
      { kind: "create", game: game("c2", null) },
      { kind: "skip", game: game("s1", 99) },
    ]);
    expect(rows.map((r) => r.appid)).toEqual([10, 20]);
  });
});

describe("shouldSkipMediaEncodeForBulk", () => {
  it("short-circuits bulk dry-run only", () => {
    expect(shouldSkipMediaEncodeForBulk({ all: true, dryRun: true })).toBe(true);
    expect(shouldSkipMediaEncodeForBulk({ all: true, dryRun: false })).toBe(false);
    expect(shouldSkipMediaEncodeForBulk({ all: false, dryRun: true })).toBe(false);
  });
});

describe("summarizeBulkMediaDryRun", () => {
  it("returns UGC counts without encoding", async () => {
    const g1 = game("g1", 570);
    const g2 = game("g2", 440);
    const summary = await summarizeBulkMediaDryRun({
      apiKey: "k",
      steamid: "1",
      targets: [
        { game: g1, appid: 570 },
        { game: g2, appid: 440 },
      ],
      getUserScreenshots: async (_k, _s, appid) =>
        appid === 570 ? [{ id: "1" }, { id: "2" }] : [],
      getUserVideos: async (_k, _s, appid) => (appid === 440 ? [{ id: "v1" }] : []),
    });
    expect(summary).toMatchObject({
      all: true,
      dryRun: true,
      games: 2,
      failedGames: [],
    });
    expect(summary.summaries).toEqual([
      { gameId: "g1", appid: 570, screenshots: 2, videos: 0 },
      { gameId: "g2", appid: 440, screenshots: 0, videos: 1 },
    ]);
  });
});

describe("importSteamMediaForGame", () => {
  it("skips failed encodes and still upserts note with survivors", async () => {
    const g = game("g1", 570);
    const library = { games: { g1: g }, notes: {}, assets: {}, revision: "rev" };
    const encode = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({
        asset: {
          id: "a".repeat(64),
          kind: "image",
          mime: "image/webp",
          width: 10,
          height: 10,
          byteLength: 4,
          alt: "Screenshot 2",
          originalName: "ok.webp",
        },
        base64: "AAAA",
      });

    const result = await importSteamMediaForGame({
      apiKey: "k",
      steamid: "1",
      library,
      game: g,
      appid: 570,
      now: NOW,
      getUserScreenshots: async () => [
        { id: "s1", pathFull: "https://example/1.jpg" },
        { id: "s2", pathFull: "https://example/2.jpg" },
      ],
      getUserVideos: async () => [],
      fetchAndEncodeSteamImage: encode,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.screenshotsEncoded).toBe(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.mediaNote.attachments).toHaveLength(1);
    expect(result.encodedAssets).toHaveLength(1);
  });

  it("skips media note when UGC empty", async () => {
    const g = game("g1", 570);
    const library = { games: { g1: g }, notes: {}, assets: {}, revision: "rev" };
    const result = await importSteamMediaForGame({
      apiKey: "k",
      steamid: "1",
      library,
      game: g,
      appid: 570,
      now: NOW,
      getUserScreenshots: async () => [],
      getUserVideos: async () => [],
      fetchAndEncodeSteamImage: vi.fn(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skippedEmpty).toBe(true);
    expect(result.mediaNote).toBeNull();
    expect(result.encodedAssets).toEqual([]);
  });

  it("leaves existing media note alone when UGC empty", async () => {
    const g = game("g1", 570);
    const existing = {
      id: "note-1",
      gameId: "g1",
      bodyMarkdown: "<!-- steam-media:v1 -->\n\n## Медиа Steam\n",
      attachments: [{ type: "image", assetId: "a".repeat(64), alt: "shot" }],
      rank: 1024,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const library = { games: { g1: g }, notes: { "note-1": existing }, assets: {}, revision: "rev" };
    const result = await importSteamMediaForGame({
      apiKey: "k",
      steamid: "1",
      library,
      game: g,
      appid: 570,
      now: NOW,
      getUserScreenshots: async () => [],
      getUserVideos: async () => [],
      fetchAndEncodeSteamImage: vi.fn(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skippedEmpty).toBe(true);
    expect(result.mediaNote).toBeNull();
    expect(result.previousNote).toEqual(existing);
  });

  it("returns ok:false when GetUserFiles throws", async () => {
    const g = game("g1", 570);
    const library = { games: { g1: g }, notes: {}, assets: {}, revision: "rev" };
    const result = await importSteamMediaForGame({
      apiKey: "k",
      steamid: "1",
      library,
      game: g,
      appid: 570,
      now: NOW,
      getUserScreenshots: async () => {
        throw new Error("rate limit");
      },
      getUserVideos: async () => [],
      fetchAndEncodeSteamImage: vi.fn(),
    });
    expect(result).toEqual({
      ok: false,
      gameId: "g1",
      appid: 570,
      error: "rate limit",
    });
  });
});

describe("mergePatchFragments", () => {
  it("merges operations and blobs", () => {
    const assetId = "b".repeat(64);
    const base = {
      patchVersion: 2,
      schemaVersion: 2,
      baseRevision: "r",
      operations: { "/games/x": { operation: "set" } },
      blobs: {},
    };
    const fragment = {
      operations: {
        "/notes/n1": { operation: "set", value: { id: "n1" } },
        [`/assets/${assetId}`]: { operation: "set", value: { id: assetId } },
      },
      blobs: { [assetId]: "QQ==" },
    };
    const merged = mergePatchFragments(base, fragment);
    expect(Object.keys(merged.operations)).toHaveLength(3);
    expect(merged.blobs[assetId]).toBe("QQ==");
  });
});

describe("media fragment applyPatch", () => {
  it("rejects incremental apply without asset blobs; accepts fragment or full merged patch", () => {
    const webp = Buffer.from("RIFFxxxxWEBPv1");
    const assetId = createHash("sha256").update(webp).digest("hex");
    const gameId = "00000000-0000-4000-8000-000000000001";
    const library = {
      schemaVersion: 2,
      revision: "",
      publicationId: null,
      games: { [gameId]: game(gameId, 570) },
      notes: {},
      assets: {},
    };
    library.revision = computeRevision(library);

    const fragment = {
      operations: {
        [`/assets/${assetId}`]: {
          operation: "set",
          value: {
            id: assetId,
            kind: "image",
            mime: "image/webp",
            width: 1,
            height: 1,
            byteLength: webp.byteLength,
            alt: "shot",
            originalName: "shot.webp",
          },
          baseExists: false,
          baseHash: MISSING_VALUE_HASH,
          changedAt: NOW,
          transactionId: "tx",
        },
      },
      blobs: { [assetId]: webp.toString("base64") },
    };

    const envelope = {
      patchVersion: 2,
      schemaVersion: 2,
      baseRevision: library.revision,
      operations: fragment.operations,
      blobs: {} as Record<string, string>,
    };

    expect(() => validatePatchEnvelope(envelope, library)).toThrow(/missing blob payload/);

    const withBlobs = { ...envelope, blobs: fragment.blobs };
    expect(() => validatePatchEnvelope(withBlobs, library)).not.toThrow();

    const merged = mergePatchFragments(
      {
        patchVersion: 2,
        schemaVersion: 2,
        baseRevision: library.revision,
        operations: {},
        blobs: {},
      },
      fragment,
    );
    expect(() => validatePatchEnvelope(merged, library)).not.toThrow();
    expect(Object.keys(merged.blobs)).toContain(assetId);
  });
});
