import { describe, expect, it } from "vitest";
import type { Game, Note } from "../src/domain/types";
import {
  STEAM_MEDIA_NOTE_MARKER,
  buildSteamMediaAttachments,
  isSteamMediaNote,
  parseSteamAppInput,
  prefillGameFromSteamDetails,
  steamAppDetailsFromStoreJson,
  steamMediaCliHint,
  steamMediaFetchErrorMessage,
  steamMediaNoteBody,
  steamStoreAppUrl,
  upsertSteamMediaNote,
} from "../src/domain/steamMedia";

const NOW = "2026-07-22T12:00:00.000Z";
const GAME_ID = "11111111-1111-4111-8111-111111111111";

function baseGame(overrides: Partial<Game> = {}): Pick<
  Game,
  "title" | "tags" | "coverAssetId" | "steamAppId" | "importedVia" | "platforms"
> {
  return {
    title: "",
    tags: [],
    coverAssetId: null,
    steamAppId: null,
    importedVia: "manually",
    platforms: [],
    ...overrides,
  };
}

function note(overrides: Partial<Note> & Pick<Note, "id">): Note {
  return {
    gameId: GAME_ID,
    bodyMarkdown: "",
    attachments: [],
    rank: 1024,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("parseSteamAppInput", () => {
  it("accepts plain appid digits", () => {
    expect(parseSteamAppInput("570")).toBe(570);
    expect(parseSteamAppInput("  730  ")).toBe(730);
  });

  it("accepts storefront URLs", () => {
    expect(parseSteamAppInput("https://store.steampowered.com/app/570/Dota_2/")).toBe(570);
    expect(parseSteamAppInput("store.steampowered.com/app/730")).toBe(730);
    expect(parseSteamAppInput("https://store.steampowered.com/app/440")).toBe(440);
  });

  it("throws on bad input", () => {
    expect(() => parseSteamAppInput("")).toThrow(/Пустой/);
    expect(() => parseSteamAppInput("https://example.com/app/570")).toThrow(/store\.steampowered/);
    expect(() => parseSteamAppInput("not-an-appid")).toThrow(/разобрать/);
  });
});

describe("steamStoreAppUrl", () => {
  it("builds canonical store URL", () => {
    expect(steamStoreAppUrl(570)).toBe("https://store.steampowered.com/app/570/");
  });
});

describe("steam media CLI hints", () => {
  it("uses apply-only hint for media errors", () => {
    expect(steamMediaCliHint(570)).toBe("npm run import:steam-media -- --appid 570 --apply");
    expect(steamMediaFetchErrorMessage(570)).toContain("--apply");
    expect(steamMediaFetchErrorMessage(570)).not.toContain("--prefill");
  });
});

describe("steamAppDetailsFromStoreJson", () => {
  it("maps storefront appdetails body", () => {
    const details = steamAppDetailsFromStoreJson(570, {
      "570": {
        success: true,
        data: {
          type: "game",
          name: "Dota 2",
          header_image: "https://cdn.example/header.jpg",
          genres: [{ description: "Action" }, { description: "Free to Play" }],
          screenshots: [{ id: 1, path_full: "https://cdn.example/shot.jpg", path_thumbnail: "https://cdn.example/thumb.jpg" }],
          movies: [{ id: 2, name: "Trailer", thumbnail: "https://cdn.example/movie.jpg" }],
        },
      },
    });
    expect(details).toMatchObject({
      type: "game",
      name: "Dota 2",
      headerImage: "https://cdn.example/header.jpg",
      genres: ["Action", "Free to Play"],
      screenshots: [{ id: 1, pathFull: "https://cdn.example/shot.jpg", pathThumbnail: "https://cdn.example/thumb.jpg" }],
      movies: [{ id: 2, name: "Trailer", thumbnail: "https://cdn.example/movie.jpg" }],
    });
  });

  it("returns null when entry missing or unsuccessful", () => {
    expect(steamAppDetailsFromStoreJson(570, {})).toBeNull();
    expect(steamAppDetailsFromStoreJson(570, { "570": { success: false } })).toBeNull();
  });
});

describe("steam media note marker", () => {
  it("detects marker in body", () => {
    expect(isSteamMediaNote({ bodyMarkdown: steamMediaNoteBody() })).toBe(true);
    expect(isSteamMediaNote({ bodyMarkdown: "hello" })).toBe(false);
    expect(steamMediaNoteBody()).toContain(STEAM_MEDIA_NOTE_MARKER);
    expect(steamMediaNoteBody()).toContain("## Медиа Steam");
  });
});

describe("prefillGameFromSteamDetails", () => {
  it("fills empty fields only", () => {
    const patch = prefillGameFromSteamDetails(
      baseGame(),
      { name: "Dota 2", genres: ["Action", "Action", " Free to Play "] },
      { appid: 570, coverAssetId: "a".repeat(64) },
    );
    expect(patch).toEqual({
      title: "Dota 2",
      tags: ["Action", "Free to Play"],
      coverAssetId: "a".repeat(64),
      steamAppId: 570,
      importedVia: "steam",
      platforms: ["Steam"],
    });
  });

  it("skips non-empty title, tags, cover, platforms, and existing steamAppId", () => {
    const patch = prefillGameFromSteamDetails(
      baseGame({
        title: "My Title",
        tags: ["Roguelike"],
        coverAssetId: "b".repeat(64),
        steamAppId: 99,
        importedVia: "steam",
        platforms: ["PC"],
      }),
      { name: "Store Name", genres: ["Action"] },
      { appid: 570, coverAssetId: "c".repeat(64) },
    );
    expect(patch).toEqual({});
  });

  it("does not flip importedVia when steamAppId already set", () => {
    const patch = prefillGameFromSteamDetails(
      baseGame({ steamAppId: 570, importedVia: "manually", title: "T", platforms: ["PC"] }),
      { name: "Other" },
      { appid: 570 },
    );
    expect(patch).toEqual({});
  });
});

describe("buildSteamMediaAttachments", () => {
  it("maps screenshots and movies with optional thumbs", () => {
    const shot = "1".repeat(64);
    const thumb = "2".repeat(64);
    const attachments = buildSteamMediaAttachments({
      appid: 570,
      screenshotAssetIds: [shot],
      screenshotAlts: ["Shot 1"],
      movies: [{ name: "Launch Trailer", thumbAssetId: thumb }],
    });
    expect(attachments).toEqual([
      { type: "image", assetId: shot, alt: "Shot 1" },
      { type: "link", url: "https://store.steampowered.com/app/570/", label: "Launch Trailer" },
      { type: "image", assetId: thumb, alt: "Launch Trailer" },
    ]);
  });
});

describe("upsertSteamMediaNote", () => {
  it("creates a new media note at end of ranks", () => {
    const existing = [
      note({ id: "n1", rank: 1024, bodyMarkdown: "other" }),
    ];
    const attachments = [{ type: "image" as const, assetId: "f".repeat(64), alt: "" }];
    const result = upsertSteamMediaNote({
      gameId: GAME_ID,
      existingNotes: existing,
      attachments,
      now: NOW,
    });
    expect(result.created).toBe(true);
    expect(result.notes).toHaveLength(2);
    const created = result.notes.find((n) => n.id === result.mediaNoteId);
    expect(created).toMatchObject({
      gameId: GAME_ID,
      rank: 2048,
      bodyMarkdown: steamMediaNoteBody(),
      attachments,
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it("replaces attachments on existing media note and keeps id and rank", () => {
    const mediaId = "media-note-id";
    const existing = [
      note({ id: "n1", rank: 1024 }),
      note({
        id: mediaId,
        rank: 3072,
        groupRank: 2048,
        bodyMarkdown: `${STEAM_MEDIA_NOTE_MARKER}\n\nold`,
        attachments: [{ type: "image", assetId: "old".padEnd(64, "0"), alt: "" }],
        createdAt: "2020-01-01T00:00:00.000Z",
      }),
    ];
    const attachments = [{ type: "link" as const, url: steamStoreAppUrl(570), label: "Trailer" }];
    const result = upsertSteamMediaNote({
      gameId: GAME_ID,
      existingNotes: existing,
      attachments,
      now: "2026-07-22T13:00:00.000Z",
    });
    expect(result.created).toBe(false);
    expect(result.mediaNoteId).toBe(mediaId);
    const updated = result.notes.find((n) => n.id === mediaId);
    expect(updated).toMatchObject({
      id: mediaId,
      rank: 3072,
      groupRank: 2048,
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2026-07-22T13:00:00.000Z",
      bodyMarkdown: steamMediaNoteBody(),
      attachments,
    });
  });
});
