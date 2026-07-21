import { type MutableRefObject, type ReactNode, useRef } from "react";
import type { Asset, Game } from "../domain/types";
import { CatalogPage } from "../pages/CatalogPage";
import { TierListPage, type MoveGameTarget } from "../pages/TierListPage";
import {
  pagerIndexToPath,
  routeToPagerIndex,
  useSwipePager,
  type PagerIndex,
} from "../hooks/useSwipeNavigation";

export interface SwipePagerProps {
  pathname: string;
  games: Game[];
  assets: Record<string, Asset>;
  draggingRef: MutableRefObject<boolean>;
  onMoveGame: (gameId: string, target: MoveGameTarget) => void;
  onOpenGame: (gameId: string) => void;
  onNavigate: (path: "/" | "/games") => void;
  resolveAssetUrl?: (assetId: string) => string | null;
}

export function SwipePager({
  pathname,
  games,
  assets,
  draggingRef,
  onMoveGame,
  onOpenGame,
  onNavigate,
  resolveAssetUrl,
}: SwipePagerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const index = routeToPagerIndex(pathname);
  const { dragOffset, dragging } = useSwipePager({
    targetRef: rootRef,
    index,
    enabled: true,
    isBlocked: () => draggingRef.current,
    onCommit: (next) => onNavigate(pagerIndexToPath(next)),
  });

  const base = -index * 100;
  const width = rootRef.current?.clientWidth || (typeof window !== "undefined" ? window.innerWidth : 1);
  const dragPercent = width ? (dragOffset / width) * 100 : 0;
  const translate = `translate3d(calc(${base}% + ${dragPercent}%), 0, 0)`;

  return (
    <div className="swipe-pager" data-dragging={dragging ? "true" : undefined} ref={rootRef}>
      <div
        className="swipe-pager__track"
        style={{
          transform: translate,
          transition: dragging ? "none" : "transform 280ms cubic-bezier(.22, 1, .36, 1)",
        }}
      >
        <SwipePanel active={index === 0} labelledBy="tier-panel-label">
          <span className="visually-hidden" id="tier-panel-label">Тирлист</span>
          <TierListPage
            assets={assets}
            draggingRef={draggingRef}
            games={games}
            onMoveGame={onMoveGame}
            onOpenGame={onOpenGame}
            resolveAssetUrl={resolveAssetUrl}
          />
        </SwipePanel>
        <SwipePanel active={index === 1} labelledBy="catalog-panel-label">
          <span className="visually-hidden" id="catalog-panel-label">Каталог</span>
          <CatalogPage
            active={index === 1}
            assets={assets}
            games={games}
            onOpenGame={onOpenGame}
            resolveAssetUrl={resolveAssetUrl}
            scrollSelf
          />
        </SwipePanel>
      </div>
    </div>
  );
}

function SwipePanel({
  active,
  labelledBy,
  children,
}: {
  active: boolean;
  labelledBy: string;
  children: ReactNode;
}) {
  return (
    <div
      aria-hidden={active ? undefined : true}
      aria-labelledby={labelledBy}
      className="swipe-pager__panel"
      inert={!active || undefined}
    >
      {children}
    </div>
  );
}

export type { PagerIndex };
