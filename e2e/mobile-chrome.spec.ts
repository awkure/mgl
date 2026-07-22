import { test, expect } from "playwright/test";
import { mobileOnly, waitForAppReady } from "./helpers/ui";

test.describe("mobile chrome", () => {
  test.beforeEach(() => {
    mobileOnly();
  });

  test("shows tab bar chrome, hides desktop nav", async ({ page }) => {
    await page.goto("/#/", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);

    await expect(page.locator(".app-shell[data-mobile-chrome=\"true\"]")).toBeVisible();
    const tabBar = page.getByRole("navigation", { name: "Мобильная навигация" });
    await expect(tabBar).toBeVisible();
    await expect(tabBar.getByRole("link")).toHaveCount(3);
    await expect(page.locator(".app-nav--desktop")).toHaveCount(0);
    await expect(page.locator(".app-tab-add")).toBeVisible();
    await expect(page.getByRole("link", { name: "Добавить игру" })).toBeVisible();
  });

  test("tab navigation updates aria-current", async ({ page }) => {
    await page.goto("/#/", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);

    const tabBar = page.getByRole("navigation", { name: "Мобильная навигация" });
    await tabBar.getByRole("link", { name: "Каталог" }).click();
    await expect(tabBar.getByRole("link", { name: "Каталог" })).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".catalog-list, .empty-state").first()).toBeVisible();

    await tabBar.getByRole("link", { name: "Настройки" }).click();
    await expect(tabBar.getByRole("link", { name: "Настройки" })).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".settings-page")).toBeVisible();

    await tabBar.getByRole("link", { name: "Тирлист" }).click();
    await expect(tabBar.getByRole("link", { name: "Тирлист" })).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".tier-board")).toBeVisible();
  });

  test("filter bar visible at tab roots, hidden on game page", async ({ page }) => {
    await page.goto("/#/", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    await expect(page.getByRole("searchbox", { name: "Фильтр игр на экране" })).toBeVisible();

    await page.goto("/#/games", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    await expect(page.getByRole("searchbox", { name: "Фильтр игр на экране" })).toBeVisible();

    const firstCard = page.locator(".catalog-list .game-card a").first();
    await expect(firstCard).toBeVisible({ timeout: 60_000 });
    await firstCard.click();
    await expect(page).toHaveURL(/#\/games\/[^/?]+/);
    await expect(page.locator(".game-view-page")).toBeVisible();
    await expect(page.getByRole("searchbox", { name: "Фильтр игр на экране" })).toHaveCount(0);
  });

  test("tab bar and add button meet 44px touch targets", async ({ page }) => {
    await page.goto("/#/", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);

    const links = page.locator(".app-tab-bar__link");
    const count = await links.count();
    expect(count).toBe(3);
    for (let i = 0; i < count; i += 1) {
      const box = await links.nth(i).boundingBox();
      expect(box, `tab link ${i} box`).toBeTruthy();
      expect(box!.height, `tab link ${i} height`).toBeGreaterThanOrEqual(44);
      expect(box!.width, `tab link ${i} width`).toBeGreaterThanOrEqual(44);
    }

    const addBox = await page.locator(".app-tab-add").boundingBox();
    expect(addBox).toBeTruthy();
    expect(addBox!.height).toBeGreaterThanOrEqual(44);
    expect(addBox!.width).toBeGreaterThanOrEqual(44);
  });

  test("opens a game from catalog", async ({ page }) => {
    await page.goto("/#/games", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);

    const firstCard = page.locator(".catalog-list .game-card a").first();
    await expect(firstCard).toBeVisible({ timeout: 60_000 });
    await firstCard.click();

    await expect(page).toHaveURL(/#\/games\/[^/?]+/);
    await expect(page.locator(".game-view-page")).toBeVisible();
  });

  test("add button opens new-game form", async ({ page }) => {
    await page.goto("/#/", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);

    await page.locator(".app-tab-add").click();
    await expect(page).toHaveURL(/#\/games\/new/);
    await expect(page.getByRole("form", { name: "Новая игра" })).toBeVisible();
    await expect(page.locator(".game-form")).toBeVisible();
  });
});
