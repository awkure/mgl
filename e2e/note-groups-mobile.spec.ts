import { test, expect } from "playwright/test";
import { mobileOnly, waitForAppReady } from "./helpers/ui";

/** Serious Sam 4 — two note groups in published library. */
const MULTI_GROUP_GAME = "/#/games/67c0abf5-9367-45ea-953c-e6c7b5b3102a";

test.describe("note groups on small screens", () => {
  test.beforeEach(() => {
    mobileOnly();
  });

  test("keeps note groups stacked without overlap and shelves single-column", async ({ page }) => {
    await page.goto(MULTI_GROUP_GAME, { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);

    await expect(page.locator(".game-view-page")).toBeVisible();
    await expect(page.locator(".note-group")).toHaveCount(2);

    const metrics = await page.evaluate(() => {
      const groups = [...document.querySelectorAll<HTMLElement>(".note-group")].map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          label: el.getAttribute("aria-label") ?? "",
          top: rect.top,
          bottom: rect.bottom,
          height: rect.height,
          width: rect.width,
        };
      });

      const groupOverlaps: Array<{ a: string; b: string; overlap: number }> = [];
      for (let i = 0; i < groups.length; i += 1) {
        for (let j = i + 1; j < groups.length; j += 1) {
          const a = groups[i]!;
          const b = groups[j]!;
          const overlap = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
          if (overlap > 1) groupOverlaps.push({ a: a.label, b: b.label, overlap });
        }
      }

      const shelves = [...document.querySelectorAll<HTMLElement>(".notes-list")].map((list) => {
        const template = getComputedStyle(list).gridTemplateColumns.trim();
        const trackCount = template === "none" || template === "" ? 0 : template.split(/\s+/).length;
        const cards = [...list.children].map((child) => {
          const el = child as HTMLElement;
          return {
            column: el.style.gridColumnStart || "auto",
            shelf: el.dataset.shelfPosition ?? "",
          };
        });
        return { trackCount, template, cards, width: list.getBoundingClientRect().width };
      });

      return {
        viewportWidth: window.innerWidth,
        groups,
        groupOverlaps,
        shelves,
      };
    });

    expect(metrics.viewportWidth).toBeLessThanOrEqual(500);
    expect(metrics.groups.length).toBeGreaterThanOrEqual(2);
    expect(metrics.groupOverlaps, `groups overlap: ${JSON.stringify(metrics.groupOverlaps)}`).toEqual([]);

    for (const group of metrics.groups) {
      expect(group.height, group.label).toBeGreaterThan(20);
      expect(group.width, group.label).toBeGreaterThan(100);
    }

    // Each successive group must start below the previous (stacked, not layered).
    for (let i = 1; i < metrics.groups.length; i += 1) {
      expect(metrics.groups[i]!.top).toBeGreaterThanOrEqual(metrics.groups[i - 1]!.bottom - 1);
    }

    for (const shelf of metrics.shelves) {
      expect(shelf.trackCount, `template=${shelf.template}`).toBe(1);
      for (const card of shelf.cards) {
        expect(card.column === "auto" || card.column === "1").toBe(true);
      }
    }
  });

  test("keeps add-note label clear of always-visible card actions", async ({ page }) => {
    await page.goto(MULTI_GROUP_GAME, { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);

    await expect(page.getByRole("button", { name: /Добавить заметку в группу/ }).first()).toBeVisible();

    const covered = await page.evaluate(() => {
      const hits: Array<{ group: string; overlapY: number; addTop: number; actionsBottom: number }> = [];
      for (const group of document.querySelectorAll<HTMLElement>(".note-group")) {
        const add = group.querySelector<HTMLElement>(".note-group-add-button");
        const cards = group.querySelectorAll<HTMLElement>(".note-card:not(.note-card--editing)");
        const last = cards[cards.length - 1];
        const actions = last?.querySelector<HTMLElement>(".note-card__actions");
        if (!add || !actions) continue;
        const addRect = add.getBoundingClientRect();
        const actionsRect = actions.getBoundingClientRect();
        const overlapY = Math.max(0, Math.min(addRect.bottom, actionsRect.bottom) - Math.max(addRect.top, actionsRect.top));
        const overlapX = Math.max(0, Math.min(addRect.right, actionsRect.right) - Math.max(addRect.left, actionsRect.left));
        if (overlapY > 1 && overlapX > 1) {
          hits.push({
            group: group.getAttribute("aria-label") ?? "",
            overlapY,
            addTop: addRect.top,
            actionsBottom: actionsRect.bottom,
          });
        }
      }
      return hits;
    });

    expect(covered, `add labels covered by card actions: ${JSON.stringify(covered)}`).toEqual([]);
  });
});
