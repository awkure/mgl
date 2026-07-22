import { test, expect } from "playwright/test";
import { expectPanelVisibleInViewport, openFilterMenu, openScreenFilter, openStatusFilter, waitForAppReady } from "./helpers/ui";

test.describe("filter dropdowns", () => {
  test("catalog status menu stays visible in the viewport", async ({ page }) => {
    await page.goto("/#/games", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    await openScreenFilter(page);
    const panel = await openStatusFilter(page);
    await expect(panel.getByRole("checkbox", { name: "Играю" })).toBeVisible();
    await expectPanelVisibleInViewport(page, panel);
  });

  test("tier status menu stays visible in the viewport", async ({ page }) => {
    await page.goto("/#/", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    await openScreenFilter(page);
    const panel = await openStatusFilter(page);
    await expect(panel.getByRole("checkbox", { name: "Играю" })).toBeVisible();
    await expectPanelVisibleInViewport(page, panel);
  });

  test("catalog platform menu stays in viewport", async ({ page }) => {
    await page.goto("/#/games", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    await openScreenFilter(page);
    const panel = await openFilterMenu(page, page.locator(".screen-filter-bar__sheet"), "Платформа");
    await expectPanelVisibleInViewport(page, panel);
    const box = await panel.boundingBox();
    const viewport = page.viewportSize();
    expect(box).toBeTruthy();
    expect(viewport).toBeTruthy();
    expect(box!.height).toBeLessThanOrEqual(viewport!.height + 1);
  });

  test("catalog tag menu stays in viewport", async ({ page }) => {
    await page.goto("/#/games", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    await openScreenFilter(page);
    const panel = await openFilterMenu(page, page.locator(".screen-filter-bar__sheet"), "Тег");
    await expectPanelVisibleInViewport(page, panel);
    const box = await panel.boundingBox();
    const viewport = page.viewportSize();
    expect(box).toBeTruthy();
    expect(viewport).toBeTruthy();
    expect(box!.height).toBeLessThanOrEqual(viewport!.height + 1);
  });

  test("tier tag menu stays in viewport", async ({ page }) => {
    await page.goto("/#/", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    await openScreenFilter(page);
    const panel = await openFilterMenu(page, page.locator(".screen-filter-bar__sheet"), "Тег");
    await expectPanelVisibleInViewport(page, panel);
    const box = await panel.boundingBox();
    const viewport = page.viewportSize();
    expect(box).toBeTruthy();
    expect(viewport).toBeTruthy();
    expect(box!.height).toBeLessThanOrEqual(viewport!.height + 1);
  });
});
