import type { HistoryEvent } from "./historyTypes";

export interface HistoryCluster {
  gameId: string;
  title: string;
  coverAssetId: string | null;
  changedAt: string;
  events: HistoryEvent[];
}

function compareEvents(a: HistoryEvent, b: HistoryEvent): number {
  if (a.changedAt !== b.changedAt) {
    return a.changedAt > b.changedAt ? -1 : 1;
  }
  return a.id.localeCompare(b.id);
}

export function clusterHistoryByConsecutiveGame(events: HistoryEvent[]): HistoryCluster[] {
  if (events.length === 0) {
    return [];
  }

  const sorted = [...events].sort(compareEvents);
  const clusters: HistoryCluster[] = [];

  for (const ev of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && last.gameId === ev.gameId) {
      last.events.push(ev);
    } else {
      clusters.push({
        gameId: ev.gameId,
        title: ev.title,
        coverAssetId: ev.coverAssetId,
        changedAt: ev.changedAt,
        events: [ev],
      });
    }
  }

  return clusters;
}
