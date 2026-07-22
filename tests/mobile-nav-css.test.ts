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
    expect(main).toContain("height: 100dvh");
    expect(main).toContain("padding-top: 0");
    expect(main).not.toContain("var(--app-tab-bar-height)");
    expect(styles).toContain("padding-bottom: var(--app-tab-bar-height)");
    expect(styles).toContain(".swipe-pager__panel :is(.catalog-page.pull-to-refresh, .tier-board.pull-to-refresh, .settings-page)");
    const scrollSurfaces = declarationsIn(
      styles,
      ".swipe-pager__panel :is(.catalog-page.pull-to-refresh, .tier-board.pull-to-refresh, .settings-page)",
    );
    expect(scrollSurfaces).toContain("padding-top: calc(var(--app-header-height) + var(--app-search-bar-height))");
  });

  it("defines a fixed under-header search bar for mobile tiers/catalog", () => {
    expect(styles).toContain("--app-search-bar-height: 0px");
    const withBar = declarationsIn(styles, '.app-shell[data-search-bar="true"]');
    expect(withBar).toMatch(/--app-search-bar-height:\s*(?!0px)/);
    const searchBar = declarationsIn(styles, ".app-search-bar");
    expect(searchBar).toContain("position: fixed");
    expect(searchBar).toContain("top: var(--app-header-height)");
    expect(searchBar).toContain("isolation: isolate");
    expect(styles).toContain(".app-search-bar::before");
    const barSearch = declarationsIn(styles, ".global-game-search--bar");
    expect(barSearch).toContain("max-width: none");
    expect(styles).toMatch(/\.global-game-search--bar\.is-open[^{]*\{[^}]*position:\s*relative/);
    expect(styles).toMatch(/\.global-game-search--bar\s+\.global-game-search__popover[^{]*\{[^}]*position:\s*absolute/);
    expect(styles).toMatch(/\.global-game-search--bar\s+\.global-game-search__popover[^{]*\{[^}]*top:\s*100%/);
  });

  it("uses liquid glass tokens on the fixed header without trapping fixed descendants", () => {
    const header = declarationsIn(styles, ".app-header");
    expect(header).toContain("position: fixed");
    expect(header).toContain("isolation: isolate");
    expect(header).not.toContain("backdrop-filter:");
    expect(styles).toContain(".app-header::before");
    const glass = declarationsIn(styles, ".app-header::before");
    expect(glass).toContain("background: var(--glass-fill)");
    expect(glass).toContain("backdrop-filter: blur(22px) saturate(1.35)");
    expect(glass).toContain("pointer-events: none");
  });

  it("keeps filter menus outside the bar popover scroll clip", () => {
    const barPopover = declarationsIn(styles, ".global-game-search--bar .global-game-search__popover");
    expect(barPopover).toContain("overflow: visible");
    expect(barPopover).not.toContain("overflow: auto");
    const results = declarationsIn(styles, ".global-game-search--bar .global-game-search__results");
    expect(results).toContain("overflow-y: auto");
    expect(styles).toMatch(/\.filter-menu__panel\s*\{[^}]*z-index:\s*90;/);
  });

  it("defines a mobile-only glass drag-mode toggle on the tier page", () => {
    expect(styles).toContain(".tier-drag-mode-toggle");
    const toggle = declarationsIn(styles, ".tier-drag-mode-toggle");
    expect(toggle).toContain("position: absolute");
    expect(toggle).toContain("border-radius: 50%");
    expect(toggle).toContain("background: var(--glass-fill)");
    expect(styles).toMatch(/@media \(pointer: coarse\),\s*\(max-width: 720px\)[\s\S]*?\.tier-drag-mode-toggle \{[^}]*display:\s*grid;/);
  });
});
