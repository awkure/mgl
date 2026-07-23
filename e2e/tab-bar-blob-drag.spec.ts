import { test, expect } from "playwright/test";
import { mobileOnly, waitForAppReady } from "./helpers/ui";

test.describe("tab bar blob drag", () => {
  test.beforeEach(() => {
    mobileOnly();
  });

  test("blob --press-tab tracks finger across tab bar while held", async ({ page }) => {
    await page.goto("/#/tiers", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);

    const tabBar = page.getByRole("navigation", { name: "Мобильная навигация" });
    await expect(tabBar).toBeVisible();
    const box = await tabBar.boundingBox();
    expect(box).toBeTruthy();

    const samples = await page.evaluate(async ({ left, width, top, height }) => {
      const bar = document.querySelector(".app-tab-bar");
      const shell = document.querySelector(".app-shell");
      const startLink = bar?.querySelector(".app-tab-bar__link") as HTMLElement | null;
      if (!(bar instanceof HTMLElement) || !(shell instanceof HTMLElement) || !startLink) {
        throw new Error("tab bar chrome missing");
      }

      const y = top + height / 2;
      const fromX = left + width * 0.125;
      const toX = left + width * 0.875;
      const steps = 12;

      const pressTab = () => Number(getComputedStyle(shell).getPropertyValue("--press-tab").trim() || "0");

      startLink.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId: 1,
        pointerType: "touch",
        isPrimary: true,
        button: 0,
        buttons: 1,
        clientX: fromX,
        clientY: y,
      }));

      const out: Array<{ expected: number; actual: number }> = [];
      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        const x = fromX + (toX - fromX) * t;
        startLink.dispatchEvent(new PointerEvent("pointermove", {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: 1,
          pointerType: "touch",
          isPrimary: true,
          button: 0,
          buttons: 1,
          clientX: x,
          clientY: y,
        }));
        // Finger progress uses same mapping as production: ratio * 4 - 0.5
        const expected = Math.max(0, Math.min(3, ((x - left) / width) * 4 - 0.5));
        out.push({ expected, actual: pressTab() });
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }

      startLink.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId: 1,
        pointerType: "touch",
        isPrimary: true,
        button: 0,
        buttons: 0,
        clientX: toX,
        clientY: y,
      }));

      return out;
    }, { left: box!.x, width: box!.width, top: box!.y, height: box!.height });

    expect(samples.length).toBeGreaterThan(5);
    for (const sample of samples) {
      expect(Math.abs(sample.actual - sample.expected), `press-tab ${sample.actual} vs ${sample.expected}`).toBeLessThan(0.08);
    }
    // Must travel meaningfully — not stuck at start tab.
    const first = samples[0]!.actual;
    const last = samples[samples.length - 1]!.actual;
    expect(last - first).toBeGreaterThan(2);
  });
});
