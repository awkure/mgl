import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { declarationsIn } from "./cssTestUtils";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("pull-to-refresh css", () => {
  it("defines indicator, content transform host, and spinning spinner", () => {
    expect(declarationsIn(styles, ".pull-to-refresh")).toContain("position: relative");
    expect(declarationsIn(styles, ".pull-to-refresh__indicator")).toContain("height: var(--ptr-offset)");
    expect(declarationsIn(styles, ".pull-to-refresh__content")).toContain("will-change: transform, opacity");
    expect(declarationsIn(styles, ".pull-to-refresh__content")).toContain("transform-origin: center top");
    expect(declarationsIn(styles, ".pull-to-refresh__spinner")).toContain("border-radius: 50%");
    expect(declarationsIn(styles, ".pull-to-refresh__spinner.is-spinning")).toContain("animation: boot-spin");
  });

  it("keeps tier board column layout inside the content wrapper", () => {
    const content = declarationsIn(styles, ".tier-board.pull-to-refresh > .pull-to-refresh__content");
    expect(content).toContain("display: flex");
    expect(content).toContain("flex-direction: column");
  });

  it("pads tier board content so last rows clear the floating tab bar", () => {
    const content = declarationsIn(styles, ".tier-board.pull-to-refresh > .pull-to-refresh__content");
    expect(content).not.toContain("padding-bottom: var(--app-tab-bar-height)");
    const spacer = declarationsIn(styles, ".tier-board.pull-to-refresh > .pull-to-refresh__content::after");
    expect(spacer).toContain('content: ""');
    expect(spacer).toContain("flex: 0 0 var(--app-tab-bar-height)");
    const scrollSurfaces = declarationsIn(
      styles,
      ".swipe-pager__panel :is(.catalog-page.pull-to-refresh, .tier-board.pull-to-refresh, .settings-page, .history-page)",
    );
    expect(scrollSurfaces).not.toContain("padding-bottom: var(--app-tab-bar-height)");
    const otherSurfaces = declarationsIn(
      styles,
      ".swipe-pager__panel :is(.catalog-page.pull-to-refresh, .settings-page, .history-page)",
    );
    expect(otherSurfaces).toContain("padding-bottom: var(--app-tab-bar-height)");
  });
});
