export const HISTORY_SCHEMA_VERSION = 1 as const;

export type HistoryEntity = "game" | "note";
export type HistoryOp = "create" | "set" | "delete";

export interface HistoryEvent {
  id: string;
  changedAt: string;
  entity: HistoryEntity;
  entityId: string;
  gameId: string;
  field: string | null;
  op: HistoryOp;
  before: unknown;
  after: unknown;
  title: string;
  coverAssetId: string | null;
}

export interface HistoryFile {
  schemaVersion: typeof HISTORY_SCHEMA_VERSION;
  events: HistoryEvent[];
}

export const HISTORY_FILE_FIELDS = ["schemaVersion", "events"] as const;

export const HISTORY_EVENT_FIELDS = [
  "id",
  "changedAt",
  "entity",
  "entityId",
  "gameId",
  "field",
  "op",
  "before",
  "after",
  "title",
  "coverAssetId",
] as const;
