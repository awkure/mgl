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

  test("keeps add-note label clear under a two-column shelf", async ({ page }) => {
    // Two 360px note columns + gap need ~728px; stay in mobile project (coarse actions).
    await page.setViewportSize({ width: 820, height: 800 });
    await page.goto("/#/games/new", { waitUntil: "domcontentloaded" });
    await waitForAppReady(page);

    await page.getByRole("button", { name: "Добавить заметку в новую группу" }).click();
    await page.getByRole("button", { name: "Добавить заметку в группу 1" }).click();

    const editors = page.locator(".note-editors-grid textarea");
    await expect(editors).toHaveCount(2);
    await editors.nth(0).fill("Первый фпс в который приходилось играть и до сих пор остаётся одним из лучших из классики");
    await editors.nth(1).fill("ttt");
    await expect(editors.nth(0)).toHaveValue(/Первый фпс/);
    await expect.poll(async () => {
      return page.locator(".note-editors-grid").evaluate((grid) => {
        const template = getComputedStyle(grid).gridTemplateColumns.trim();
        return template === "none" || template === "" ? 0 : template.split(/\s+/).length;
      });
    }).toBeGreaterThanOrEqual(2);

    const metrics = await page.evaluate(() => {
      const group = document.querySelector<HTMLElement>(".note-group");
      const grid = group?.querySelector<HTMLElement>(".note-editors-grid");
      const add = group?.querySelector<HTMLElement>(".note-group-add-button");
      if (!group || !grid || !add) return { error: "missing nodes" as const };

      const template = getComputedStyle(grid).gridTemplateColumns.trim();
      const trackCount = template === "none" || template === "" ? 0 : template.split(/\s+/).length;
      const addRect = add.getBoundingClientRect();
      const gridRect = grid.getBoundingClientRect();
      const cardRects = [...grid.children].map((child) => (child as HTMLElement).getBoundingClientRect());
      const overlaps = cardRects
        .map((card, index) => {
          const oy = Math.max(0, Math.min(addRect.bottom, card.bottom) - Math.max(addRect.top, card.top));
          const ox = Math.max(0, Math.min(addRect.right, card.right) - Math.max(addRect.left, card.left));
          return { index, oy, ox };
        })
        .filter((hit) => hit.oy > 1 && hit.ox > 1);

      return {
        trackCount,
        paddingBottom: getComputedStyle(grid).paddingBottom,
        addTop: addRect.top,
        gridBottom: gridRect.bottom,
        overlaps,
      };
    });

    expect(metrics).not.toHaveProperty("error");
    if ("error" in metrics) return;

    expect(metrics.trackCount).toBeGreaterThanOrEqual(2);
    expect(Number.parseFloat(metrics.paddingBottom)).toBeGreaterThanOrEqual(29);
    expect(metrics.addTop).toBeGreaterThanOrEqual(metrics.gridBottom - 1);
    expect(metrics.overlaps, `add under cards: ${JSON.stringify(metrics.overlaps)}`).toEqual([]);
  });
});
