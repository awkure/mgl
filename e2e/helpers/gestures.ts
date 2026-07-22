import type { Page } from "playwright/test";

export async function touchSwipe(
  page: Page,
  selector: string,
  opts: { from: { x: number; y: number }; to: { x: number; y: number }; steps?: number },
): Promise<void> {
  const steps = opts.steps ?? 8;
  await page.evaluate(async ({ selector: sel, from, to, stepCount }) => {
    const el = document.querySelector(sel);
    if (!(el instanceof HTMLElement)) throw new Error(`No element for ${sel}`);

    const makeTouch = (x: number, y: number) => new Touch({
      identifier: 1,
      target: el,
      clientX: x,
      clientY: y,
      pageX: x,
      pageY: y,
      screenX: x,
      screenY: y,
    });

    const dispatch = (type: string, touch: Touch, touches: Touch[]) => {
      el.dispatchEvent(new TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        touches,
        targetTouches: touches,
        changedTouches: [touch],
      }));
    };

    const start = makeTouch(from.x, from.y);
    dispatch("touchstart", start, [start]);

    for (let i = 1; i <= stepCount; i += 1) {
      const t = i / stepCount;
      const x = from.x + (to.x - from.x) * t;
      const y = from.y + (to.y - from.y) * t;
      const move = makeTouch(x, y);
      dispatch("touchmove", move, [move]);
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    }

    const end = makeTouch(to.x, to.y);
    dispatch("touchend", end, []);
  }, { selector, from: opts.from, to: opts.to, stepCount: steps });
}

/** Finger moves left → pager advances (tiers → catalog). */
export async function swipeLeft(page: Page): Promise<void> {
  const viewport = page.viewportSize() ?? { width: 390, height: 844 };
  const y = Math.floor(viewport.height * 0.45);
  await touchSwipe(page, ".swipe-pager", {
    from: { x: Math.floor(viewport.width * 0.85), y },
    to: { x: Math.floor(viewport.width * 0.15), y },
    steps: 12,
  });
}

/** Finger moves right → pager goes back (catalog → tiers). */
export async function swipeRight(page: Page): Promise<void> {
  const viewport = page.viewportSize() ?? { width: 390, height: 844 };
  const y = Math.floor(viewport.height * 0.45);
  await touchSwipe(page, ".swipe-pager", {
    from: { x: Math.floor(viewport.width * 0.15), y },
    to: { x: Math.floor(viewport.width * 0.85), y },
    steps: 12,
  });
}
