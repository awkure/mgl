import {
  HISTORY_EVENT_FIELDS,
  HISTORY_FILE_FIELDS,
  HISTORY_SCHEMA_VERSION,
  type HistoryEvent,
  type HistoryFile,
  type HistoryEntity,
  type HistoryOp,
} from "./historyTypes";
import { DomainValidationError, type ValidationIssue, type ValidationResult } from "./validation";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const SHA256 = /^[0-9a-f]{64}$/;

const HISTORY_ENTITIES: readonly HistoryEntity[] = ["game", "note"];
const HISTORY_OPS: readonly HistoryOp[] = ["create", "set", "delete"];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function issue(issues: ValidationIssue[], path: string, message: string): void {
  issues.push({ path, message });
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], path: string, issues: ValidationIssue[]): void {
  const expected = new Set(keys);
  for (const key of Object.keys(value)) if (!expected.has(key)) issue(issues, `${path}/${key}`, "Неизвестное поле");
  for (const key of keys) if (!(key in value)) issue(issues, `${path}/${key}`, "Обязательное поле отсутствует");
}

function string(value: unknown, path: string, issues: ValidationIssue[], allowEmpty = true): value is string {
  if (typeof value !== "string" || (!allowEmpty && value.trim().length === 0)) {
    issue(issues, path, allowEmpty ? "Ожидалась строка" : "Ожидалась непустая строка");
    return false;
  }
  return true;
}

function isoDate(value: unknown, path: string, issues: ValidationIssue[]): value is string {
  if (!string(value, path, issues)) return false;
  if (!ISO_DATE.test(value) || Number.isNaN(Date.parse(value))) {
    issue(issues, path, "Ожидалась дата ISO 8601 в UTC");
    return false;
  }
  return true;
}

function sha256OrNull(value: unknown, path: string, issues: ValidationIssue[]): value is string | null {
  if (value === null) return true;
  if (!string(value, path, issues, false)) return false;
  if (!SHA256.test(value)) issue(issues, path, "Ожидался SHA-256");
  return SHA256.test(value);
}

function validateHistoryEvent(value: unknown, path: string, issues: ValidationIssue[]): HistoryEvent | undefined {
  if (!isObject(value)) {
    issue(issues, path, "Ожидался объект события");
    return undefined;
  }
  exactKeys(value, HISTORY_EVENT_FIELDS, path, issues);

  if (!string(value.id, `${path}/id`, issues, false)) return undefined;
  isoDate(value.changedAt, `${path}/changedAt`, issues);

  if (!string(value.entity, `${path}/entity`, issues, false)) return undefined;
  else if (!HISTORY_ENTITIES.includes(value.entity as HistoryEntity)) {
    issue(issues, `${path}/entity`, "Неизвестная сущность");
  }

  if (!string(value.entityId, `${path}/entityId`, issues, false)) return undefined;
  if (!string(value.gameId, `${path}/gameId`, issues, false)) return undefined;

  if (!string(value.op, `${path}/op`, issues, false)) return undefined;
  else if (!HISTORY_OPS.includes(value.op as HistoryOp)) {
    issue(issues, `${path}/op`, "Неизвестная операция");
  }

  const op = value.op as HistoryOp;
  if (value.field === null) {
    if (op === "set") issue(issues, `${path}/field`, "Set требует имя поля");
  } else if (!string(value.field, `${path}/field`, issues, false)) {
    // field invalid type
  } else if (op === "create" || op === "delete") {
    issue(issues, `${path}/field`, "Create/delete не должны задавать поле");
  }

  if (!("before" in value)) issue(issues, `${path}/before`, "Обязательное поле отсутствует");
  if (!("after" in value)) issue(issues, `${path}/after`, "Обязательное поле отсутствует");

  if (!string(value.title, `${path}/title`, issues)) return undefined;
  sha256OrNull(value.coverAssetId, `${path}/coverAssetId`, issues);

  return value as unknown as HistoryEvent;
}

export function parseHistoryFile(value: unknown): ValidationResult<HistoryFile> {
  const issues: ValidationIssue[] = [];
  if (!isObject(value)) return { ok: false, issues: [{ path: "", message: "Ожидался объект history" }] };

  exactKeys(value, HISTORY_FILE_FIELDS, "", issues);
  if (value.schemaVersion !== HISTORY_SCHEMA_VERSION) {
    issue(issues, "/schemaVersion", `Поддерживается schemaVersion ${HISTORY_SCHEMA_VERSION}`);
  }

  if (!Array.isArray(value.events)) {
    issue(issues, "/events", "Ожидался массив событий");
    return issues.length ? { ok: false, issues } : { ok: true, value: value as unknown as HistoryFile, issues };
  }

  const events: HistoryEvent[] = [];
  value.events.forEach((item, index) => {
    const event = validateHistoryEvent(item, `/events/${index}`, issues);
    if (event) events.push(event);
  });

  return issues.length
    ? { ok: false, issues }
    : { ok: true, value: { schemaVersion: HISTORY_SCHEMA_VERSION, events }, issues };
}

export function validateHistoryFile(value: unknown): HistoryFile {
  const result = parseHistoryFile(value);
  if (!result.ok) throw new DomainValidationError(result.issues);
  return result.value!;
}
