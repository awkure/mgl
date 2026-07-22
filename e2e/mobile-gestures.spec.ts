import { test, expect } from "playwright/test";
import { swipeLeft, swipeRight } from "./helpers/gestures";
import { mobileOnly, waitForAppReady } from "./helpers/ui";

test.describe("mobile gestures", () => {
  // Pull-to-refresh skipped: scroll-position-gated and timing-sensitive (low value vs flake risk).

  test.beforeEach(() => {
    mobileOnly();
  });

  test("swipe pager switches tiers ↔ catalog", async ({ page }) => {
    await page.goto("/#/", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);

    const tabBar = page.getByRole("navigation", { name: "Мобильная навигация" });
    await expect(tabBar.getByRole("link", { name: "Тирлист" })).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".swipe-pager")).toBeVisible();

    await swipeLeft(page);
    await expect
      .poll(async () => tabBar.getByRole("link", { name: "Каталог" }).getAttribute("aria-current"), {
        timeout: 5_000,
      })
      .toBe("page");
    await expect(page.locator(".catalog-list, .empty-state").first()).toBeVisible();

    await swipeRight(page);
    await expect
      .poll(async () => tabBar.getByRole("link", { name: "Тирлист" }).getAttribute("aria-current"), {
        timeout: 5_000,
      })
      .toBe("page");
    await expect(page.locator(".tier-board")).toBeVisible();
  });
});
