import { describe, expect, it } from "vitest";
import {
  TAB_ROOTS,
  activateTab,
  createInitialTabStacksState,
  entryFromPath,
  locationHref,
  popActiveTab,
  popTabToRoot,
  pushOntoTab,
  replaceActiveTop,
  stackTop,
  syncFromLocation,
  tabFromPagerIndex,
  tabIdFromPath,
  tabProgressFromTabId,
  type TabStacksState,
} from "../src/state/tabStacks";

describe("tabStacks", () => {
  it("maps paths to tabs and roots", () => {
    expect(tabIdFromPath("/")).toBe("tiers");
    expect(tabIdFromPath("/games")).toBe("catalog");
    expect(tabIdFromPath("/games/new")).toBe("catalog");
    expect(tabIdFromPath("/games/abc")).toBe("catalog");
    expect(tabIdFromPath("/settings")).toBe("settings");
    expect(TAB_ROOTS.tiers.pathname).toBe("/");
    expect(TAB_ROOTS.catalog.pathname).toBe("/games");
    expect(TAB_ROOTS.settings.pathname).toBe("/settings");
  });

  it("bootstraps stacks from location; deep game link lands on catalog stack", () => {
    const state = createInitialTabStacksState(entryFromPath("/games/game-1"));
    expect(state.activeTab).toBe("catalog");
    expect(stackTop(state, "catalog")).toEqual({ pathname: "/games/game-1" });
    expect(state.stacks.catalog.map((e) => e.pathname)).toEqual(["/games", "/games/game-1"]);
    expect(stackTop(state, "tiers")?.pathname).toBe("/");
    expect(stackTop(state, "settings")?.pathname).toBe("/settings");
  });

  it("pushes game onto source tab and activates that tab", () => {
    let state = createInitialTabStacksState(entryFromPath("/"));
    state = pushOntoTab(state, "tiers", entryFromPath("/games/game-1"));
    expect(state.activeTab).toBe("tiers");
    expect(locationHref(stackTop(state, "tiers")!)).toBe("/games/game-1");
    expect(state.stacks.catalog).toHaveLength(1);
  });

  it("activating another tab restores its top without wiping stacks", () => {
    let state = createInitialTabStacksState(entryFromPath("/games"));
    state = pushOntoTab(state, "catalog", entryFromPath("/games/game-1"));
    state = activateTab(state, "tiers");
    expect(state.activeTab).toBe("tiers");
    expect(locationHref(stackTop(state, "tiers")!)).toBe("/");
    expect(locationHref(stackTop(state, "catalog")!)).toBe("/games/game-1");
    state = activateTab(state, "catalog");
    expect(state.activeTab).toBe("catalog");
    expect(locationHref(stackTop(state, "catalog")!)).toBe("/games/game-1");
  });

  it("second tap on active tab resets that stack to root", () => {
    let state = createInitialTabStacksState(entryFromPath("/games"));
    state = pushOntoTab(state, "catalog", entryFromPath("/games/game-1"));
    state = popTabToRoot(state, "catalog");
    expect(state.activeTab).toBe("catalog");
    expect(state.stacks.catalog).toEqual([{ pathname: "/games" }]);
  });

  it("popActiveTab removes overlay; at root stays put", () => {
    let state = createInitialTabStacksState(entryFromPath("/games"));
    state = pushOntoTab(state, "catalog", entryFromPath("/games/game-1"));
    state = popActiveTab(state);
    expect(locationHref(stackTop(state, "catalog")!)).toBe("/games");
    const again = popActiveTab(state);
    expect(again).toEqual(state);
  });

  it("replaceActiveTop swaps new→game without growing stack", () => {
    let state = createInitialTabStacksState(entryFromPath("/games"));
    state = pushOntoTab(state, "catalog", entryFromPath("/games/new"));
    state = replaceActiveTop(state, entryFromPath("/games/game-1"));
    expect(state.stacks.catalog.map((e) => e.pathname)).toEqual(["/games", "/games/game-1"]);
  });

  it("syncFromLocation updates active stack from external URL", () => {
    let state = createInitialTabStacksState(entryFromPath("/"));
    state = syncFromLocation(state, entryFromPath("/settings"));
    expect(state.activeTab).toBe("settings");
    state = syncFromLocation(state, entryFromPath("/games/new"));
    expect(state.activeTab).toBe("catalog");
    expect(locationHref(stackTop(state, "catalog")!)).toBe("/games/new");
  });

  it("syncFromLocation keeps game URL on tiers when that tab is active", () => {
    let state = createInitialTabStacksState(entryFromPath("/"));
    state = syncFromLocation(state, entryFromPath("/games/game-1"));
    expect(state.activeTab).toBe("tiers");
    expect(state.stacks.tiers.map((e) => e.pathname)).toEqual(["/", "/games/game-1"]);
    expect(state.stacks.catalog).toHaveLength(1);
  });

  it("syncFromLocation switches to tab that already owns the location", () => {
    let state = createInitialTabStacksState(entryFromPath("/games"));
    state = pushOntoTab(state, "catalog", entryFromPath("/games/game-1"));
    state = activateTab(state, "tiers");
    state = syncFromLocation(state, entryFromPath("/games/game-1"));
    expect(state.activeTab).toBe("catalog");
    expect(locationHref(stackTop(state, "catalog")!)).toBe("/games/game-1");
  });

  it("maps pager index ↔ tab and progress", () => {
    expect(tabFromPagerIndex(0)).toBe("tiers");
    expect(tabFromPagerIndex(1)).toBe("catalog");
    expect(tabFromPagerIndex(2)).toBe("settings");
    expect(tabProgressFromTabId("tiers")).toBe(0);
    expect(tabProgressFromTabId("catalog")).toBe(1);
    expect(tabProgressFromTabId("settings")).toBe(2);
  });

  it("preserves catalog search on root entry", () => {
    const entry = entryFromPath("/games", "q=zelda&status=playing");
    const state = createInitialTabStacksState(entry);
    expect(stackTop(state, "catalog")).toEqual({ pathname: "/games", search: "q=zelda&status=playing" });
    expect(locationHref(stackTop(state, "catalog")!)).toBe("/games?q=zelda&status=playing");
  });

  it("activateTab is idempotent for active tab identity", () => {
    const state: TabStacksState = createInitialTabStacksState(entryFromPath("/games"));
    expect(activateTab(state, "catalog")).toBe(state);
  });
});
