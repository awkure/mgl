import { expect, test, type Locator, type Page } from "playwright/test";

export async function waitForAppReady(page: Page): Promise<void> {
  await page.waitForSelector(".app-shell", { state: "visible", timeout: 60_000 });
  await expect(page.locator(".boot-screen")).toHaveCount(0, { timeout: 60_000 });
}

export function mobileOnly(): void {
  test.skip(test.info().project.name !== "mobile-chromium", "mobile chrome only");
}

export async function openScreenFilter(page: Page): Promise<void> {
  const search = page.getByRole("searchbox", { name: "Фильтр игр на экране" });
  await expect(search).toBeVisible();
  await search.click();
  await expect(page.getByRole("dialog", { name: "Параметры фильтра" })).toBeVisible();
}

export async function openGlobalSearch(page: Page): Promise<void> {
  // On narrow mobile the input is display:none until .is-open — click the field chrome.
  await page.locator(".global-game-search__field").click();
  await expect(page.locator(".global-game-search.is-open")).toBeVisible();
  await expect(page.locator(".global-game-search__popover")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Глобальный поиск игр" })).toBeVisible();
}

export async function collapseScreenFilter(page: Page): Promise<void> {
  const sheet = page.getByRole("dialog", { name: "Параметры фильтра" });
  if (await sheet.count() === 0) return;
  // Escape on type=search clears the value in Chromium — blur + outside pointer instead.
  await page.evaluate(() => {
    document.querySelectorAll("details.filter-menu[open]").forEach((node) => {
      (node as HTMLDetailsElement).open = false;
    });
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Фильтр игр на экране"]');
    input?.blur();
  });
  await page.locator("#main-content").dispatchEvent("pointerdown");
  await expect(sheet).toHaveCount(0);
}

export async function openFilterMenu(page: Page, scope: Locator, label: string): Promise<Locator> {
  const summary = scope.locator("details.filter-menu").filter({ hasText: label }).locator("summary");
  await summary.click();
  const panel = page.locator("[data-filter-menu-portal]");
  await expect(panel).toBeVisible();
  return panel;
}

/** Click the option label — the checkbox input is covered by the check SVG. */
export async function toggleFilterOption(panel: Locator, name: string): Promise<void> {
  await panel.locator("label").filter({ hasText: name }).click();
}

export async function openStatusFilter(page: Page): Promise<Locator> {
  return openFilterMenu(page, page.locator(".screen-filter-bar__sheet"), "Статус");
}

export async function tapOutside(page: Page): Promise<void> {
  const main = page.locator(".app-main");
  const box = await main.boundingBox();
  if (!box) throw new Error(".app-main has no bounding box");
  await main.click({
    position: { x: 10, y: Math.max(10, Math.floor(box.height - 40)) },
    force: true,
  });
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
