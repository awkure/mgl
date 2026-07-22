import { test, expect } from "playwright/test";
import { formatHistoryDelta, loadHistoryFixture } from "./helpers/history";
import { waitForAppReady } from "./helpers/ui";

test.describe("library history", () => {
  test("shows published events from history.json", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop-chromium", "desktop smoke only");

    await page.goto("/#/", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);

    const fixture = await loadHistoryFixture(page);
    expect(fixture.events.length, "history.json must contain events").toBeGreaterThan(0);
    const newest = fixture.newest();
    const expectedDelta = formatHistoryDelta(newest);

    await page.getByRole("navigation", { name: "Основная навигация" }).getByRole("link", { name: "История" }).click();
    await expect(page).toHaveURL(/#\/history$/);
    await expect(page.locator(".history-page")).toBeVisible();
    await expect(page.getByRole("heading", { name: "История", level: 1 })).toBeVisible();

    const firstNode = page.locator(".history-timeline__node").first();
    await expect(firstNode).toBeVisible({ timeout: 60_000 });
    await expect(firstNode.locator(".history-timeline__title")).toHaveText(newest.title);
    await expect(firstNode.locator(".history-timeline__delta").filter({ hasText: expectedDelta })).toBeVisible();

    const gameLink = firstNode.locator("a.history-timeline__link");
    await expect(gameLink).toHaveAttribute("href", `#/games/${newest.gameId}`);
    await gameLink.click();
    await expect(page).toHaveURL(new RegExp(`#/games/${newest.gameId}`));
    await expect(page.locator(".game-view-page")).toBeVisible();
  });
});
