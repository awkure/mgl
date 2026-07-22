import { forwardRef, useEffect, useRef, useState, type ReactNode, type MouseEvent, type PointerEvent } from "react";
import type { Game } from "../domain/types";
import type { TabId } from "../state/tabStacks";
import { Icon, type IconName } from "./Icon";
import { GlobalGameSearch } from "./GlobalGameSearch";
import { ScreenFilterBar } from "./ScreenFilterBar";
import { ScreenFiltersProvider } from "./screenFilters";
import { formatBytes } from "./libraryUi";
import { useMobileChrome } from "./mobileChrome";
import { RandomGameButton } from "./RandomGameButton";

export type AppRoute = "tiers" | "catalog" | "game" | "new" | "history" | "settings";

/** Tab-bar blob progress for mobile chrome (0=тирлист, 1=каталог, 2=история, 3=настройки). */
export function tabProgressFromRoute(route: AppRoute): number {
  if (route === "settings") return 3;
  if (route === "history") return 2;
  if (route === "catalog" || route === "game" || route === "new") return 1;
  return 0;
}

export function tabProgressFromTabId(tab: TabId): number {
  if (tab === "settings") return 3;
  if (tab === "history") return 2;
  if (tab === "catalog") return 1;
  return 0;
}

export function shellRouteFromTab(tab: TabId): AppRoute {
  if (tab === "settings") return "settings";
  if (tab === "history") return "history";
  if (tab === "catalog") return "catalog";
  return "tiers";
}

export function tabIdFromAppRoute(route: AppRoute): TabId {
  if (route === "settings") return "settings";
  if (route === "history") return "history";
  if (route === "tiers") return "tiers";
  return "catalog";
}

export interface StorageSummary {
  bytes: number;
  budgetBytes?: number;
  localAssetCount?: number;
  localAssetBytes?: number;
  quotaLevel?: "unknown" | "ok" | "warning" | "critical" | "blocked";
  persistent?: boolean;
  oldestLocalAssetAt?: number | null;
  operationCount: number;
  conflictCount?: number;
  error?: string;
}

export interface AppShellProps {
  children: ReactNode;
  games?: Game[];
  /** Screen kind of the active tab’s top entry (search bar, FAB). */
  route: AppRoute;
  /** Owning tab for highlight; defaults from `route` when omitted. */
  activeTab?: TabId;
  storage: StorageSummary;
  onOpenDiff: () => void;
  onNavigate?: (href: string) => void;
  /** Tab bar / desktop nav: same tab → pop to root; other → activate. */
  onSelectTab?: (tab: TabId) => void;
  resolveAssetUrl?: (assetId: string) => string | null;
}

const blockSafariCallout = (event: MouseEvent<HTMLAnchorElement>) => {
  event.preventDefault();
};

function NavLink({
  active,
  href,
  icon,
  label,
  tab,
  onNavigate,
  onSelectTab,
  className = "app-nav__link",
  pressEnabled,
  pressed,
  onPressStart,
  onPressEnd,
}: {
  active: boolean;
  href: string;
  icon: IconName;
  label: string;
  tab: TabId;
  onNavigate?: (href: string) => void;
  onSelectTab?: (tab: TabId) => void;
  className?: string;
  pressEnabled?: boolean;
  pressed?: boolean;
  onPressStart?: (tab: TabId, event: PointerEvent<HTMLAnchorElement>) => void;
  onPressEnd?: () => void;
}) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (onSelectTab) {
      event.preventDefault();
      onSelectTab(tab);
      return;
    }
    if (!onNavigate) return;
    event.preventDefault();
    onNavigate(href);
  };
  return (
    <a
      aria-current={active ? "page" : undefined}
      aria-label={label}
      className={className}
      data-pressed={pressed ? "true" : undefined}
      draggable={false}
      href={href}
      onClick={onClick}
      onContextMenu={blockSafariCallout}
      onPointerCancel={pressEnabled ? () => onPressEnd?.() : undefined}
      onPointerDown={pressEnabled ? (e) => onPressStart?.(tab, e) : undefined}
      onPointerLeave={pressEnabled ? (e) => {
        if (e.buttons === 0) onPressEnd?.();
      } : undefined}
      onPointerUp={pressEnabled ? () => onPressEnd?.() : undefined}
    >
      <Icon name={icon} />
      <span>{label}</span>
    </a>
  );
}

export const AppShell = forwardRef<HTMLDivElement, AppShellProps>(function AppShell({
  children,
  games = [],
  route,
  activeTab: activeTabProp,
  storage,
  onOpenDiff,
  onNavigate,
  onSelectTab,
  resolveAssetUrl,
}, ref) {
  const mobileChrome = useMobileChrome();
  const localRef = useRef<HTMLDivElement | null>(null);
  const [pressedTab, setPressedTab] = useState<TabId | null>(null);

  const clearTabPress = () => setPressedTab(null);

  const beginTabPress = (tab: TabId, event: PointerEvent<HTMLAnchorElement>) => {
    if (event.button !== 0) return;
    const shell = event.currentTarget.closest(".app-shell") as HTMLElement | null;
    if (shell?.getAttribute("data-pager-dragging") === "true") return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setPressedTab(tab);
  };

  const setRefs = (node: HTMLDivElement | null) => {
    localRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  };

  useEffect(() => {
    const shell = localRef.current;
    if (!shell || !pressedTab) return;
    const sync = () => {
      if (shell.getAttribute("data-pager-dragging") === "true") clearTabPress();
    };
    const observer = new MutationObserver(sync);
    observer.observe(shell, { attributes: true, attributeFilter: ["data-pager-dragging"] });
    sync();
    return () => observer.disconnect();
  }, [pressedTab]);

  const activeTab = activeTabProp ?? tabIdFromAppRoute(route);
  const shellRoute = activeTabProp ? shellRouteFromTab(activeTab) : route;
  const atTabRoot = route === "tiers" || route === "catalog" || route === "history" || route === "settings";
  const showFilterBar = (activeTab === "tiers" || activeTab === "catalog") && atTabRoot;
  const filterMode = activeTab === "catalog" ? "catalog" : "tier";
  const budget = storage.budgetBytes ?? 4 * 1024 * 1024;
  const ratio = budget ? storage.bytes / budget : 0;
  const localAssetCount = storage.localAssetCount ?? 0;
  const localAssetBytes = storage.localAssetBytes ?? 0;
  const localLevel = storage.quotaLevel ?? "unknown";
  const localAgeDays = storage.oldestLocalAssetAt ? Math.floor((Date.now() - storage.oldestLocalAssetAt) / (24 * 60 * 60 * 1000)) : 0;
  const localWarning = localAssetCount > 0 && (localLevel === "warning" || localLevel === "critical" || localLevel === "blocked" || !storage.persistent || localAssetBytes >= 100 * 1024 * 1024 || localAgeDays >= 7);
  const storageLevel = storage.error
    ? "error"
    : localLevel === "blocked" || ratio >= 0.95
      ? "blocked"
      : localLevel === "critical" || localAssetBytes >= 250 * 1024 * 1024 || ratio >= 0.85
        ? "critical"
        : localWarning || ratio >= 0.7
          ? "warning"
          : "ok";
  const storageNeedsAttention = storageLevel === "warning" || storageLevel === "critical" || storageLevel === "blocked";
  const displayedBytes = storage.bytes;

  return (
    <ScreenFiltersProvider>
    <div
      className="app-shell"
      data-mobile-chrome={mobileChrome ? "true" : undefined}
      data-route={shellRoute}
      data-tab-press={pressedTab ? "true" : undefined}
      ref={setRefs}
      style={pressedTab ? { ["--press-tab" as string]: String(tabProgressFromTabId(pressedTab)) } : undefined}
    >
      <a className="skip-link" href="#main-content">К основному содержимому</a>
      <header className="app-header">
        {!mobileChrome ? (
          <nav aria-label="Основная навигация" className="app-nav app-nav--desktop">
            <NavLink active={activeTab === "tiers"} href="#/" icon="book" label="Тирлист" onNavigate={onNavigate} onSelectTab={onSelectTab} tab="tiers" />
            <NavLink active={activeTab === "catalog"} href="#/games" icon="collection" label="Каталог" onNavigate={onNavigate} onSelectTab={onSelectTab} tab="catalog" />
            <NavLink active={activeTab === "history"} href="#/history" icon="history" label="История" onNavigate={onNavigate} onSelectTab={onSelectTab} tab="history" />
          </nav>
        ) : null}
        {showFilterBar ? <ScreenFilterBar games={games} mode={filterMode} /> : null}
        <GlobalGameSearch games={games} onNavigate={onNavigate} />
        <div className="app-header__actions">
          <RandomGameButton games={games} onNavigate={onNavigate} resolveAssetUrl={resolveAssetUrl} />
          <button
            aria-label={`Локальные правки: ${storage.operationCount}, ${formatBytes(displayedBytes)}${localAssetCount ? `, локальных файлов: ${localAssetCount}` : ""}${storage.conflictCount ? `, конфликтов: ${storage.conflictCount}` : ""}${storageNeedsAttention ? ", хранилище требует внимания" : ""}${storage.error ? `, ошибка: ${storage.error}` : ""}`}
            className={`patch-pill patch-pill--${storageLevel}`}
            onClick={onOpenDiff}
            title={storage.error}
            type="button"
          >
            <span className="patch-pill__pulse" aria-hidden="true" />
            <span>Локальные правки</span>
            <strong>{storage.operationCount}</strong>
            <span className="patch-pill__size">{formatBytes(displayedBytes)}</span>
            {storage.conflictCount ? <span className="patch-pill__conflicts" aria-label={`${storage.conflictCount} конфликтов`}><Icon name="warning" size={15} /></span> : null}
          </button>
          {storage.error ? <span className="visually-hidden" role="alert">{storage.error}</span> : null}
          {!mobileChrome ? (
            <>
              <a
                aria-label="Настройки"
                className={`button button--ghost button--icon app-header__settings${activeTab === "settings" ? " is-active" : ""}`}
                href="#/settings"
                onClick={onSelectTab
                  ? (event) => { event.preventDefault(); onSelectTab("settings"); }
                  : onNavigate ? (event) => { event.preventDefault(); onNavigate("#/settings"); } : undefined}
              >
                <Icon name="settings" size={18} />
              </a>
              <a className="button button--primary button--new-game" href="#/games/new" onClick={onNavigate ? (event) => { event.preventDefault(); onNavigate("#/games/new"); } : undefined}>
                <Icon name="plus" size={18} />Добавить игру
              </a>
            </>
          ) : null}
        </div>
      </header>
      <main id="main-content" className="app-main">{children}</main>

      {mobileChrome ? (
        <>
          <nav aria-label="Мобильная навигация" className="app-tab-bar">
            <span aria-hidden="true" className="app-tab-bar__blob" />
            <NavLink active={activeTab === "tiers"} className="app-tab-bar__link" href="#/" icon="book" label="Тирлист" onNavigate={onNavigate} onPressEnd={clearTabPress} onPressStart={beginTabPress} onSelectTab={onSelectTab} pressEnabled pressed={pressedTab === "tiers"} tab="tiers" />
            <NavLink active={activeTab === "catalog"} className="app-tab-bar__link" href="#/games" icon="collection" label="Каталог" onNavigate={onNavigate} onPressEnd={clearTabPress} onPressStart={beginTabPress} onSelectTab={onSelectTab} pressEnabled pressed={pressedTab === "catalog"} tab="catalog" />
            <NavLink active={activeTab === "history"} className="app-tab-bar__link" href="#/history" icon="history" label="История" onNavigate={onNavigate} onPressEnd={clearTabPress} onPressStart={beginTabPress} onSelectTab={onSelectTab} pressEnabled pressed={pressedTab === "history"} tab="history" />
            <NavLink active={activeTab === "settings"} className="app-tab-bar__link" href="#/settings" icon="settings" label="Настройки" onNavigate={onNavigate} onPressEnd={clearTabPress} onPressStart={beginTabPress} onSelectTab={onSelectTab} pressEnabled pressed={pressedTab === "settings"} tab="settings" />
          </nav>
          <a
            aria-current={route === "new" ? "page" : undefined}
            aria-label="Добавить игру"
            className={`app-tab-add${route === "new" ? " is-active" : ""}`}
            draggable={false}
            href="#/games/new"
            onClick={onNavigate ? (event) => { event.preventDefault(); onNavigate("#/games/new"); } : undefined}
            onContextMenu={blockSafariCallout}
          >
            <Icon name="plus" size={22} />
          </a>
        </>
      ) : null}
    </div>
    </ScreenFiltersProvider>
  );
});
