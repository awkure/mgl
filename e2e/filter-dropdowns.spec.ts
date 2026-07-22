import { test, expect } from "playwright/test";
import { expectPanelVisibleInViewport, openScreenFilter, openStatusFilter, waitForAppReady } from "./helpers/ui";

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
});
