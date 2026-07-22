import { canonicalHash, canonicalStringify } from "./canonical.ts";
import { HISTORY_SCHEMA_VERSION, type HistoryEntity, type HistoryEvent, type HistoryFile } from "./historyTypes.ts";
import type { Game, LibraryDatabase, Note, PatchEnvelope } from "./types.ts";

function pointerToken(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

function entityPath(map: "games" | "notes", id: string, field?: string): string {
  return `/${map}/${pointerToken(id)}${field === undefined ? "" : `/${pointerToken(field)}`}`;
}

const TRACKED_GAME_FIELDS = [
  "title",
  "coverAssetId",
  "steamAppId",
  "importedVia",
  "hoursPlayed",
  "lastPlayedAt",
  "achievementsUnlocked",
  "achievementsTotal",
  "platforms",
  "tags",
  "status",
  "placement",
  "reviewMarkdown",
] as const satisfies readonly (keyof Game)[];

const TRACKED_NOTE_FIELDS = ["bodyMarkdown", "attachments", "groupRank", "rank"] as const satisfies readonly (keyof Note)[];

const MARKDOWN_FIELDS = new Set<string>(["reviewMarkdown", "bodyMarkdown"]);

function same(a: unknown, b: unknown): boolean {
  return canonicalStringify(a) === canonicalStringify(b);
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function historyEventId(parts: Omit<HistoryEvent, "id">): string {
  return canonicalHash(parts);
}

function patchChangedAt(
  patch: PatchEnvelope | null | undefined,
  map: "games" | "notes",
  id: string,
  field: string | null,
): string | undefined {
  if (!patch) return undefined;
  if (field) {
    const fieldPath = entityPath(map, id, field);
    const fieldOp = patch.operations[fieldPath];
    if (fieldOp?.changedAt) return fieldOp.changedAt;
  }
  const rootPath = entityPath(map, id);
  return patch.operations[rootPath]?.changedAt;
}

function entityTimestamp(
  entity: Game | Note | undefined,
  preferUpdated = true,
): string | undefined {
  if (!entity) return undefined;
  if (preferUpdated && entity.updatedAt) return entity.updatedAt;
  return entity.createdAt;
}

function resolveChangedAt(input: {
  patch?: PatchEnvelope | null;
  map: "games" | "notes";
  id: string;
  field: string | null;
  op: HistoryEvent["op"];
  afterEntity?: Game | Note;
  beforeEntity?: Game | Note;
}): string {
  const fromPatch = patchChangedAt(input.patch, input.map, input.id, input.field);
  if (fromPatch) return fromPatch;
  if (input.op === "create" && input.afterEntity) return input.afterEntity.createdAt;
  if (input.op === "delete" && input.beforeEntity) {
    return input.beforeEntity.updatedAt ?? input.beforeEntity.createdAt;
  }
  return (
    entityTimestamp(input.afterEntity)
    ?? entityTimestamp(input.beforeEntity)
    ?? new Date(0).toISOString()
  );
}

function gameSnapshot(
  gameId: string,
  after: LibraryDatabase,
  before: LibraryDatabase,
): { title: string; coverAssetId: string | null } {
  const game = after.games[gameId] ?? before.games[gameId];
  return {
    title: game?.title ?? "",
    coverAssetId: game?.coverAssetId ?? null,
  };
}

function historyValue(field: string, value: unknown): unknown {
  if (MARKDOWN_FIELDS.has(field)) return null;
  return value;
}

function buildEvent(parts: Omit<HistoryEvent, "id">): HistoryEvent {
  return { id: historyEventId(parts), ...parts };
}

function diffEntityFields(input: {
  map: "games" | "notes";
  entity: HistoryEntity;
  id: string;
  gameId: string;
  fields: readonly string[];
  beforeRecord: Record<string, unknown> | undefined;
  afterRecord: Record<string, unknown> | undefined;
  patch?: PatchEnvelope | null;
  snapshot: { title: string; coverAssetId: string | null };
  beforeEntity?: Game | Note;
  afterEntity?: Game | Note;
}): HistoryEvent[] {
  const events: HistoryEvent[] = [];
  for (const field of input.fields) {
    const beforeExists = input.beforeRecord !== undefined && hasOwn(input.beforeRecord, field);
    const afterExists = input.afterRecord !== undefined && hasOwn(input.afterRecord, field);
    const before = beforeExists ? input.beforeRecord![field] : undefined;
    const after = afterExists ? input.afterRecord![field] : undefined;
    if (beforeExists === afterExists && (!beforeExists || same(before, after))) continue;

    events.push(
      buildEvent({
        changedAt: resolveChangedAt({
          patch: input.patch,
          map: input.map,
          id: input.id,
          field,
          op: "set",
          beforeEntity: input.beforeEntity,
          afterEntity: input.afterEntity,
        }),
        entity: input.entity,
        entityId: input.id,
        gameId: input.gameId,
        field,
        op: "set",
        before: beforeExists ? historyValue(field, before) : null,
        after: afterExists ? historyValue(field, after) : null,
        title: input.snapshot.title,
        coverAssetId: input.snapshot.coverAssetId,
      }),
    );
  }
  return events;
}

function diffMap(
  map: "games" | "notes",
  entity: HistoryEntity,
  fields: readonly string[],
  before: LibraryDatabase,
  after: LibraryDatabase,
  patch?: PatchEnvelope | null,
): HistoryEvent[] {
  const beforeMap = before[map] as Record<string, Game | Note>;
  const afterMap = after[map] as Record<string, Game | Note>;
  const events: HistoryEvent[] = [];

  for (const id of new Set([...Object.keys(beforeMap), ...Object.keys(afterMap)])) {
    const beforeEntity = beforeMap[id];
    const afterEntity = afterMap[id];
    const gameId = entity === "game" ? id : (afterEntity as Note | undefined)?.gameId ?? (beforeEntity as Note | undefined)?.gameId ?? "";
    const snapshot = gameSnapshot(entity === "game" ? id : gameId, after, before);

    if (beforeEntity && !afterEntity) {
      events.push(
        buildEvent({
          changedAt: resolveChangedAt({
            patch,
            map,
            id,
            field: null,
            op: "delete",
            beforeEntity,
          }),
          entity,
          entityId: id,
          gameId,
          field: null,
          op: "delete",
          before: null,
          after: null,
          title: snapshot.title,
          coverAssetId: snapshot.coverAssetId,
        }),
      );
      continue;
    }

    if (!beforeEntity && afterEntity) {
      events.push(
        buildEvent({
          changedAt: resolveChangedAt({
            patch,
            map,
            id,
            field: null,
            op: "create",
            afterEntity,
          }),
          entity,
          entityId: id,
          gameId,
          field: null,
          op: "create",
          before: null,
          after: null,
          title: snapshot.title,
          coverAssetId: snapshot.coverAssetId,
        }),
      );
      continue;
    }

    if (beforeEntity && afterEntity) {
      events.push(
        ...diffEntityFields({
          map,
          entity,
          id,
          gameId,
          fields,
          beforeRecord: beforeEntity as unknown as Record<string, unknown>,
          afterRecord: afterEntity as unknown as Record<string, unknown>,
          patch,
          snapshot,
          beforeEntity,
          afterEntity,
        }),
      );
    }
  }

  return events;
}

export function diffLibraryToHistoryEvents(input: {
  before: LibraryDatabase;
  after: LibraryDatabase;
  patch?: PatchEnvelope | null;
}): HistoryEvent[] {
  const events = [
    ...diffMap("games", "game", TRACKED_GAME_FIELDS, input.before, input.after, input.patch),
    ...diffMap("notes", "note", TRACKED_NOTE_FIELDS, input.before, input.after, input.patch),
  ];
  return events.sort((a, b) => {
    const byTime = a.changedAt.localeCompare(b.changedAt);
    return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
  });
}

export function seedHistoryEventsFromLibrary(library: LibraryDatabase): HistoryEvent[] {
  const empty: LibraryDatabase = {
    schemaVersion: library.schemaVersion,
    revision: library.revision,
    publicationId: library.publicationId,
    games: {},
    notes: {},
    assets: library.assets,
  };
  return diffLibraryToHistoryEvents({ before: empty, after: library });
}

export function emptyHistoryFile(): HistoryFile {
  return { schemaVersion: HISTORY_SCHEMA_VERSION, events: [] };
}

/** Append incoming events, dedupe by id, sort by changedAt then id. */
export function appendHistoryEvents(existing: HistoryFile, incoming: HistoryEvent[]): HistoryFile {
  const seen = new Set(existing.events.map((event) => event.id));
  const events = [...existing.events];
  for (const event of incoming) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    events.push(event);
  }
  events.sort((left, right) => {
    const byTime = left.changedAt.localeCompare(right.changedAt);
    return byTime !== 0 ? byTime : left.id.localeCompare(right.id);
  });
  return { schemaVersion: HISTORY_SCHEMA_VERSION, events };
}
