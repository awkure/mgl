import { test, expect } from "playwright/test";
import { waitForAppReady } from "./helpers/ui";

test.describe("smoke navigation", () => {
  test("opens catalog and a game page", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop-chromium", "desktop smoke only");

    await page.goto("/#/", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    await expect(page.locator(".tier-board")).toBeVisible();

    await page.goto("/#/games", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    const firstCard = page.locator(".catalog-list .game-card--list a").first();
    await expect(firstCard).toBeVisible({ timeout: 60_000 });
    const href = await firstCard.getAttribute("href");
    expect(href).toMatch(/^#\/games\//);

    await firstCard.click();
    await expect(page).toHaveURL(/#\/games\/[^/?]+/);
    await expect(page.locator(".game-view-page")).toBeVisible();
  });
});
