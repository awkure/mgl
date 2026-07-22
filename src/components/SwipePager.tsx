import { type MutableRefObject, type ReactNode, useEffect, useRef } from "react";
import type { Asset, Game } from "../domain/types";
import { CatalogPage } from "../pages/CatalogPage";
import { SettingsPage, type SettingsPatProps } from "../pages/SettingsPage";
import { TierListPage, type MoveGameTarget } from "../pages/TierListPage";
import {
  pagerIndexToPath,
  pagerTrackTranslateFromProgress,
  routeToPagerIndex,
  useSwipePager,
  type PagerIndex,
  type PagerPath,
} from "../hooks/useSwipeNavigation";

export interface SwipePagerProps {
  pathname: string;
  games: Game[];
  assets: Record<string, Asset>;
  draggingRef: MutableRefObject<boolean>;
  onMoveGame: (gameId: string, target: MoveGameTarget) => void;
  onOpenGame: (gameId: string) => void;
  onNavigate: (path: PagerPath) => void;
  onProgress?: (progress: number) => void;
  onDraggingChange?: (dragging: boolean) => void;
  resolveAssetUrl?: (assetId: string) => string | null;
  settingsPat?: SettingsPatProps;
}

export function SwipePager({
  pathname,
  games,
  assets,
  draggingRef,
  onMoveGame,
  onOpenGame,
  onNavigate,
  onProgress,
  onDraggingChange,
  resolveAssetUrl,
  settingsPat,
}: SwipePagerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const index = routeToPagerIndex(pathname);
  const { dragging } = useSwipePager({
    targetRef: rootRef,
    trackRef,
    index,
    enabled: true,
    isBlocked: () => draggingRef.current,
    onCommit: (next) => onNavigate(pagerIndexToPath(next)),
    onProgress,
    onDraggingChange,
  });

  useEffect(() => {
    const track = trackRef.current;
    if (!track || dragging) return;
    if (!track.style.transform) {
      track.style.transition = "none";
      track.style.transform = pagerTrackTranslateFromProgress(index);
    }
  }, [index, dragging]);

  return (
    <div className="swipe-pager" data-dragging={dragging ? "true" : undefined} ref={rootRef}>
      <div className="swipe-pager__track" ref={trackRef}>
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
        <SwipePanel active={index === 2} labelledBy="settings-panel-label">
          <span className="visually-hidden" id="settings-panel-label">Настройки</span>
          <SettingsPage pat={settingsPat} />
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

export type { PagerIndex, PagerPath };
