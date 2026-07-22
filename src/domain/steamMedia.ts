import { RANK_STEP } from "./ranks";
import { uniqueTagList, type SteamAppDetailsSlice } from "./steamImport.ts";
import type { Game, Note, NoteAttachment } from "./types";

export const STEAM_MEDIA_NOTE_MARKER = "<!-- steam-media:v1 -->";

const APPID_DIGITS = /^\d{1,10}$/;

function parseAppidFromPath(pathname: string): number | null {
  const normalized = pathname.replace(/\/+$/, "");
  const match = normalized.match(/\/app\/(\d{1,10})(?:\/|$)/i);
  if (!match) return null;
  const appid = Number(match[1]);
  return Number.isSafeInteger(appid) && appid > 0 ? appid : null;
}

/** Parse raw Steam appid or store.steampowered.com/app/{id} URL. */
export function parseSteamAppInput(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Пустой Steam appid или URL");

  if (APPID_DIGITS.test(trimmed)) {
    const appid = Number(trimmed);
    if (Number.isSafeInteger(appid) && appid > 0) return appid;
  }

  let path = trimmed;
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("store.steampowered.com/")) {
    let url: URL;
    try {
      url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    } catch {
      throw new Error("Некорректный Steam URL");
    }
    if (!/(^|\.)store\.steampowered\.com$/i.test(url.hostname)) {
      throw new Error("Ожидался URL store.steampowered.com");
    }
    path = url.pathname;
  } else if (trimmed.includes("/app/")) {
    path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  }

  const fromPath = parseAppidFromPath(path);
  if (fromPath != null) return fromPath;

  throw new Error("Не удалось разобрать Steam appid или URL");
}

export function steamStoreAppUrl(appid: number): string {
  return `https://store.steampowered.com/app/${appid}/`;
}

export function isSteamMediaNote(note: Pick<Note, "bodyMarkdown">): boolean {
  return note.bodyMarkdown.includes(STEAM_MEDIA_NOTE_MARKER);
}

export function steamMediaNoteBody(): string {
  return `${STEAM_MEDIA_NOTE_MARKER}\n\n## Медиа Steam\n`;
}

export function prefillGameFromSteamDetails(
  game: Pick<Game, "title" | "tags" | "coverAssetId" | "steamAppId" | "importedVia" | "platforms">,
  details: Pick<SteamAppDetailsSlice, "name" | "genres">,
  options: { appid: number; coverAssetId?: string | null },
): Partial<Game> {
  const patch: Partial<Game> = {};
  const appliedSteamAppId = game.steamAppId == null;

  if (appliedSteamAppId) {
    patch.steamAppId = options.appid;
    if (game.importedVia === "manually") {
      patch.importedVia = "steam";
    }
  }

  if (!game.title.trim() && details.name?.trim()) {
    patch.title = details.name.trim().slice(0, 500);
  }

  if (game.tags.length === 0 && details.genres?.length) {
    patch.tags = uniqueTagList(details.genres);
  }

  if (game.coverAssetId == null && options.coverAssetId) {
    patch.coverAssetId = options.coverAssetId;
  }

  if (game.platforms.length === 0) {
    patch.platforms = ["Steam"];
  }

  return patch;
}

export function buildSteamMediaAttachments(input: {
  appid: number;
  screenshotAssetIds: readonly string[];
  screenshotAlts?: readonly string[];
  movies: ReadonlyArray<{ name: string; thumbAssetId?: string | null }>;
}): NoteAttachment[] {
  const storeUrl = steamStoreAppUrl(input.appid);
  const attachments: NoteAttachment[] = [];

  input.screenshotAssetIds.forEach((assetId, index) => {
    attachments.push({
      type: "image",
      assetId,
      alt: input.screenshotAlts?.[index]?.trim() ?? "",
    });
  });

  for (const movie of input.movies) {
    const label = movie.name.trim() || "Trailer";
    attachments.push({ type: "link", url: storeUrl, label });
    if (movie.thumbAssetId) {
      attachments.push({ type: "image", assetId: movie.thumbAssetId, alt: label });
    }
  }

  return attachments;
}

function newNoteId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `note-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function maxNoteRank(notes: readonly Note[]): number {
  return notes.reduce((max, note) => Math.max(max, note.rank), 0);
}

export function upsertSteamMediaNote(input: {
  gameId: string;
  existingNotes: readonly Note[];
  attachments: NoteAttachment[];
  now: string;
}): { notes: Note[]; mediaNoteId: string; created: boolean } {
  const gameNotes = input.existingNotes.filter((note) => note.gameId === input.gameId);
  const bodyMarkdown = steamMediaNoteBody();
  const existing = gameNotes.find((note) => isSteamMediaNote(note));

  if (existing) {
    const updated: Note = {
      ...existing,
      bodyMarkdown,
      attachments: [...input.attachments],
      updatedAt: input.now,
    };
    const notes = input.existingNotes.map((note) => (note.id === existing.id ? updated : note));
    return { notes, mediaNoteId: existing.id, created: false };
  }

  const id = newNoteId();
  const createdNote: Note = {
    id,
    gameId: input.gameId,
    bodyMarkdown,
    attachments: [...input.attachments],
    rank: maxNoteRank(gameNotes) + RANK_STEP,
    createdAt: input.now,
    updatedAt: input.now,
  };
  return {
    notes: [...input.existingNotes, createdNote],
    mediaNoteId: id,
    created: true,
  };
}
