import type { TabId } from "../state/tabStacks";

const PRESS_TABS: TabId[] = ["tiers", "catalog", "history", "settings"];

/** Map finger X across the tab bar to continuous blob progress (0 = first tab center … n-1 = last). */
export function pressProgressFromClientX(
  clientX: number,
  barLeft: number,
  barWidth: number,
  tabCount = PRESS_TABS.length,
): number {
  if (!(barWidth > 0) || !(tabCount > 0)) return 0;
  const progress = ((clientX - barLeft) / barWidth) * tabCount - 0.5;
  return Math.max(0, Math.min(tabCount - 1, progress));
}

export function nearestTabFromPressProgress(progress: number): TabId {
  const index = Math.max(0, Math.min(PRESS_TABS.length - 1, Math.round(progress)));
  return PRESS_TABS[index]!;
}
