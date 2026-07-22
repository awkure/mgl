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
    expect(styles).toContain("--control-height: var(--touch-target)");
    const sharedTouch = declarationsIn(
      styles,
      "button, summary, .button, .filter-menu__panel label",
    );
    expect(sharedTouch).toContain("min-height: var(--touch-target)");
    expect(sharedTouch).not.toContain("min-width:");
  });

  it("does not define a glass theme", () => {
    expect(styles).not.toContain(':root[data-theme="glass"]');
    expect(styles).not.toContain("data-glass-effect");
  });

  it("defines swipe pager track layout for three panels", () => {
    expect(declarationsIn(styles, ".swipe-pager__track")).toContain("width: 300%");
    expect(declarationsIn(styles, ".swipe-pager__panel")).toContain("position: relative");
    expect(styles).toContain(".swipe-pager__overlay");
    expect(declarationsIn(styles, ".swipe-pager__overlay")).toContain("position: absolute");
  });

  it("defines a sliding tab blob driven by --pager-progress", () => {
    expect(styles).toContain("@property --pager-progress");
    expect(styles).toContain(".app-tab-bar__blob");
    const blob = declarationsIn(styles, '.app-shell[data-mobile-chrome="true"] .app-tab-bar__blob');
    expect(blob).toContain("position: absolute");
    expect(blob).toContain("transform: translateX(calc(var(--pager-progress, 0) * (100% + 2px)))");
    expect(blob).toContain("--pager-progress 280ms cubic-bezier(.22, 1, .36, 1)");
    expect(styles).toContain('.app-shell[data-mobile-chrome="true"][data-pager-dragging="true"] .app-tab-bar__blob');
    expect(declarationsIn(styles, '.app-shell[data-mobile-chrome="true"][data-pager-dragging="true"] .app-tab-bar__blob')).toContain("transition: none");
  });

  it("keeps active tab link color-only without fill background", () => {
    const active = declarationsIn(styles, '.app-shell[data-mobile-chrome="true"] .app-tab-bar__link[aria-current="page"]');
    expect(active).toContain("color: var(--text)");
    expect(active).not.toContain("background: var(--accent-wash)");
    expect(active).not.toContain("box-shadow:");
  });

  it("lets main fill under the floating tab bar on tiers/catalog/settings", () => {
    const main = declarationsIn(
      styles,
      '.app-shell[data-route="tiers"] .app-main, .app-shell[data-route="catalog"] .app-main, .app-shell[data-route="settings"] .app-main',
    );
    expect(main).toContain("height: calc(100dvh - var(--app-header-height) - var(--app-search-bar-height))");
    expect(main).not.toContain("var(--app-tab-bar-height)");
    expect(styles).toContain("padding-bottom: var(--app-tab-bar-height)");
    expect(styles).toContain(".swipe-pager__panel :is(.catalog-page.pull-to-refresh, .tier-board.pull-to-refresh, .settings-page)");
  });

  it("defines a sticky under-header search bar for mobile tiers/catalog", () => {
    expect(styles).toContain("--app-search-bar-height: 0px");
    const withBar = declarationsIn(styles, '.app-shell[data-search-bar="true"]');
    expect(withBar).toMatch(/--app-search-bar-height:\s*(?!0px)/);
    const searchBar = declarationsIn(styles, ".app-search-bar");
    expect(searchBar).toContain("position: sticky");
    expect(searchBar).toContain("top: var(--app-header-height)");
    const barSearch = declarationsIn(styles, ".global-game-search--bar");
    expect(barSearch).toContain("max-width: none");
    expect(styles).toMatch(/\.global-game-search--bar\.is-open[^{]*\{[^}]*position:\s*relative/);
    expect(styles).toMatch(/\.global-game-search--bar\s+\.global-game-search__popover[^{]*\{[^}]*position:\s*absolute/);
    expect(styles).toMatch(/\.global-game-search--bar\s+\.global-game-search__popover[^{]*\{[^}]*top:\s*100%/);
  });
});
