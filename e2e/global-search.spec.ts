import { test, expect } from "playwright/test";
import { loadLibraryFixture } from "./helpers/data";
import {
  expectPanelVisibleInViewport,
  mobileOnly,
  openFilterMenu,
  openGlobalSearch,
  toggleFilterOption,
  waitForAppReady,
} from "./helpers/ui";

const STATUS_LABELS: Record<string, string> = {
  wishlist: "Хочу поиграть",
  playing: "Играю",
  played: "Играл",
  completed: "Пройдено",
  platinum: "Платина",
  dropped: "Брошено",
};

test.describe("global game search", () => {
  test("search result opens game page", async ({ page }) => {
    await page.goto("/#/", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    const fixture = await loadLibraryFixture(page);
    const unique = fixture.uniqueTitleGame();

    await openGlobalSearch(page);
    await page.getByRole("combobox", { name: "Глобальный поиск игр" }).fill(unique.title);

    const results = page.getByRole("listbox", { name: "Результаты поиска" });
    const option = results.getByRole("option").filter({ hasText: unique.title }).first();
    await expect(option).toBeVisible();
    await option.click();

    await expect(page).toHaveURL(/#\/games\/[^/?]+/);
    await expect(page.locator(".game-view-page")).toBeVisible();
  });

  test("show-all navigates to catalog with query", async ({ page }) => {
    await page.goto("/#/", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    const fixture = await loadLibraryFixture(page);
    const query = fixture.games[0].title.slice(0, 3);
    expect(query.length).toBeGreaterThanOrEqual(1);

    await openGlobalSearch(page);
    await page.getByRole("combobox", { name: "Глобальный поиск игр" }).fill(query);

    const showAll = page.getByRole("button", { name: /Показать все результаты/ });
    await expect(showAll).toBeVisible();
    await showAll.click();

    await expect.poll(() => page.url()).toMatch(/#\/games\?/);
    await expect.poll(() => {
      const hash = page.url().split("#")[1] ?? "";
      const qs = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
      return new URLSearchParams(qs).get("q");
    }).toBe(query.trim());
    await expect(page.locator(".catalog-list")).toBeVisible();
  });

  test("status filter count matches library", async ({ page }) => {
    await page.goto("/#/", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    const fixture = await loadLibraryFixture(page);

    let statusId = "playing";
    let count = fixture.countByStatus(statusId);
    if (count === 0) {
      statusId = fixture.statusWithGames();
      count = fixture.countByStatus(statusId);
    }
    const label = STATUS_LABELS[statusId];
    expect(label).toBeTruthy();
    expect(count).toBeGreaterThan(0);

    await openGlobalSearch(page);
    const filters = page.locator(".global-game-search__filters");
    const panel = await openFilterMenu(page, filters, "Статус");
    await toggleFilterOption(panel, label);

    await expect(page.locator(".global-game-search__chips")).toContainText(label);
    await expect(page.getByRole("button", { name: `Показать все результаты · ${count}` })).toBeVisible();
  });

  test("enter opens selected or unique match", async ({ page }) => {
    await page.goto("/#/", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    const fixture = await loadLibraryFixture(page);
    const unique = fixture.uniqueTitleGame();

    await openGlobalSearch(page);
    const input = page.getByRole("combobox", { name: "Глобальный поиск игр" });
    await input.fill(unique.title);

    const showAll = page.getByRole("button", { name: /Показать все результаты · (\d+)/ });
    await expect(showAll).toBeVisible();
    const text = await showAll.innerText();
    const match = text.match(/·\s*(\d+)/);
    const n = match ? Number(match[1]) : 0;
    expect(n).toBeGreaterThan(0);

    if (n === 1) {
      await input.press("Enter");
    } else {
      await input.press("ArrowDown");
      await input.press("Enter");
    }

    await expect(page).toHaveURL(/#\/games\/[^/?]+/);
    await expect(page.locator(".game-view-page")).toBeVisible();
  });

  test("no results shows empty state", async ({ page }) => {
    await page.goto("/#/", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    const fixture = await loadLibraryFixture(page);

    await openGlobalSearch(page);
    await page.getByRole("combobox", { name: "Глобальный поиск игр" }).fill(fixture.noMatchQuery());

    await expect(page.getByRole("listbox", { name: "Результаты поиска" })).toContainText("Ничего не найдено");
    await expect(page.getByRole("button", { name: "Открыть каталог" })).toBeVisible();
  });

  test("mobile: open search is fixed full-width overlay", async ({ page }) => {
    mobileOnly();
    await page.goto("/#/", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);

    await openGlobalSearch(page);
    const root = page.locator(".global-game-search.is-open");
    await expect(root).toBeVisible();

    const metrics = await root.evaluate((el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return { position: style.position, width: rect.width, viewportWidth: window.innerWidth };
    });
    expect(metrics.position).toBe("fixed");
    expect(metrics.width).toBeGreaterThanOrEqual(metrics.viewportWidth - 1);

    await expect(page.getByRole("button", { name: "Закрыть поиск" })).toBeVisible();
    await page.getByRole("button", { name: "Закрыть поиск" }).click();
    await expect(page.locator(".global-game-search__popover")).toHaveCount(0);
  });

  test("mobile: platform filter menu stays in viewport", async ({ page }) => {
    mobileOnly();
    await page.goto("/#/", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);

    await openGlobalSearch(page);
    const panel = await openFilterMenu(page, page.locator(".global-game-search__filters"), "Платформа");
    await expectPanelVisibleInViewport(page, panel);
  });
});
