import { test, expect } from "playwright/test";
import { loadLibraryFixture } from "./helpers/data";
import {
  collapseScreenFilter,
  openFilterMenu,
  openScreenFilter,
  openStatusFilter,
  tapOutside,
  toggleFilterOption,
  waitForAppReady,
} from "./helpers/ui";

test.describe("screen filter bar", () => {
  test("catalog: query filters list and URL", async ({ page }) => {
    await page.goto("/#/games", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    const fixture = await loadLibraryFixture(page);
    const unique = fixture.uniqueTitleGame();

    const search = page.getByRole("searchbox", { name: "Фильтр игр на экране" });
    await search.fill(unique.title);

    await expect(page.locator(".game-card").filter({ hasText: unique.title }).first()).toBeVisible();
    await expect.poll(() => {
      const hash = page.url().split("#")[1] ?? "";
      const query = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
      return new URLSearchParams(query).get("q");
    }).toBe(unique.title.trim());
  });

  test("catalog: clear button restores list", async ({ page }) => {
    await page.goto("/#/games", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    const fixture = await loadLibraryFixture(page);

    const search = page.getByRole("searchbox", { name: "Фильтр игр на экране" });
    await search.fill(fixture.noMatchQuery());
    await expect(page.locator(".empty-state")).toContainText("Ничего не найдено");

    await page.getByRole("button", { name: "Очистить фильтр" }).click();
    await expect(search).toHaveValue("");
    await expect(page.locator(".game-card").first()).toBeVisible({ timeout: 60_000 });
    await expect.poll(() => {
      const hash = page.url().split("#")[1] ?? "";
      const query = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
      return new URLSearchParams(query).has("q");
    }).toBe(false);
  });

  test("catalog: status filter chips and chip remove", async ({ page }) => {
    await page.goto("/#/games", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);

    await openScreenFilter(page);
    const panel = await openStatusFilter(page);
    await toggleFilterOption(panel, "Играю");

    await expect(page.getByRole("button", { name: "Убрать фильтр: Играю" })).toBeVisible();
    await expect.poll(() => page.url()).toContain("status=playing");
    await expect(page.locator(".screen-filter-bar__reset")).toHaveText(/Сбросить · 1/);

    await collapseScreenFilter(page);
    await page.getByRole("button", { name: "Убрать фильтр: Играю" }).click();
    await expect(page.locator("section[aria-label=\"Активные фильтры\"]")).toHaveCount(0);
    await expect.poll(() => page.url()).not.toContain("status=playing");
  });

  test("catalog: deep link restores filters", async ({ page }) => {
    await page.goto("/#/games?status=playing", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);

    await expect(page.getByRole("button", { name: "Убрать фильтр: Играю" })).toBeVisible();
    await openScreenFilter(page);
    const statusSummary = page.locator(".screen-filter-bar__sheet details.filter-menu").filter({ hasText: "Статус" }).locator("summary");
    await expect(statusSummary.locator("b")).toHaveText("1");
  });

  test("catalog: multi-facet filter reset keeps query", async ({ page }) => {
    await page.goto("/#/games", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);

    const search = page.getByRole("searchbox", { name: "Фильтр игр на экране" });
    // Broad query so facet filters don't collapse the list into empty-state.
    await search.fill("Half");

    await openScreenFilter(page);
    const statusPanel = await openFilterMenu(page, page.locator(".screen-filter-bar__sheet"), "Статус");
    await toggleFilterOption(statusPanel, "Играю");
    await page.locator(".screen-filter-bar__sheet").click({ position: { x: 4, y: 4 } });

    const platformPanel = await openFilterMenu(page, page.locator(".screen-filter-bar__sheet"), "Платформа");
    const firstPlatform = platformPanel.locator("label").first();
    await expect(firstPlatform).toBeVisible();
    await firstPlatform.click();

    await expect(page.locator("section[aria-label=\"Активные фильтры\"] .catalog-active-filters__chips button")).toHaveCount(2);
    await expect(search).toHaveValue("Half");
    await collapseScreenFilter(page);
    await expect(search).toHaveValue("Half");
    await page.locator(".catalog-active-filters__reset").click();
    await expect(page.locator("section[aria-label=\"Активные фильтры\"]")).toHaveCount(0);
    await expect(search).toHaveValue("Half");
  });

  test("tier: query filters board without changing URL", async ({ page }) => {
    await page.goto("/#/tiers", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    const fixture = await loadLibraryFixture(page);

    const before = await page.locator(".tier-row .game-card").count();
    expect(before).toBeGreaterThan(0);

    const search = page.getByRole("searchbox", { name: "Фильтр игр на экране" });
    await search.fill(fixture.noMatchQuery());
    await expect(page.locator(".tier-row .game-card")).toHaveCount(0);
    // Filtered-empty tier board uses page empty-state (not per-row placeholders)
    await expect(page.locator(".empty-state")).toContainText("Ничего не найдено");
    expect(page.url()).toMatch(/#\/tiers\/?$/);

    await page.getByRole("button", { name: "Очистить фильтр" }).click();
    await expect(page.locator(".tier-row .game-card").first()).toBeVisible();
    const after = await page.locator(".tier-row .game-card").count();
    expect(after).toBeGreaterThan(0);
  });

  test("sheet collapses on Escape and outside click", async ({ page }) => {
    await page.goto("/#/games", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);

    const search = page.getByRole("searchbox", { name: "Фильтр игр на экране" });
    const sheet = page.getByRole("dialog", { name: "Параметры фильтра" });

    await openScreenFilter(page);
    await search.press("Escape");
    await expect(sheet).toHaveCount(0);

    await openScreenFilter(page);
    await tapOutside(page);
    await expect(sheet).toHaveCount(0);
  });
});
