import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { declarationsIn } from "./cssTestUtils";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("mobile nav css", () => {
  it("defines a fixed bottom tab bar with safe-area padding", () => {
    expect(styles).toContain('.app-shell[data-mobile-chrome="true"] .app-tab-bar');
    const bar = declarationsIn(styles, '.app-shell[data-mobile-chrome="true"] .app-tab-bar');
    expect(bar).toContain("position: fixed");
    expect(bar).toContain("bottom: 0");
    expect(bar).toContain("padding: 0 4px env(safe-area-inset-bottom)");
    expect(styles).toContain("--app-tab-bar-height: calc(52px + env(safe-area-inset-bottom))");
  });

  it("adds coarse-pointer press feedback", () => {
    expect(styles).toContain("@media (pointer: coarse)");
    expect(styles).toContain(".game-card--list:active");
    expect(styles).toContain(".app-tab-bar__link:active");
    expect(styles).toContain("background: var(--press-wash)");
  });

  it("defines light theme tokens", () => {
    expect(styles).toContain(':root[data-theme="light"]');
    expect(declarationsIn(styles, ':root[data-theme="light"]')).toContain("--bg: #f2f3f5");
  });
});
