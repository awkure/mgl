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
    expect(bar).toContain("grid-template-columns: repeat(4, minmax(0, 1fr))");
    expect(styles).toContain("--app-tab-bar-height: calc(80px + env(safe-area-inset-bottom) + 12px)");
  });

  it("keeps scroll surfaces clear of the floating tab bar with breathing room", () => {
    expect(styles).toContain("--app-tab-bar-height: calc(80px + env(safe-area-inset-bottom) + 12px)");
    const otherSurfaces = declarationsIn(
      styles,
      ".swipe-pager__panel :is(.catalog-page.pull-to-refresh, .settings-page, .history-page)",
    );
    expect(otherSurfaces).toContain("padding-bottom: var(--app-tab-bar-height)");
    const tierSpacer = declarationsIn(styles, ".tier-board.pull-to-refresh > .pull-to-refresh__content::after");
    expect(tierSpacer).toContain("flex: 0 0 var(--app-tab-bar-height)");
    const overlay = declarationsIn(styles, ".swipe-pager__overlay");
    expect(overlay).toContain("padding-bottom: var(--app-tab-bar-height)");
    const main = declarationsIn(styles, '.app-shell[data-mobile-chrome="true"] .app-main');
    expect(main).toContain("padding-bottom: var(--app-tab-bar-height)");
  });

  it("pads overlay game pages so end content clears the floating tab bar", () => {
    const page = declarationsIn(styles, ".swipe-pager__panel .swipe-pager__overlay .page");
    expect(page).toContain("height: auto");
    const mobilePage = declarationsIn(
      styles,
      '.app-shell[data-mobile-chrome="true"] .swipe-pager__overlay .page',
    );
    expect(mobilePage).toContain("padding-bottom: var(--app-tab-bar-height)");
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

  it("defines swipe pager track layout for four panels", () => {
    expect(declarationsIn(styles, ".swipe-pager__track")).toContain("width: 400%");
    const panel = declarationsIn(styles, ".swipe-pager__panel");
    expect(panel).toContain("position: relative");
    expect(panel).toContain("width: calc(100% / 4)");
    expect(panel).toContain("flex: 0 0 calc(100% / 4)");
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
    expect(blob).toContain("width: calc((100% - 12px) / 4)");
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

  it("lets main fill under the floating tab bar on tiers/catalog/history/settings", () => {
    const main = declarationsIn(
      styles,
      '.app-shell[data-route="tiers"] .app-main, .app-shell[data-route="catalog"] .app-main, .app-shell[data-route="history"] .app-main, .app-shell[data-route="settings"] .app-main',
    );
    expect(main).toContain("height: 100dvh");
    expect(main).toContain("padding-top: 0");
    expect(main).not.toContain("var(--app-tab-bar-height)");
    expect(styles).toContain("padding-bottom: var(--app-tab-bar-height)");
    expect(styles).toContain(
      ".swipe-pager__panel :is(.catalog-page.pull-to-refresh, .tier-board.pull-to-refresh, .settings-page, .history-page)",
    );
    const scrollSurfaces = declarationsIn(
      styles,
      ".swipe-pager__panel :is(.catalog-page.pull-to-refresh, .tier-board.pull-to-refresh, .settings-page, .history-page)",
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
    expect(headerActions).toContain("background: color-mix(in srgb, var(--glass-fill) 80%, transparent)");
    const patchPill = declarationsIn(styles, ".app-header .patch-pill");
    expect(patchPill).toContain("backdrop-filter: blur(22px) saturate(1.35)");
    const navLink = declarationsIn(styles, ".app-nav__link");
    expect(navLink).toContain("backdrop-filter: blur(22px) saturate(1.35)");
    expect(navLink).toContain("background: color-mix(in srgb, var(--glass-fill) 80%, transparent)");
    expect(navLink).toContain("border: 1px solid var(--glass-stroke)");
    expect(navLink).toContain("border-radius: 999px");
    expect(styles).toMatch(
      /@media \(max-width: 500px\)[\s\S]*?\.app-header \.global-game-search:not\(\.is-open\) \.global-game-search__field \{[^}]*background:\s*color-mix\(in srgb, var\(--glass-fill\) 80%, transparent\);/,
    );

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

  it("keeps catalog sort direction buttons visible without sheet padding waste", () => {
    const sheet = declarationsIn(styles, ".screen-filter-bar__sheet");
    expect(sheet).toContain("padding: 0");
    expect(sheet).not.toContain("padding: 7px");
    const sort = declarationsIn(styles, ".screen-filter-bar__sort");
    expect(sort).toContain("flex: 1 1 100%");
    expect(sort).toContain("min-width: 0");
    const sortMenu = declarationsIn(styles, ".screen-filter-bar__sort .filter-menu");
    expect(sortMenu).toContain("flex: 1 1 auto");
    expect(sortMenu).toContain("min-width: 0");
    const sortDir = declarationsIn(styles, ".screen-filter-bar__sort-dir");
    expect(sortDir).toContain("flex: 0 0 auto");
    expect(styles).toMatch(
      /@media \(pointer: coarse\),\s*\(max-width: 720px\)[\s\S]*?\.screen-filter-bar__sort-dir-btn \{[^}]*min-width:\s*var\(--touch-target\);/,
    );
  });

  it("defines a mobile-only glass drag-mode toggle on the tier page", () => {
    expect(styles).toContain(".tier-drag-mode-toggle");
    const toggle = declarationsIn(styles, ".tier-drag-mode-toggle");
    expect(toggle).toContain("position: absolute");
    expect(toggle).toContain("border-radius: 50%");
    expect(toggle).toContain("background: var(--glass-fill)");
    expect(styles).toMatch(/@media \(pointer: coarse\),\s*\(max-width: 720px\)[\s\S]*?\.tier-drag-mode-toggle \{[^}]*display:\s*grid;/);
  });

  it("disables Safari touch callout on tier covers while drag mode is on", () => {
    const cover = declarationsIn(styles, ".tier-page--drag-mode .game-card--tier .game-card__cover");
    const coverImg = declarationsIn(styles, ".tier-page--drag-mode .game-card--tier .game-card__cover img");
    expect(cover).toContain("-webkit-touch-callout: none");
    expect(cover).toContain("user-select: none");
    expect(coverImg).toContain("-webkit-touch-callout: none");
    expect(coverImg).toContain("-webkit-user-drag: none");
  });

  it("blocks Safari pinch zoom via pan-only touch-action (viewport meta ignored)", () => {
    const universal = declarationsIn(styles, "*");
    expect(universal).toContain("touch-action: pan-x pan-y");
    expect(styles).not.toContain("touch-action: manipulation");
  });

  it("disables Safari touch callout on tab bar links and add button", () => {
    const link = declarationsIn(styles, '.app-shell[data-mobile-chrome="true"] .app-tab-bar__link');
    const add = declarationsIn(styles, '.app-shell[data-mobile-chrome="true"] .app-tab-add');
    expect(link).toContain("-webkit-touch-callout: none");
    expect(link).toContain("user-select: none");
    expect(add).toContain("-webkit-touch-callout: none");
    expect(add).toContain("user-select: none");
  });

  it("defines press-glass blob override driven by data-tab-press and --press-tab", () => {
    expect(styles).toContain("@property --press-tab");
    const pressBlob = declarationsIn(
      styles,
      '.app-shell[data-mobile-chrome="true"][data-tab-press="true"] .app-tab-bar__blob',
    );
    expect(pressBlob).toContain("translateX(calc(var(--press-tab, 0) * (100% + 2px)))");
    expect(pressBlob).toMatch(/scale\(/);
    expect(pressBlob).toContain("backdrop-filter:");
    expect(pressBlob).toMatch(/box-shadow:/);
  });

  it("tracks finger without transform transition while tab is pressed", () => {
    const pressBlob = declarationsIn(
      styles,
      '.app-shell[data-mobile-chrome="true"][data-tab-press="true"] .app-tab-bar__blob',
    );
    // Transform must not ease while finger is down — only glass/surface may transition.
    expect(pressBlob).not.toMatch(/transition:\s*[^;]*transform/);
    expect(pressBlob).toMatch(/transition:\s*none|transition:[^;]*box-shadow/);
  });

  it("defines mild lens on pressed tab link", () => {
    const pressed = declarationsIn(
      styles,
      '.app-shell[data-mobile-chrome="true"][data-tab-press="true"] .app-tab-bar__link[data-pressed="true"]',
    );
    expect(pressed).toMatch(/scale\(/);
    expect(pressed).toContain("filter:");
  });

  it("disables press-glass flourish under reduced motion", () => {
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?\[data-tab-press="true"\][\s\S]*?\.app-tab-bar__blob/,
    );
  });

  it("keeps pager-dragging blob free of press transform ownership", () => {
    const dragging = declarationsIn(
      styles,
      '.app-shell[data-mobile-chrome="true"][data-pager-dragging="true"] .app-tab-bar__blob',
    );
    expect(dragging).toContain("transition: none");
    expect(styles).toContain(
      '.app-shell[data-mobile-chrome="true"][data-pager-dragging="true"] .app-tab-bar__blob',
    );
  });
});
