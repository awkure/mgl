import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { CATALOG_FILTERS_EVENT, emptyCatalogSearchFilters, parseCatalogSearch, sameCatalogSearch, serializeCatalogSearch, type CatalogSearchFilters } from "../domain/catalogSearch";
import { STATUS_IDS, TIER_IDS, type Game, type StatusId, type TierId } from "../domain/types";
import { useCatalogSort } from "./catalogSortState";
import { FilterMenu } from "./FilterMenu";
import { Icon } from "./Icon";
import { STATUS_LABELS, TIER_LABELS } from "./libraryUi";
import { useTierFilters } from "./screenFilters";
import { SortMenu } from "./SortMenu";

function catalogHash(): boolean {
  return /^#\/games(?:\?|$)/.test(window.location.hash);
}

function filtersFromLocation(): CatalogSearchFilters {
  return parseCatalogSearch(window.location.hash.split("?")[1] ?? "");
}

function writeCatalogLocation(filters: CatalogSearchFilters): void {
  if (!catalogHash()) return;
  const query = serializeCatalogSearch(filters);
  history.replaceState(null, "", `#/games${query ? `?${query}` : ""}`);
  window.dispatchEvent(new Event(CATALOG_FILTERS_EVENT));
}

function ScreenFilterBarView({ games, filters, onUpdate, sortControls }: {
  games: Game[];
  filters: CatalogSearchFilters;
  onUpdate: (next: CatalogSearchFilters) => void;
  sortControls?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const platforms = useMemo(() => [...new Set(games.flatMap((game) => game.platforms))].sort((left, right) => left.localeCompare(right, "ru")), [games]);
  const tags = useMemo(() => [...new Set(games.flatMap((game) => game.tags))].sort((left, right) => left.localeCompare(right, "ru")), [games]);
  const activeFilterCount = filters.statuses.length + filters.tiers.length + filters.platforms.length + filters.tags.length;

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (target instanceof Element && (target.closest("details.filter-menu[open]") || target.closest("[data-filter-menu-portal]"))) return;
      if (rootRef.current?.contains(target)) return;
      setExpanded(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Escape") return;
    if (rootRef.current?.querySelector("details.filter-menu[open]")) return;
    setExpanded(false);
    inputRef.current?.blur();
  };

  return (
    <div className={`screen-filter-bar${expanded ? " is-expanded" : ""}`} ref={rootRef}>
      <div className="screen-filter-bar__field" onClick={() => { setExpanded(true); inputRef.current?.focus(); }}>
        <Icon name="search" size={16} />
        <input
          aria-label="Фильтр игр на экране"
          onChange={(event) => onUpdate({ ...filters, q: event.currentTarget.value })}
          onFocus={() => setExpanded(true)}
          onKeyDown={onKeyDown}
          placeholder="Фильтр…"
          ref={inputRef}
          type="search"
          value={filters.q}
        />
        {filters.q ? (
          <button
            aria-label="Очистить фильтр"
            className="screen-filter-bar__clear"
            onClick={(event) => {
              event.stopPropagation();
              onUpdate({ ...filters, q: "" });
              inputRef.current?.focus();
            }}
            type="button"
          >
            <Icon name="close" size={17} />
          </button>
        ) : null}
      </div>
      {expanded ? (
        <div className="screen-filter-bar__sheet" role="dialog" aria-label="Параметры фильтра">
          <FilterMenu label="Статус" onChange={(statuses) => onUpdate({ ...filters, statuses: statuses as StatusId[] })} renderLabel={(value) => STATUS_LABELS[value as StatusId]} selected={filters.statuses} values={[...STATUS_IDS]} />
          <FilterMenu label="Тир" onChange={(tiers) => onUpdate({ ...filters, tiers: tiers as TierId[] })} renderLabel={(value) => TIER_LABELS[value as TierId]} selected={filters.tiers} values={[...TIER_IDS]} />
          <FilterMenu label="Платформа" onChange={(values) => onUpdate({ ...filters, platforms: values })} selected={filters.platforms} values={platforms} />
          <FilterMenu label="Тег" onChange={(values) => onUpdate({ ...filters, tags: values })} selected={filters.tags} values={tags} />
          {sortControls}
          {activeFilterCount ? (
            <button className="screen-filter-bar__reset" onClick={() => onUpdate({ ...emptyCatalogSearchFilters(), q: filters.q })} type="button">
              Сбросить · {activeFilterCount}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CatalogSortControls() {
  const [sort, setSort] = useCatalogSort();
  return (
    <div className="screen-filter-bar__sort">
      <div className="screen-filter-bar__sort-dir" role="group" aria-label="Направление сортировки">
        <button
          aria-label="По убыванию"
          aria-pressed={sort.dir === "desc"}
          className={`screen-filter-bar__sort-dir-btn${sort.dir === "desc" ? " is-active" : ""}`}
          onClick={() => setSort({ ...sort, dir: "desc" })}
          type="button"
        >
          ↓
        </button>
        <button
          aria-label="По возрастанию"
          aria-pressed={sort.dir === "asc"}
          className={`screen-filter-bar__sort-dir-btn${sort.dir === "asc" ? " is-active" : ""}`}
          onClick={() => setSort({ ...sort, dir: "asc" })}
          type="button"
        >
          ↑
        </button>
      </div>
      <SortMenu onChange={(key) => setSort({ key, dir: "desc" })} value={sort.key} />
    </div>
  );
}

function ScreenFilterBarCatalog({ games }: { games: Game[] }) {
  const [filters, setFilters] = useState<CatalogSearchFilters>(() => (typeof window === "undefined" ? emptyCatalogSearchFilters() : filtersFromLocation()));

  const updateFilters = (next: CatalogSearchFilters) => {
    setFilters(next);
    writeCatalogLocation(next);
  };

  useEffect(() => {
    const syncFromLocation = () => {
      if (!catalogHash()) return;
      const next = filtersFromLocation();
      setFilters((current) => (sameCatalogSearch(current, next) ? current : next));
    };
    window.addEventListener("hashchange", syncFromLocation);
    window.addEventListener(CATALOG_FILTERS_EVENT, syncFromLocation);
    return () => {
      window.removeEventListener("hashchange", syncFromLocation);
      window.removeEventListener(CATALOG_FILTERS_EVENT, syncFromLocation);
    };
  }, []);

  return <ScreenFilterBarView filters={filters} games={games} onUpdate={updateFilters} sortControls={<CatalogSortControls />} />;
}

function ScreenFilterBarTier({ games }: { games: Game[] }) {
  const { filters, setFilters } = useTierFilters();
  return <ScreenFilterBarView filters={filters} games={games} onUpdate={setFilters} />;
}

export function ScreenFilterBar({ games, mode }: { games: Game[]; mode: "catalog" | "tier" }) {
  if (mode === "tier") return <ScreenFilterBarTier games={games} />;
  return <ScreenFilterBarCatalog games={games} />;
}
