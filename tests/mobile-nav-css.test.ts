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

  it("disables horizontal sliding track on desktop (no mobile chrome)", () => {
    const track = declarationsIn(styles, '.app-shell:not([data-mobile-chrome="true"]) .swipe-pager__track');
    expect(track).toContain("width: 100%");
    expect(track).toContain("transform: none");
    expect(track).toContain("display: block");
    const panel = declarationsIn(styles, '.app-shell:not([data-mobile-chrome="true"]) .swipe-pager__panel');
    expect(panel).toContain("display: none");
    expect(panel).toContain("width: 100%");
    const active = declarationsIn(
      styles,
      '.app-shell:not([data-mobile-chrome="true"]) .swipe-pager__panel:not([inert])',
    );
    expect(active).toContain("display: block");
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
    expect(scrollSurfaces).toContain("padding-top: var(--app-header-height)");
    expect(scrollSurfaces).not.toContain("--app-search-bar-height");
  });

  it("defines header screen filter bar expand layout without sticky search bar", () => {
    expect(styles).not.toMatch(/\.app-search-bar\s*\{/);
    expect(styles).not.toContain('.app-shell[data-search-bar="true"]');
    expect(styles).not.toContain("--app-search-bar-height");
    const bar = declarationsIn(styles, ".screen-filter-bar");
    expect(bar).toContain("position: relative");
    expect(bar).toContain("max-width: min(180px, 42vw)");
    expect(bar).toContain("transition: max-width 220ms ease-out");
    const expanded = declarationsIn(styles, ".screen-filter-bar.is-expanded");
    expect(expanded).toContain("max-width: min(420px, 100%)");
    expect(expanded).toContain("flex: 1 1 100%");
    const sheet = declarationsIn(styles, ".screen-filter-bar__sheet");
    expect(sheet).toContain("top: calc(100% + 6px)");
    expect(sheet).toContain("animation: screen-filter-sheet-in 180ms ease-out");
    expect(sheet).toContain("max-height:");
  });

  it("keeps header transparent and puts liquid glass on controls only", () => {
    const header = declarationsIn(styles, ".app-header");
    expect(header).toContain("position: fixed");
    expect(header).toContain("isolation: isolate");
    expect(header).toContain("background: transparent");
    expect(header).not.toContain("backdrop-filter:");
    expect(styles).not.toContain(".app-header::before");

    const filterField = declarationsIn(styles, ".screen-filter-bar__field");
    expect(filterField).toContain("background: var(--glass-fill)");
    expect(filterField).toContain("border: 1px solid var(--glass-stroke)");
    expect(filterField).toContain("backdrop-filter: blur(22px) saturate(1.35)");

    const searchField = declarationsIn(styles, ".global-game-search__field");
    expect(searchField).toContain("background: var(--glass-fill)");
    expect(searchField).toContain("border: 1px solid var(--glass-stroke)");
    expect(searchField).toContain("backdrop-filter: blur(22px) saturate(1.35)");

    const headerActions = declarationsIn(styles, ".app-header .button--ghost.button--icon, .app-header .random-game-button");
    expect(headerActions).toContain("backdrop-filter: blur(22px) saturate(1.35)");
    const patchPill = declarationsIn(styles, ".app-header .patch-pill");
    expect(patchPill).toContain("backdrop-filter: blur(22px) saturate(1.35)");

    const popover = declarationsIn(styles, ".global-game-search__popover");
    expect(popover).toContain("top: 100%");
    expect(popover).not.toContain("top: calc(100% + 5px)");
  });

  it("scrolls the filter sheet on short viewports while portaled menus use fixed stacking", () => {
    const sheet = declarationsIn(styles, ".screen-filter-bar__sheet");
    expect(sheet).toContain("overflow-y: auto");
    const panel = declarationsIn(styles, ".filter-menu__panel");
    expect(panel).toContain("position: fixed");
    expect(panel).toContain("z-index: 90");
    expect(panel).toContain("background: var(--surface-2)");
  });

  it("defines a mobile-only glass drag-mode toggle on the tier page", () => {
    expect(styles).toContain(".tier-drag-mode-toggle");
    const toggle = declarationsIn(styles, ".tier-drag-mode-toggle");
    expect(toggle).toContain("position: absolute");
    expect(toggle).toContain("border-radius: 50%");
    expect(toggle).toContain("background: var(--glass-fill)");
    expect(styles).toMatch(/@media \(pointer: coarse\),\s*\(max-width: 720px\)[\s\S]*?\.tier-drag-mode-toggle \{[^}]*display:\s*grid;/);
  });

  it("blocks Safari pinch zoom via pan-only touch-action (viewport meta ignored)", () => {
    const universal = declarationsIn(styles, "*");
    expect(universal).toContain("touch-action: pan-x pan-y");
    expect(styles).not.toContain("touch-action: manipulation");
  });
});
