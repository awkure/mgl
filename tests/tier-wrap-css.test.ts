import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

function declarations(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(styles)?.[1] ?? "";
}

describe("tier list wrapping layout", () => {
  it("wraps each tier and scrolls only the full board vertically", () => {
    const board = declarations(".tier-board");
    const page = declarations(".tier-page");
    const tier = declarations(".tier-row__games");
    const card = declarations(".tier-page .game-card--tier");

    expect(tier).toContain("flex-wrap: wrap");
    expect(tier).toContain("gap: 0");
    expect(tier).toContain("padding: 0");
    expect(tier).not.toContain("overflow-x: auto");
    expect(board).toContain("overflow-x: hidden");
    expect(board).toContain("overflow-y: auto");
    expect(card).toContain("width: var(--tier-card-size)");
    expect(card).toContain("height: var(--tier-card-size)");
    expect(card).toContain("align-self: flex-start");
    expect(page).toContain("--tier-card-size: max(44px");
    expect(page).toContain("100dvh - var(--app-header-height)");
    expect(page).toContain("env(safe-area-inset-bottom)");
    expect(page).not.toContain("6vw");
    expect(page).not.toContain("84px");
  });

  it("soft-lifts tier covers on hover and focus without fighting drag transforms", () => {
    const cover = declarations(".tier-page .game-card--tier .game-card__cover");
    const hoverCover = declarations(".tier-page .game-card--tier:hover:not(.is-dragging) .game-card__cover");
    const focusCover = declarations(".tier-page .game-card--tier:not(.is-dragging) .game-card__cover:focus-visible");
    const hoverCard = declarations(".tier-page .game-card--tier:hover:not(.is-dragging)");

    expect(cover).toContain("transition: scale .18s ease-out, box-shadow .18s ease-out");
    expect(hoverCover).toContain("scale: 1.05");
    expect(focusCover).toContain("scale: 1.05");
    expect(hoverCard).toContain("z-index: 3");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.tier-page \.game-card--tier:hover:not\(\.is-dragging\) \.game-card__cover[\s\S]*?scale: 1;/,
    );
  });
});
