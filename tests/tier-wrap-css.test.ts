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
    expect(page).toContain("var(--app-tab-bar-height)");
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

  it("shows centered title and black tint on tier cover hover and focus", () => {
    const tint = declarations(".tier-page .game-card--tier .game-card__cover::before");
    const title = declarations(".tier-page .game-card--tier .game-card__hover-title");
    const hoverTint = declarations(".tier-page .game-card--tier:hover:not(.is-dragging) .game-card__cover::before");
    const hoverTitle = declarations(".tier-page .game-card--tier:hover:not(.is-dragging) .game-card__hover-title");
    const focusTint = declarations(".tier-page .game-card--tier:not(.is-dragging) .game-card__cover:focus-visible::before");
    const focusTitle = declarations(".tier-page .game-card--tier:not(.is-dragging) .game-card__cover:focus-visible .game-card__hover-title");

    expect(tint).toContain("position: absolute");
    expect(tint).toContain("inset: 0");
    expect(tint).toContain("rgba(0, 0, 0, .45)");
    expect(tint).toContain("opacity: 0");
    expect(tint).toContain("pointer-events: none");
    expect(tint).toContain("transition: opacity .18s ease-out");
    expect(tint).toContain("z-index: 1");

    expect(title).toContain("position: absolute");
    expect(title).toContain("inset: 0");
    expect(title).toContain("display: flex");
    expect(title).toContain("align-items: center");
    expect(title).toContain("justify-content: center");
    expect(title).toContain("text-align: center");
    expect(title).toContain("opacity: 0");
    expect(title).toContain("pointer-events: none");
    expect(title).toContain("-webkit-line-clamp: 3");
    expect(title).toContain("z-index: 1");
    expect(title).toContain("transition: opacity .18s ease-out");

    expect(hoverTint).toContain("opacity: 1");
    expect(hoverTitle).toContain("opacity: 1");
    expect(focusTint).toContain("opacity: 1");
    expect(focusTitle).toContain("opacity: 1");
  });
});
