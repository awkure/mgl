import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useState, type JSX } from "react";
import type { Asset, Game } from "../domain/types";
import { GameCard } from "./GameCard";

/** Matches `.catalog-list { grid-template-columns: 1fr }` in styles.css. */
export const CATALOG_SINGLE_COLUMN_QUERY = "(max-width: 720px)";

function useCatalogSingleColumn(): boolean {
  const [singleColumn, setSingleColumn] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia(CATALOG_SINGLE_COLUMN_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(CATALOG_SINGLE_COLUMN_QUERY);
    const sync = () => setSingleColumn(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return singleColumn;
}

function CatalogListGrid(props: {
  games: Game[];
  assets: Record<string, Asset>;
  resolveAssetUrl?: (assetId: string) => string | null;
  onOpenGame?: (gameId: string) => void;
}): JSX.Element {
  const { games, assets, resolveAssetUrl, onOpenGame } = props;
  return (
    <div className="catalog-list">
      {games.map((game, index) => (
        <GameCard
          asset={game.coverAssetId ? assets[game.coverAssetId] : undefined}
          game={game}
          key={game.id}
          onOpen={onOpenGame}
          priority={index === 0}
          resolveAssetUrl={resolveAssetUrl}
          variant="list"
        />
      ))}
    </div>
  );
}

export function CatalogVirtualList(props: {
  games: Game[];
  assets: Record<string, Asset>;
  resolveAssetUrl?: (assetId: string) => string | null;
  onOpenGame?: (gameId: string) => void;
  scrollElement: HTMLElement | null;
}): JSX.Element {
  const { games, assets, resolveAssetUrl, onOpenGame, scrollElement } = props;
  const warnedRef = useRef(false);
  const singleColumn = useCatalogSingleColumn();
  const canVirtualize =
    singleColumn && scrollElement !== null && scrollElement.offsetHeight > 0;

  if (!canVirtualize) {
    if (import.meta.env.DEV && scrollElement === null && !warnedRef.current) {
      console.warn("[CatalogVirtualList] scroll root missing; rendering full catalog list.");
      warnedRef.current = true;
    }
    return (
      <CatalogListGrid
        assets={assets}
        games={games}
        onOpenGame={onOpenGame}
        resolveAssetUrl={resolveAssetUrl}
      />
    );
  }

  return (
    <CatalogVirtualListWindow
      assets={assets}
      games={games}
      onOpenGame={onOpenGame}
      resolveAssetUrl={resolveAssetUrl}
      scrollElement={scrollElement}
    />
  );
}

function CatalogVirtualListWindow(props: {
  games: Game[];
  assets: Record<string, Asset>;
  resolveAssetUrl?: (assetId: string) => string | null;
  onOpenGame?: (gameId: string) => void;
  scrollElement: HTMLElement;
}) {
  const { games, assets, resolveAssetUrl, onOpenGame, scrollElement } = props;
  const virtualizer = useVirtualizer({
    count: games.length,
    getItemKey: (index) => games[index]!.id,
    getScrollElement: () => scrollElement,
    estimateSize: () => 88,
    overscan: 8,
    measureElement: (element) => element.getBoundingClientRect().height,
  });
  const items = virtualizer.getVirtualItems();

  return (
    <div
      className="catalog-list catalog-list--virtual"
      style={{ height: `${virtualizer.getTotalSize()}px` }}
    >
      {items.map((item) => {
        const game = games[item.index];
        return (
          <div
            className="catalog-list__virtual-row"
            data-index={item.index}
            key={game.id}
            ref={virtualizer.measureElement}
            style={{ transform: `translateY(${item.start}px)` }}
          >
            <GameCard
              asset={game.coverAssetId ? assets[game.coverAssetId] : undefined}
              game={game}
              onOpen={onOpenGame}
              priority={item.index === 0}
              resolveAssetUrl={resolveAssetUrl}
              variant="list"
            />
          </div>
        );
      })}
    </div>
  );
}
