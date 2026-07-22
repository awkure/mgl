export type RectLike = { top: number; left: number; bottom: number; right: number; width: number; height: number };

export function placeFilterMenuPanel(
  trigger: RectLike,
  panel: { width: number; height: number },
  viewport: { width: number; height: number },
  gap = 4,
): { top: number; left: number; minWidth: number } {
  const margin = 8;
  const minWidth = Math.max(210, trigger.width);
  const width = Math.max(panel.width, minWidth);
  const height = Math.max(panel.height, 1);

  let top = trigger.bottom + gap;
  if (top + height > viewport.height - margin && trigger.top - gap - height >= margin) {
    top = trigger.top - gap - height;
  }

  let left = trigger.left;
  left = Math.min(left, viewport.width - width - margin);
  left = Math.max(margin, left);
  top = Math.max(margin, Math.min(top, viewport.height - height - margin));

  return { top, left, minWidth };
}
