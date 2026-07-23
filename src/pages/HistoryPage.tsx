import type { MouseEvent } from "react";
import { clusterHistoryByConsecutiveGame } from "../domain/historyCluster";
import type { HistoryEvent } from "../domain/historyTypes";
import type { StatusId, TierId } from "../domain/types";
import { Icon } from "../components/Icon";
import { formatRelativeDate, STATUS_LABELS, TIER_LABELS } from "../components/libraryUi";

const MARKDOWN_FIELDS = new Set(["reviewMarkdown", "bodyMarkdown"]);

const HISTORY_FIELD_LABELS: Record<string, string> = {
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

function isStatusId(value: unknown): value is StatusId {
  return typeof value === "string" && value in STATUS_LABELS;
}

function isTierId(value: unknown): value is TierId {
  return typeof value === "string" && value in TIER_LABELS;
}

function formatFieldValue(field: string | null, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (field === "status" && isStatusId(value)) return STATUS_LABELS[value];
  if (field === "placement" && typeof value === "object" && value !== null) {
    const tierId = (value as { tierId?: unknown }).tierId;
    if (isTierId(tierId)) return TIER_LABELS[tierId];
  }
  if (Array.isArray(value)) {
    return value.length ? value.join(", ") : "—";
  }
  if (typeof value === "boolean") return value ? "да" : "нет";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.trim() || "—";
  return "—";
}

export function formatHistoryDelta(event: HistoryEvent): string {
  if (event.op === "create") {
    return event.entity === "note" ? "Заметка · добавлена" : "Добавлена";
  }
  if (event.op === "delete") {
    return event.entity === "note" ? "Заметка · удалена" : "Удалена";
  }
  if (event.field && MARKDOWN_FIELDS.has(event.field)) {
    return event.entity === "note" ? "Заметка · обновлён текст" : "Обзор · обновлён текст";
  }
  const label = HISTORY_FIELD_LABELS[event.field ?? ""] ?? event.field ?? "Изменение";
  const before = formatFieldValue(event.field, event.before);
  const after = formatFieldValue(event.field, event.after);
  return `${label}: ${before} → ${after}`;
}

function notePreviewText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function HistoryDelta({ event }: { event: HistoryEvent }) {
  if (event.op === "create" && event.entity === "note") {
    const preview = notePreviewText(event.after);
    return (
      <>
        <span className="history-timeline__delta-label">Заметка · добавлена</span>
        {preview ? <span className="history-timeline__note-preview">{preview}</span> : null}
      </>
    );
  }
  if (event.op === "set" && event.entity === "note" && event.field === "bodyMarkdown") {
    return (
      <>
        <span className="history-timeline__delta-label">Заметка · обновлён текст</span>
        <span className="history-timeline__note-diff">
          <span className="history-timeline__note-diff-old">{notePreviewText(event.before) ?? "—"}</span>
          <span className="history-timeline__note-diff-new">{notePreviewText(event.after) ?? "—"}</span>
        </span>
      </>
    );
  }
  return <>{formatHistoryDelta(event)}</>;
}

export interface HistoryPageProps {
  events?: HistoryEvent[];
  liveGameIds?: ReadonlySet<string>;
  /** Live library cover ids — used when event snapshot asset is gone (cover refresh). */
  liveCoverByGameId?: ReadonlyMap<string, string | null>;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  resolveAssetUrl?: (assetId: string) => string | null;
  onOpenGame?: (gameId: string) => void;
}

/** Snapshot cover if resolvable, else live game cover, else null (placeholder). */
export function resolveHistoryCoverAssetId(
  snapshotCoverAssetId: string | null,
  liveCoverAssetId: string | null | undefined,
  resolveAssetUrl?: (assetId: string) => string | null,
): string | null {
  if (snapshotCoverAssetId && resolveAssetUrl?.(snapshotCoverAssetId)) return snapshotCoverAssetId;
  if (liveCoverAssetId && resolveAssetUrl?.(liveCoverAssetId)) return liveCoverAssetId;
  if (snapshotCoverAssetId && !resolveAssetUrl) return snapshotCoverAssetId;
  if (liveCoverAssetId) return liveCoverAssetId;
  return null;
}

function HistoryCover({
  title,
  coverAssetId,
  resolveAssetUrl,
}: {
  title: string;
  coverAssetId: string | null;
  resolveAssetUrl?: (assetId: string) => string | null;
}) {
  const url = coverAssetId ? resolveAssetUrl?.(coverAssetId) ?? null : null;
  if (url) {
    return (
      <span aria-hidden="true" className="history-timeline__cover">
        <img alt="" decoding="async" draggable={false} loading="lazy" src={url} />
      </span>
    );
  }
  return (
    <span aria-hidden="true" className="history-timeline__cover history-timeline__cover--placeholder">
      <Icon name="gamepad" size={22} />
      <span>{title.slice(0, 1).toLocaleUpperCase("ru")}</span>
    </span>
  );
}

export function HistoryPage({
  events = [],
  liveGameIds = new Set(),
  liveCoverByGameId = new Map(),
  loading = false,
  error = null,
  onRetry,
  resolveAssetUrl,
  onOpenGame,
}: HistoryPageProps) {
  const clusters = clusterHistoryByConsecutiveGame(events);
  const showEmpty = !loading && !error && events.length === 0;

  const openGame = (gameId: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (onOpenGame) event.preventDefault();
    onOpenGame?.(gameId);
  };

  return (
    <div className="page history-page">
      <header className="page-heading">
        <div>
          <h1>История</h1>
          <p>Изменения опубликованной библиотеки.</p>
        </div>
      </header>

      {error ? (
        <div className="inline-alert inline-alert--error" role="alert">
          <span>{error}</span>
          {onRetry ? (
            <button className="button button--ghost" onClick={onRetry} type="button">
              Повторить
            </button>
          ) : null}
        </div>
      ) : null}

      {loading && events.length === 0 ? (
        <p className="history-page__loading">Загружаем историю…</p>
      ) : null}

      {showEmpty ? (
        <div className="empty-state empty-state--compact">
          <p>Пока нет опубликованных изменений.</p>
        </div>
      ) : null}

      {clusters.length > 0 ? (
        <div className="history-timeline">
          <div aria-hidden="true" className="history-timeline__rail" />
          <ol className="history-timeline__list">
            {clusters.map((cluster) => {
              const live = liveGameIds.has(cluster.gameId);
              const coverAssetId = resolveHistoryCoverAssetId(
                cluster.coverAssetId,
                liveCoverByGameId.get(cluster.gameId),
                resolveAssetUrl,
              );
              const nodeClass = `history-timeline__node${live ? "" : " is-missing"}`;
              const headerInner = (
                <>
                  <HistoryCover
                    coverAssetId={coverAssetId}
                    resolveAssetUrl={resolveAssetUrl}
                    title={cluster.title}
                  />
                  <span className="history-timeline__title">{cluster.title}</span>
                  {!live ? <span className="history-timeline__missing-tag">удалена</span> : null}
                </>
              );
              return (
                <li className={nodeClass} key={`${cluster.gameId}:${cluster.changedAt}:${cluster.events[0]?.id}`}>
                  <div className="history-timeline__header">
                    {live ? (
                      <a
                        className="history-timeline__link"
                        href={`#/games/${encodeURIComponent(cluster.gameId)}`}
                        onClick={openGame(cluster.gameId)}
                      >
                        {headerInner}
                      </a>
                    ) : (
                      <div className="history-timeline__link history-timeline__link--static">{headerInner}</div>
                    )}
                    <time className="history-timeline__time" dateTime={cluster.changedAt}>
                      {formatRelativeDate(cluster.changedAt)}
                    </time>
                  </div>
                  <ul className="history-timeline__deltas">
                    {cluster.events.map((ev) => (
                      <li className="history-timeline__delta" key={ev.id}>
                        <HistoryDelta event={ev} />
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
