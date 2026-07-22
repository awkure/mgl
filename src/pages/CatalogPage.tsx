import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { gameMatchesFilters } from "../domain/catalogue";
import { sortCatalogGames } from "../domain/catalogSort";
import { CATALOG_FILTERS_EVENT, parseCatalogSearch, sameCatalogSearch, serializeCatalogSearch, type CatalogSearchFilters } from "../domain/catalogSearch";
import { type Asset, type Game } from "../domain/types";
import { useCatalogSort } from "../components/catalogSortState";
import { CatalogVirtualList } from "../components/CatalogVirtualList";
import { Icon } from "../components/Icon";
import { PullToRefresh } from "../components/PullToRefresh";
import { STATUS_LABELS, TIER_LABELS } from "../components/libraryUi";

export interface CatalogPageProps {
  games: Game[];
  assets: Record<string, Asset>;
  /** When false (preloaded in pager), do not rewrite the hash or listen for filter sync. */
  active?: boolean;
  /** Use the page element as the scroll root (pager panels). */
  scrollSelf?: boolean;
  onOpenGame?: (gameId: string) => void;
  onRefresh?: () => void | Promise<void>;
  resolveAssetUrl?: (assetId: string) => string | null;
}

function initialFilters(): CatalogSearchFilters {
  return parseCatalogSearch(typeof window === "undefined" ? "" : window.location.hash.split("?")[1] ?? "");
}

export function CatalogPage({
  games,
  assets,
  active = true,
  scrollSelf = false,
  onOpenGame,
  onRefresh,
  resolveAssetUrl,
}: CatalogPageProps) {
  const [filters, setFilters] = useState<CatalogSearchFilters>(initialFilters);
  const deferredFilters = useDeferredValue(filters);
  const [sort] = useCatalogSort();
  const deferredSort = useDeferredValue(sort);
  /** Skip stomping URL once after the pager activates this panel. */
  const skipNextWriteRef = useRef(false);
  const wasActiveRef = useRef(active);

  useLayoutEffect(() => {
    if (!active) {
      wasActiveRef.current = false;
      return;
    }
    const justActivated = !wasActiveRef.current;
    wasActiveRef.current = true;
    if (!justActivated) return;
    skipNextWriteRef.current = true;
    setFilters(initialFilters());
  }, [active]);

  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    if (skipNextWriteRef.current) {
      skipNextWriteRef.current = false;
      // Preserve navigate()'s hash (may already include q=…) — don't write stale React state.
      const hydrated = initialFilters();
      setFilters((current) => (sameCatalogSearch(current, hydrated) ? current : hydrated));
      window.dispatchEvent(new Event(CATALOG_FILTERS_EVENT));
      return;
    }
    const query = serializeCatalogSearch(filters);
    history.replaceState(null, "", `#/games${query ? `?${query}` : ""}`);
    window.dispatchEvent(new Event(CATALOG_FILTERS_EVENT));
  }, [active, filters]);

  useEffect(() => {
    if (!active) return;
    const sync = () => {
      const next = initialFilters();
      setFilters((current) => sameCatalogSearch(current, next) ? current : next);
    };
    window.addEventListener("hashchange", sync);
    window.addEventListener(CATALOG_FILTERS_EVENT, sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener(CATALOG_FILTERS_EVENT, sync);
    };
  }, [active]);

  const filtered = useMemo(() => {
    const matched = games.filter((game) => {
      return gameMatchesFilters(game, {
        query: deferredFilters.q,
        statuses: deferredFilters.statuses,
        tiers: deferredFilters.tiers,
        platforms: deferredFilters.platforms,
        tags: deferredFilters.tags,
      });
    });
    return sortCatalogGames(matched, deferredSort);
  }, [deferredFilters, deferredSort, games]);
  const activeFilters = [
    ...filters.statuses.map((value) => ({ key: `status:${value}`, label: STATUS_LABELS[value], remove: () => setFilters((current) => ({ ...current, statuses: current.statuses.filter((item) => item !== value) })) })),
    ...filters.tiers.map((value) => ({ key: `tier:${value}`, label: `Тир ${TIER_LABELS[value]}`, remove: () => setFilters((current) => ({ ...current, tiers: current.tiers.filter((item) => item !== value) })) })),
    ...filters.platforms.map((value) => ({ key: `platform:${value}`, label: value, remove: () => setFilters((current) => ({ ...current, platforms: current.platforms.filter((item) => item !== value) })) })),
    ...filters.tags.map((value) => ({ key: `tag:${value}`, label: `#${value}`, remove: () => setFilters((current) => ({ ...current, tags: current.tags.filter((item) => item !== value) })) })),
  ];
  const clearFilters = () => setFilters({ q: "", statuses: [], tiers: [], platforms: [], tags: [] });
  const clearActiveFilters = () => setFilters((current) => ({ ...current, statuses: [], tiers: [], platforms: [], tags: [] }));
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
  const onScrollRoot = useCallback((node: HTMLDivElement | null) => {
    scrollRootRef.current = node;
  }, []);

  useLayoutEffect(() => {
    if (!scrollSelf) {
      setScrollElement(null);
      return;
    }
    const node = scrollRootRef.current;
    if (!node) {
      setScrollElement(null);
      return;
    }
    const sync = () => setScrollElement(node);
    sync();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => sync()) : null;
    observer?.observe(node);
    return () => observer?.disconnect();
  }, [scrollSelf, filtered.length]);

  return (
    <PullToRefresh className="page catalog-page" onRefresh={onRefresh} scrollRootRef={onScrollRoot} scrollSelf={scrollSelf}>
      {activeFilters.length ? <section aria-label="Активные фильтры" className="catalog-active-filters"><div className="catalog-active-filters__chips">{activeFilters.map((filter) => <button aria-label={`Убрать фильтр: ${filter.label}`} key={filter.key} onClick={filter.remove} type="button"><span>{filter.label}</span><Icon name="close" size={13} /></button>)}</div><button className="catalog-active-filters__reset" onClick={clearActiveFilters} type="button">Сбросить</button></section> : null}
      {filtered.length ? (
        <CatalogVirtualList
          assets={assets}
          games={filtered}
          onOpenGame={onOpenGame}
          resolveAssetUrl={resolveAssetUrl}
          scrollElement={scrollElement}
        />
      ) : (
        <div className="empty-state"><span className="empty-state__icon"><Icon name={games.length ? "search" : "gamepad"} /></span><h2>{games.length ? "Ничего не найдено" : "Добавьте первую игру"}</h2><p>{games.length ? "Попробуйте изменить запрос или убрать часть фильтров." : "Используйте постоянную кнопку в хедере — игра сразу появится здесь и в тирлисте."}</p>{games.length ? <button className="button button--secondary" onClick={clearFilters} type="button">Сбросить фильтры</button> : null}</div>
      )}
    </PullToRefresh>
  );
}
