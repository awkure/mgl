import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { declarationsIn } from "./cssTestUtils";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("mobile nav css", () => {
  it("defines a detached floating pill tab bar with safe-area inset", () => {
    expect(styles).toContain('.app-shell[data-mobile-chrome="true"] .app-tab-bar');
    const bar = declarationsIn(styles, '.app-shell[data-mobile-chrome="true"] .app-tab-bar');
    expect(bar).toContain("position: fixed");
    expect(bar).toContain("border-radius: 28px");
    expect(bar).toContain("backdrop-filter: blur(22px) saturate(1.35)");
    expect(bar).toContain("bottom: calc(12px + env(safe-area-inset-bottom))");
    expect(styles).toContain("--app-tab-bar-height: calc(64px + env(safe-area-inset-bottom) + 12px)");
  });

  it("defines a circular detached add button", () => {
    const add = declarationsIn(styles, '.app-shell[data-mobile-chrome="true"] .app-tab-add');
    expect(add).toContain("position: fixed");
    expect(add).toContain("border-radius: 50%");
    expect(add).toContain("width: var(--tab-add-size)");
    expect(add).toContain("right: calc(12px + env(safe-area-inset-right))");
  });

  it("adds coarse-pointer press feedback", () => {
    expect(styles).toContain("@media (pointer: coarse)");
    expect(styles).toContain(".game-card--list:active");
    expect(styles).toContain(".app-tab-bar__link:active");
    expect(styles).toContain("background: var(--press-wash)");
  });

  it("defines glass theme tokens", () => {
    expect(styles).toContain(':root[data-theme="glass"]');
    expect(declarationsIn(styles, ':root[data-theme="glass"]')).toContain("--bg: #0c0d10");
    expect(declarationsIn(styles, ':root[data-theme="glass"]')).toContain("--glass-fill:");
  });

  it("defines swipe pager track layout", () => {
    expect(declarationsIn(styles, ".swipe-pager__track")).toContain("width: 200%");
    expect(declarationsIn(styles, ".swipe-pager__panel")).toContain("width: 50%");
  });

  it("lets main fill under the floating tab bar on tiers/catalog", () => {
    const main = declarationsIn(
      styles,
      '.app-shell[data-route="tiers"] .app-main, .app-shell[data-route="catalog"] .app-main',
    );
    expect(main).toContain("height: calc(100dvh - var(--app-header-height))");
    expect(main).not.toContain("var(--app-tab-bar-height)");
    expect(styles).toContain("padding-bottom: var(--app-tab-bar-height)");
    expect(styles).toContain(".swipe-pager__panel :is(.catalog-page.pull-to-refresh, .tier-board.pull-to-refresh)");
  });
});
