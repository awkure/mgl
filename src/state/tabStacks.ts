export type TabId = "tiers" | "catalog" | "history" | "settings";

export interface StackEntry {
  pathname: string;
  search?: string;
}

export interface TabStacksState {
  activeTab: TabId;
  stacks: Record<TabId, StackEntry[]>;
}

export const TAB_ROOTS: Record<TabId, StackEntry> = {
  tiers: { pathname: "/" },
  catalog: { pathname: "/games" },
  history: { pathname: "/history" },
  settings: { pathname: "/settings" },
};

export function entryFromPath(pathname: string, search?: string): StackEntry {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const cleanSearch = search?.replace(/^\?/, "") || undefined;
  return cleanSearch ? { pathname: normalized, search: cleanSearch } : { pathname: normalized };
}

export function locationHref(entry: StackEntry): string {
  return entry.search ? `${entry.pathname}?${entry.search}` : entry.pathname;
}

export function entriesEqual(a: StackEntry, b: StackEntry): boolean {
  return a.pathname === b.pathname && (a.search ?? "") === (b.search ?? "");
}

/** Default owning tab for a URL. Game/new deep links belong to catalog until pushed onto another tab. */
export function tabIdFromPath(pathname: string): TabId {
  if (pathname === "/settings") return "settings";
  if (pathname === "/history") return "history";
  if (pathname === "/") return "tiers";
  if (pathname === "/games" || pathname.startsWith("/games/")) return "catalog";
  return "catalog";
}

export function isTabRoot(tab: TabId, entry: StackEntry): boolean {
  return entry.pathname === TAB_ROOTS[tab].pathname;
}

export function stackTop(state: TabStacksState, tab: TabId = state.activeTab): StackEntry | undefined {
  const stack = state.stacks[tab];
  return stack[stack.length - 1];
}

function cloneStacks(stacks: Record<TabId, StackEntry[]>): Record<TabId, StackEntry[]> {
  return {
    tiers: [...stacks.tiers],
    catalog: [...stacks.catalog],
    history: [...stacks.history],
    settings: [...stacks.settings],
  };
}

function rootStack(tab: TabId, seed?: StackEntry): StackEntry[] {
  if (seed && isTabRoot(tab, seed)) return [seed];
  return [{ ...TAB_ROOTS[tab] }];
}

/** Build initial state from the current URL (deep link aware). */
export function createInitialTabStacksState(location: StackEntry): TabStacksState {
  const tab = tabIdFromPath(location.pathname);
  const stacks: Record<TabId, StackEntry[]> = {
    tiers: rootStack("tiers"),
    catalog: rootStack("catalog"),
    history: rootStack("history"),
    settings: rootStack("settings"),
  };

  if (isTabRoot(tab, location)) {
    stacks[tab] = [location];
  } else {
    stacks[tab] = [{ ...TAB_ROOTS[tab] }, location];
  }

  return { activeTab: tab, stacks };
}

export function pushOntoTab(state: TabStacksState, tab: TabId, entry: StackEntry): TabStacksState {
  const stacks = cloneStacks(state.stacks);
  const stack = stacks[tab];
  const top = stack[stack.length - 1];
  if (top && entriesEqual(top, entry)) {
    return state.activeTab === tab ? state : { ...state, activeTab: tab };
  }
  stacks[tab] = [...stack, entry];
  return { activeTab: tab, stacks };
}

export function activateTab(state: TabStacksState, tab: TabId): TabStacksState {
  if (state.activeTab === tab) return state;
  return { ...state, activeTab: tab };
}

export function popTabToRoot(state: TabStacksState, tab: TabId): TabStacksState {
  const stacks = cloneStacks(state.stacks);
  const current = stacks[tab];
  const root = current[0] && isTabRoot(tab, current[0]) ? current[0] : { ...TAB_ROOTS[tab] };
  stacks[tab] = [root];
  return { activeTab: tab, stacks };
}

export function popActiveTab(state: TabStacksState): TabStacksState {
  return popTab(state, state.activeTab);
}

export function popTab(state: TabStacksState, tab: TabId): TabStacksState {
  const stack = state.stacks[tab];
  if (stack.length <= 1) return state;
  const stacks = cloneStacks(state.stacks);
  stacks[tab] = stack.slice(0, -1);
  return { ...state, stacks };
}

export function replaceActiveTop(state: TabStacksState, entry: StackEntry): TabStacksState {
  const tab = state.activeTab;
  const stacks = cloneStacks(state.stacks);
  const stack = stacks[tab];
  if (stack.length === 0) {
    stacks[tab] = [entry];
  } else {
    stacks[tab] = [...stack.slice(0, -1), entry];
  }
  return { ...state, stacks };
}

const TAB_ORDER: TabId[] = ["tiers", "catalog", "history", "settings"];

function isGameLikePath(pathname: string): boolean {
  return pathname === "/games/new" || /^\/games\/[^/]+$/.test(pathname);
}

/**
 * Apply an external location change (hash navigate / browser history) onto stacks.
 * Matching an existing stack entry wins (so tab switch restore works).
 * New game-like URLs stay on the active tiers/catalog tab when possible.
 */
export function syncFromLocation(state: TabStacksState, location: StackEntry): TabStacksState {
  const activeTop = stackTop(state);
  if (activeTop && entriesEqual(activeTop, location)) return state;

  for (const tab of TAB_ORDER) {
    const stack = state.stacks[tab];
    const existingIndex = stack.findIndex((entry) => entriesEqual(entry, location));
    if (existingIndex >= 0) {
      const stacks = cloneStacks(state.stacks);
      stacks[tab] = stack.slice(0, existingIndex + 1);
      return { activeTab: tab, stacks };
    }
  }

  const tab = isGameLikePath(location.pathname) && (state.activeTab === "tiers" || state.activeTab === "catalog")
    ? state.activeTab
    : tabIdFromPath(location.pathname);

  const stacks = cloneStacks(state.stacks);

  if (isTabRoot(tab, location)) {
    stacks[tab] = [location];
    return { activeTab: tab, stacks };
  }

  const stack = stacks[tab];
  const root = stack[0] && isTabRoot(tab, stack[0]) ? stack[0] : { ...TAB_ROOTS[tab] };
  stacks[tab] = [root, location];
  return { activeTab: tab, stacks };
}
export function tabFromPagerIndex(index: 0 | 1 | 2 | 3): TabId {
  if (index === 1) return "catalog";
  if (index === 2) return "history";
  if (index === 3) return "settings";
  return "tiers";
}

export function pagerIndexFromTab(tab: TabId): 0 | 1 | 2 | 3 {
  if (tab === "catalog") return 1;
  if (tab === "history") return 2;
  if (tab === "settings") return 3;
  return 0;
}

export function tabProgressFromTabId(tab: TabId): number {
  return pagerIndexFromTab(tab);
}

/** Tab bar click: same tab → pop to root; other tab → activate (restore top). */
export function selectTab(state: TabStacksState, tab: TabId): TabStacksState {
  if (state.activeTab === tab) return popTabToRoot(state, tab);
  return activateTab(state, tab);
}
