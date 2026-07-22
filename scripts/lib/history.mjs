import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const {
  appendHistoryEvents,
  diffLibraryToHistoryEvents,
  emptyHistoryFile,
  seedHistoryEventsFromLibrary,
} = await import(pathToFileURL(path.join(root, "src/domain/historyDiff.ts")).href);

export const relativeHistoryPath = "public/data/history.json";
export const HISTORY_SCHEMA_VERSION = 1;

const HISTORY_FILE_FIELDS = ["schemaVersion", "events"];
const HISTORY_EVENT_FIELDS = [
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
];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const SHA256 = /^[0-9a-f]{64}$/;
const HISTORY_ENTITIES = new Set(["game", "note"]);
const HISTORY_OPS = new Set(["create", "set", "delete"]);

export { appendHistoryEvents, diffLibraryToHistoryEvents, emptyHistoryFile, seedHistoryEventsFromLibrary };

export class HistoryValidationError extends Error {
  constructor(errors) {
    super(`History data is invalid:\n${errors.map((error) => `- ${error}`).join("\n")}`);
    this.name = "HistoryValidationError";
    this.errors = errors;
  }
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value, keys, at, errors) {
  const expected = new Set(keys);
  for (const key of Object.keys(value)) if (!expected.has(key)) errors.push(`${at}.${key}: unknown field`);
  for (const key of keys) if (!Object.hasOwn(value, key)) errors.push(`${at}.${key}: missing required field`);
}

function validateHistoryEvent(value, at, errors) {
  if (!isPlainObject(value)) {
    errors.push(`${at}: expected an event object`);
    return;
  }
  exactKeys(value, HISTORY_EVENT_FIELDS, at, errors);
  if (typeof value.id !== "string" || value.id.trim() === "") errors.push(`${at}.id: expected a non-empty string`);
  if (typeof value.changedAt !== "string" || !ISO_DATE.test(value.changedAt) || Number.isNaN(Date.parse(value.changedAt))) {
    errors.push(`${at}.changedAt: expected an ISO-8601 UTC timestamp`);
  }
  if (typeof value.entity !== "string" || !HISTORY_ENTITIES.has(value.entity)) errors.push(`${at}.entity: unknown entity`);
  if (typeof value.entityId !== "string" || value.entityId.trim() === "") errors.push(`${at}.entityId: expected a non-empty string`);
  if (typeof value.gameId !== "string" || value.gameId.trim() === "") errors.push(`${at}.gameId: expected a non-empty string`);
  if (typeof value.op !== "string" || !HISTORY_OPS.has(value.op)) errors.push(`${at}.op: unknown operation`);
  if (value.field === null) {
    if (value.op === "set") errors.push(`${at}.field: set requires a field name`);
  } else if (typeof value.field !== "string" || value.field.trim() === "") {
    errors.push(`${at}.field: expected a field name or null`);
  } else if (value.op === "create" || value.op === "delete") {
    errors.push(`${at}.field: create/delete must not set a field`);
  }
  if (!("before" in value)) errors.push(`${at}.before: missing required field`);
  if (!("after" in value)) errors.push(`${at}.after: missing required field`);
  if (typeof value.title !== "string") errors.push(`${at}.title: expected a string`);
  if (value.coverAssetId !== null && (typeof value.coverAssetId !== "string" || !SHA256.test(value.coverAssetId))) {
    errors.push(`${at}.coverAssetId: expected null or a SHA-256 hash`);
  }
}

export function validateHistoryFile(value) {
  const errors = [];
  if (!isPlainObject(value)) throw new HistoryValidationError(["$: expected an object"]);
  exactKeys(value, HISTORY_FILE_FIELDS, "$", errors);
  if (value.schemaVersion !== HISTORY_SCHEMA_VERSION) {
    errors.push(`$.schemaVersion: must equal ${HISTORY_SCHEMA_VERSION}`);
  }
  if (!Array.isArray(value.events)) errors.push("$.events: expected an array of events");
  else value.events.forEach((event, index) => validateHistoryEvent(event, `$.events[${index}]`, errors));
  if (errors.length > 0) throw new HistoryValidationError(errors);
  return value;
}

export function parseHistoryJson(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new Error(`${relativeHistoryPath} is not valid JSON: ${cause.message}`);
  }
  return validateHistoryFile(parsed);
}

export function readHistoryFileFromDisk(historyPath) {
  return parseHistoryJson(readFileSync(historyPath, "utf8"));
}

export function formatHistoryFile(history) {
  return `${JSON.stringify(history, null, 2)}\n`;
}
