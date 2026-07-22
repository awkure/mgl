import type { Page } from "playwright/test";

export interface HistoryEventFixture {
  id: string;
  changedAt: string;
  entity: string;
  gameId: string;
  field: string | null;
  op: string;
  title: string;
  before?: unknown;
  after?: unknown;
}

export interface HistoryFixture {
  events: HistoryEventFixture[];
  /** Newest event after the same sort the UI uses (changedAt desc, then id asc). */
  newest(): HistoryEventFixture;
}

function compareEvents(a: HistoryEventFixture, b: HistoryEventFixture): number {
  if (a.changedAt !== b.changedAt) {
    return a.changedAt > b.changedAt ? -1 : 1;
  }
  return a.id.localeCompare(b.id);
}

const TIER_LABELS: Record<string, string> = {
  s: "S",
  a: "A",
  b: "B",
  c: "C",
  d: "D",
  f: "F",
  unranked: "Без оценки",
};

const STATUS_LABELS: Record<string, string> = {
  wishlist: "Хочу поиграть",
  playing: "Играю",
  played: "Играл",
  completed: "Пройдено",
  platinum: "Платина",
  dropped: "Брошено",
};

const FIELD_LABELS: Record<string, string> = {
  status: "Статус",
  placement: "Тир",
  title: "Название",
  coverAssetId: "Обложка",
  steamAppId: "Steam App ID",
  importedVia: "Источник",
  hoursPlayed: "Часы",
  lastPlayedAt: "Последняя игра",
  achievementsUnlocked: "Достижения",
  achievementsTotal: "Достижения (всего)",
  platforms: "Платформы",
  tags: "Теги",
  reviewMarkdown: "Обзор",
  bodyMarkdown: "Заметка",
  attachments: "Вложения",
  groupRank: "Группа",
  rank: "Порядок",
};

function formatFieldValue(field: string | null, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (field === "status" && typeof value === "string" && value in STATUS_LABELS) {
    return STATUS_LABELS[value];
  }
  if (field === "placement" && typeof value === "object" && value !== null) {
    const tierId = (value as { tierId?: unknown }).tierId;
    if (typeof tierId === "string" && tierId in TIER_LABELS) return TIER_LABELS[tierId];
  }
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "boolean") return value ? "да" : "нет";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.trim() || "—";
  return "—";
}

/** Mirror of HistoryPage.formatHistoryDelta for fixture assertions. */
export function formatHistoryDelta(event: HistoryEventFixture): string {
  if (event.op === "create") {
    return event.entity === "note" ? "Заметка · добавлена" : "Добавлена";
  }
  if (event.op === "delete") {
    return event.entity === "note" ? "Заметка · удалена" : "Удалена";
  }
  if (event.field === "reviewMarkdown" || event.field === "bodyMarkdown") {
    return event.entity === "note" ? "Заметка · обновлён текст" : "Обзор · обновлён текст";
  }
  const label = FIELD_LABELS[event.field ?? ""] ?? event.field ?? "Изменение";
  return `${label}: ${formatFieldValue(event.field, event.before)} → ${formatFieldValue(event.field, event.after)}`;
}

export async function loadHistoryFixture(page: Page): Promise<HistoryFixture> {
  const response = await page.request.get("/data/history.json");
  if (!response.ok()) {
    throw new Error(`Failed to load history.json: ${response.status()}`);
  }
  const data = await response.json() as { events: HistoryEventFixture[] };
  const events = data.events ?? [];
  return {
    events,
    newest() {
      if (events.length === 0) throw new Error("history.json has no events");
      return [...events].sort(compareEvents)[0]!;
    },
  };
}
