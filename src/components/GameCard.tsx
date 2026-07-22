import { forwardRef, memo, type AnchorHTMLAttributes, type CSSProperties, type HTMLAttributes, type MouseEvent, type Ref } from "react";
import type { Asset, Game } from "../domain/types";
import { Icon } from "./Icon";
import { getAssetUrl, joinHuman, STATUS_LABELS } from "./libraryUi";

export interface GameCardProps {
  game: Game;
  asset?: Asset;
  variant?: "tier" | "list" | "compact";
  isDragging?: boolean;
  /** Eager-load cover for LCP (first visible catalog card / hero). */
  priority?: boolean;
  style?: CSSProperties;
  dragLinkProps?: AnchorHTMLAttributes<HTMLAnchorElement>;
  dragLinkRef?: Ref<HTMLAnchorElement>;
  dragRootProps?: HTMLAttributes<HTMLElement>;
  onOpen?: (gameId: string) => void;
  resolveAssetUrl?: (assetId: string) => string | null;
}

export const GameCard = memo(forwardRef<HTMLElement, GameCardProps>(function GameCard(
  {
    game,
    asset,
    variant = "tier",
    isDragging = false,
    priority = false,
    style,
    dragLinkProps,
    dragLinkRef,
    dragRootProps,
    onOpen,
    resolveAssetUrl,
  },
  ref,
) {
  const coverUrl = game.coverAssetId ? resolveAssetUrl?.(game.coverAssetId) ?? getAssetUrl(asset) : null;
  const isTierCard = variant === "tier";
  const tierAccessibleLabel = `${game.title}, статус: ${STATUS_LABELS[game.status]}. Открыть; пробел — перетащить`;
  const coverClassName = `game-card__cover${game.status === "platinum" ? " cover--platinum" : ""}${isTierCard && dragLinkProps?.className ? ` ${dragLinkProps.className}` : ""}`;
  const openGame = (event: MouseEvent<HTMLAnchorElement>) => {
    // Tier tiles (incl. drag overlay) always own navigation — never follow href on release.
    if (isTierCard || onOpen) event.preventDefault();
    onOpen?.(game.id);
  };

  const coverMedia = coverUrl ? (
    <img
      alt={asset && "alt" in asset ? asset.alt || `Обложка ${game.title}` : `Обложка ${game.title}`}
      decoding="async"
      draggable="false"
      fetchPriority={priority ? "high" : undefined}
      height={asset && "height" in asset ? asset.height : undefined}
      loading={priority ? "eager" : "lazy"}
      src={coverUrl}
      width={asset && "width" in asset ? asset.width : undefined}
    />
  ) : (
    <span className="game-card__placeholder" aria-label="Обложки пока нет">
      <Icon name="gamepad" size={variant === "list" ? 34 : 42} />
      {!isTierCard ? <span>{game.title.slice(0, 1).toLocaleUpperCase("ru")}</span> : null}
    </span>
  );

  const body = !isTierCard ? (
    <div className="game-card__body">
      <span className="game-card__title">{game.title}</span>
      <span className="game-card__platforms" title={game.platforms.join(", ")}>
        {game.platforms.length ? joinHuman(game.platforms) : "Платформа не указана"}
      </span>
      {variant !== "list" ? <span className="game-card__status-text">{STATUS_LABELS[game.status]}</span> : null}
      {variant === "list" ? (
        <>
          <span className={`status-label status-label--${game.status}`}>{STATUS_LABELS[game.status]}</span>
          <div className="game-card__tags">
            {game.tags.slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}
            {game.tags.length > 4 ? <span>+{game.tags.length - 4}</span> : null}
          </div>
        </>
      ) : null}
    </div>
  ) : null;

  return (
    <article
      {...dragRootProps}
      className={`game-card game-card--${variant}${isDragging ? " is-dragging" : ""}${dragRootProps?.className ? ` ${dragRootProps.className}` : ""}`}
      ref={ref}
      style={{ ...dragRootProps?.style, ...style }}
      title={isTierCard ? game.title : dragRootProps?.title}
    >
      {isTierCard ? (
        <a
          {...dragLinkProps}
          aria-label={tierAccessibleLabel}
          className={coverClassName}
          draggable={false}
          href={`#/games/${encodeURIComponent(game.id)}`}
          onClick={openGame}
          ref={dragLinkRef}
          title={game.title}
        >
          {coverMedia}
          <span aria-hidden="true" className="game-card__hover-title">{game.title}</span>
        </a>
      ) : (
        <a
          aria-label={game.title}
          className="game-card__link"
          href={`#/games/${encodeURIComponent(game.id)}`}
          onClick={openGame}
        >
          <span aria-hidden="true" className={coverClassName}>
            {coverMedia}
            <span className={`status-dot status-dot--${game.status}`} />
          </span>
          {body}
        </a>
      )}
    </article>
  );
}));
