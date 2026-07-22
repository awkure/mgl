import { expect, type Locator, type Page } from "playwright/test";

export async function waitForAppReady(page: Page): Promise<void> {
  await page.waitForSelector(".app-shell", { state: "visible", timeout: 60_000 });
  await expect(page.locator(".boot-screen")).toHaveCount(0, { timeout: 60_000 });
}

export async function openScreenFilter(page: Page): Promise<void> {
  const search = page.getByRole("searchbox", { name: "Фильтр игр на экране" });
  await expect(search).toBeVisible();
  await search.click();
  await expect(page.getByRole("dialog", { name: "Параметры фильтра" })).toBeVisible();
}

export async function openStatusFilter(page: Page): Promise<Locator> {
  const summary = page.locator("details.filter-menu").filter({ hasText: "Статус" }).locator("summary");
  await summary.click();
  const panel = page.locator("[data-filter-menu-portal]");
  await expect(panel).toBeVisible();
  return panel;
}

/** Panel must paint inside the viewport (not clipped to 0-size / off-screen). */
export async function expectPanelVisibleInViewport(page: Page, panel: Locator): Promise<void> {
  const metrics = await panel.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const overlapW = Math.max(0, Math.min(rect.right, vw) - Math.max(rect.left, 0));
    const overlapH = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
    return {
      width: rect.width,
      height: rect.height,
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      overlapArea: overlapW * overlapH,
      viewportWidth: vw,
      viewportHeight: vh,
    };
  });

  expect(metrics.width, "panel width").toBeGreaterThan(8);
  expect(metrics.height, "panel height").toBeGreaterThan(8);
  expect(metrics.overlapArea, "panel∩viewport area").toBeGreaterThan(64);
  expect(metrics.top, "panel top").toBeGreaterThanOrEqual(-1);
  expect(metrics.bottom, "panel bottom").toBeLessThanOrEqual(metrics.viewportHeight + 1);
}
