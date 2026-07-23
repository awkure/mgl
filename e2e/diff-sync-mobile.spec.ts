import { test, expect } from "playwright/test";
import { expectPanelVisibleInViewport, mobileOnly, waitForAppReady } from "./helpers/ui";

test.describe("diff sync mobile", () => {
  test.beforeEach(() => {
    mobileOnly();
  });

  test("Синхронизировать stays inside viewport under safe-area and opens panel", async ({ page }) => {
    await page.goto("/#/", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);

    await page.getByRole("button", { name: /Локальные правки/ }).click();
    const dialog = page.getByRole("dialog", { name: "Локальные правки" });
    await expect(dialog).toBeVisible();

    // Chromium reports env(safe-area-inset-top)=0; force a notch via the production token.
    await dialog.evaluate((node) => {
      (node as HTMLElement).style.setProperty("--diff-safe-top", "47px");
    });

    const sync = dialog.locator(".diff-sync-button");
    await expect(sync).toBeVisible();
    await expectPanelVisibleInViewport(page, sync);

    const metrics = await sync.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
    });
    expect(metrics.top, "sync below simulated status bar").toBeGreaterThanOrEqual(47);
    expect(metrics.left).toBeGreaterThanOrEqual(0);
    expect(metrics.right).toBeLessThanOrEqual(390);

    await sync.click();
    await expect(dialog.getByRole("region", { name: "Синхронизация с GitHub" })).toBeVisible();
  });
});
