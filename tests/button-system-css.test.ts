import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { declarationsIn } from "./cssTestUtils";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

/** Matches coarse/mobile media query whether kept on one line or wrapped. */
const COARSE_MEDIA = String.raw`@media \(pointer: coarse\),\s*\(max-width: 720px\)`;

describe("button system css", () => {
  it("defines shared control and touch-target tokens", () => {
    expect(styles).toContain("--control-height: 30px");
    expect(styles).toContain("--control-pad-x: 10px");
    expect(styles).toContain("--control-radius: 5px");
    expect(styles).toContain("--touch-target: 44px");
    expect(styles).toContain("--btn-primary-bg:");
    expect(styles).toContain("--btn-secondary-bg:");
    expect(styles).toContain("--btn-danger-fg:");
  });

  it("sizes .button and .icon-button from control tokens", () => {
    expect(declarationsIn(styles, ".button")).toContain("min-height: var(--control-height)");
    expect(declarationsIn(styles, ".button")).toContain("padding: 0 var(--control-pad-x)");
    expect(declarationsIn(styles, ".button--icon")).toContain("width: var(--control-height)");
    expect(declarationsIn(styles, ".icon-button")).toContain("width: var(--control-height)");
    expect(declarationsIn(styles, ".icon-button")).toContain("min-height: var(--control-height)");
  });

  it("defines hover, active, and disabled states per hierarchy", () => {
    expect(styles).toContain(".button--primary:hover:not(:disabled):not([aria-disabled=\"true\"])");
    expect(styles).toContain(".button--primary:active:not(:disabled):not([aria-disabled=\"true\"])");
    expect(styles).toContain(".button--secondary:hover:not(:disabled):not([aria-disabled=\"true\"])");
    expect(styles).toContain(".button--secondary:active:not(:disabled):not([aria-disabled=\"true\"])");
    expect(styles).toContain(".button--ghost:hover:not(:disabled):not([aria-disabled=\"true\"])");
    expect(styles).toContain(".button--ghost:active:not(:disabled):not([aria-disabled=\"true\"])");
    expect(styles).toContain(".icon-button:active:not(:disabled)");
    expect(declarationsIn(styles, ".button:disabled, .button[aria-disabled=\"true\"]")).toContain("cursor: not-allowed");
  });

  it("keeps primary/secondary press colors on coarse pointers", () => {
    expect(styles).toMatch(new RegExp(COARSE_MEDIA));
    expect(styles).toMatch(
      new RegExp(`${COARSE_MEDIA}[\\s\\S]*?\\.button--primary:active:not\\(:disabled\\):not\\(\\[aria-disabled="true"\\]\\) \\{[^}]*background:\\s*var\\(--btn-primary-bg-active\\);`),
    );
    expect(styles).toMatch(
      new RegExp(`${COARSE_MEDIA}[\\s\\S]*?\\.button--secondary:active:not\\(:disabled\\):not\\(\\[aria-disabled="true"\\]\\) \\{[^}]*background:\\s*var\\(--btn-secondary-bg-active\\);`),
    );
    expect(styles).not.toMatch(
      new RegExp(`${COARSE_MEDIA}[\\s\\S]*?\\.button:active:not\\(:disabled\\) \\{[^}]*background:\\s*var\\(--press-wash\\);`),
    );
  });

  it("raises icon chrome to the touch target on coarse pointers", () => {
    expect(styles).toMatch(
      new RegExp(`${COARSE_MEDIA}[\\s\\S]*?\\.button--icon,\\s*\\.icon-button[\\s\\S]*?\\{[^}]*width:\\s*var\\(--touch-target\\);`),
    );
    expect(styles).toMatch(
      new RegExp(`${COARSE_MEDIA}[\\s\\S]*?\\.global-game-search__filter-button`),
    );
    expect(styles).toMatch(
      new RegExp(`${COARSE_MEDIA}[\\s\\S]*?\\.catalog-active-filters__chips button,\\s*\\.catalog-active-filters__reset \\{[^}]*min-width:\\s*0;[^}]*min-height:\\s*var\\(--touch-target\\);`),
    );
  });
});
