import { type MutableRefObject, type ReactNode, useEffect, useRef } from "react";
import type { Asset, Game } from "../domain/types";
import type { TabId } from "../state/tabStacks";
import { pagerIndexFromTab } from "../state/tabStacks";
import { CatalogPage } from "../pages/CatalogPage";
import { SettingsPage, type SettingsPatProps } from "../pages/SettingsPage";
import { TierListPage, type MoveGameTarget } from "../pages/TierListPage";
import {
  pagerTrackTranslateFromProgress,
  useSwipePager,
  type PagerIndex,
  type PagerPath,
} from "../hooks/useSwipeNavigation";

export interface SwipePagerProps {
  activeTab: TabId;
  games: Game[];
  assets: Record<string, Asset>;
  draggingRef: MutableRefObject<boolean>;
  onMoveGame: (gameId: string, target: MoveGameTarget) => void;
  onOpenGame: (tab: TabId, gameId: string) => void;
  onActivateTab: (tab: TabId) => void;
  onProgress?: (progress: number) => void;
  onDraggingChange?: (dragging: boolean) => void;
  resolveAssetUrl?: (assetId: string) => string | null;
  onRefresh?: () => void | Promise<void>;
  settingsPat?: SettingsPatProps;
  /** When false, catalog must not rewrite the hash (game/new overlay on top). */
  catalogHashSync?: boolean;
  tiersOverlay?: ReactNode;
  catalogOverlay?: ReactNode;
  settingsOverlay?: ReactNode;
}

export function SwipePager({
  activeTab,
  games,
  assets,
  draggingRef,
  onMoveGame,
  onOpenGame,
  onActivateTab,
  onProgress,
  onDraggingChange,
  resolveAssetUrl,
  onRefresh,
  settingsPat,
  catalogHashSync = true,
  tiersOverlay,
  catalogOverlay,
  settingsOverlay,
}: SwipePagerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const index = pagerIndexFromTab(activeTab);
  const { dragging } = useSwipePager({
    targetRef: rootRef,
    trackRef,
    index,
    enabled: true,
    isBlocked: () => draggingRef.current,
    onCommit: (next) => {
      const tab = next === 0 ? "tiers" : next === 1 ? "catalog" : "settings";
      onActivateTab(tab);
    },
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
          <div className="swipe-pager__stack">
            <TierListPage
              assets={assets}
              draggingRef={draggingRef}
              games={games}
              onMoveGame={onMoveGame}
              onOpenGame={(id) => onOpenGame("tiers", id)}
              onRefresh={onRefresh}
              resolveAssetUrl={resolveAssetUrl}
            />
            {tiersOverlay ? <div className="swipe-pager__overlay">{tiersOverlay}</div> : null}
          </div>
        </SwipePanel>
        <SwipePanel active={index === 1} labelledBy="catalog-panel-label">
          <span className="visually-hidden" id="catalog-panel-label">Каталог</span>
          <div className="swipe-pager__stack">
            <CatalogPage
              active={index === 1 && catalogHashSync}
              assets={assets}
              games={games}
              onOpenGame={(id) => onOpenGame("catalog", id)}
              onRefresh={onRefresh}
              resolveAssetUrl={resolveAssetUrl}
              scrollSelf
            />
            {catalogOverlay ? <div className="swipe-pager__overlay">{catalogOverlay}</div> : null}
          </div>
        </SwipePanel>
        <SwipePanel active={index === 2} labelledBy="settings-panel-label">
          <span className="visually-hidden" id="settings-panel-label">Настройки</span>
          <div className="swipe-pager__stack">
            <SettingsPage pat={settingsPat} />
            {settingsOverlay ? <div className="swipe-pager__overlay">{settingsOverlay}</div> : null}
          </div>
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

export type { PagerIndex, PagerPath, TabId };
