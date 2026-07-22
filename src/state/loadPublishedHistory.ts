import type { HistoryEvent } from "../domain/historyTypes";

/** Soft-load published history.json; bypass browser HTTP cache like library.json. */
export async function loadPublishedHistory(): Promise<HistoryEvent[]> {
  const dataUrl = new URL(`${import.meta.env.BASE_URL}data/history.json`, document.baseURI);
  dataUrl.searchParams.set("_", String(Date.now()));
  const response = await fetch(dataUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = (await response.json()) as { events?: HistoryEvent[] };
  return Array.isArray(data.events) ? data.events : [];
}
