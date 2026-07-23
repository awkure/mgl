export function pagerPanelNear(panelIndex: number, activeIndex: number): boolean {
  return Math.abs(panelIndex - activeIndex) <= 1;
}

export function pagerPanelSlots(
  near: boolean,
  hasOverlay: boolean,
): { root: boolean; overlay: boolean } {
  if (!near) return { root: false, overlay: false };
  if (hasOverlay) return { root: false, overlay: true };
  return { root: true, overlay: false };
}
