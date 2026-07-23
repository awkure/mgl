import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { declarationsIn } from "./cssTestUtils";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("note card footer", () => {
  it("floats every note's actions below its clipped surface without reserving space", () => {
    const footer = declarationsIn(styles, ".note-card__actions");
    const card = declarationsIn(styles, ".note-card:not(.note-card--editing)");
    const surface = declarationsIn(styles, ".note-card__surface");
    const drag = declarationsIn(styles, ".note-card__actions .note-card__drag");
    const edit = declarationsIn(styles, ".note-card__actions .note-card__edit");

    expect(footer).toContain("position: absolute");
    expect(footer).toContain("top: 100%");
    expect(footer).toContain("bottom: auto");
    expect(footer).toContain("left: 0");
    expect(footer).toContain("opacity: 0");
    expect(footer).toContain("pointer-events: none");
    expect(card).toContain("overflow: visible");
    expect(card).not.toContain("padding-bottom");
    expect(surface).toContain("overflow: hidden");
    expect(surface).toContain("border: 1px solid var(--line-soft)");
    expect(drag).toContain("cursor: grab");
    expect(edit).toContain("margin-left: auto");
    expect(styles).toMatch(/\.note-card(?::not\([^}]+\))?:hover[^{}]*\.note-card__actions[^{}]*,\s*\.note-card(?::not\([^}]+\))?:focus-within[^{}]*\.note-card__actions\s*\{[^}]*opacity:\s*1;[^}]*pointer-events:\s*auto;/);
    expect(styles).not.toMatch(/\.note-card--media-only:hover[^{}]*\.note-card__actions/);
    expect(styles).not.toContain("--note-media-footer-height");
    expect(styles).not.toContain(".note-card--media-only.note-card--collapsed");
    expect(styles).not.toContain("note-card--playable-media");
  });

  it("keeps hovered footer actions above the add-note slot", () => {
    const activeCard = declarationsIn(
      styles,
      ".note-card:not(.note-card--editing):hover, .note-card:not(.note-card--editing):focus-within",
    );
    const footer = declarationsIn(styles, ".note-card__actions");
    const addSlot = declarationsIn(styles, ".note-group-add-slot");
    const activeCardLayer = Number(/z-index:\s*(\d+)/.exec(activeCard)?.[1]);
    const footerLayer = Number(/z-index:\s*(\d+)/.exec(footer)?.[1]);
    const addSlotLayer = Number(/z-index:\s*(\d+)/.exec(addSlot)?.[1]);

    expect(activeCardLayer).toBeGreaterThan(addSlotLayer);
    expect(footerLayer).toBeGreaterThan(addSlotLayer);
  });

  it("clears always-visible mobile card actions above the add-note slot", () => {
    expect(styles).toMatch(
      /@media \(pointer: coarse\),\s*\(max-width: 720px\)[\s\S]*?\.note-group-add-slot \{[^}]*margin-top:\s*calc\(4px \+ 49px\);/,
    );
    expect(styles).toMatch(
      /@media \(pointer: coarse\),\s*\(max-width: 720px\)[\s\S]*?\.note-card__actions \{[^}]*min-height:\s*49px;[^}]*opacity:\s*1;/,
    );
  });

  it("keeps footer actions visible on coarse pointers", () => {
    expect(styles).not.toMatch(/@media \(pointer: coarse\)[\s\S]*?\.note-card:not\(\.note-card--editing\) \{[^}]*padding-bottom/);
    expect(styles).toMatch(/@media \(pointer: coarse\)[\s\S]*?\.note-card__actions \{[^}]*min-height:\s*49px;[^}]*opacity:\s*1;[^}]*pointer-events:\s*auto;/);
    expect(styles).toMatch(/@media \(pointer: coarse\)[\s\S]*?\.note-card__actions button \{[^}]*pointer-events:\s*auto;/);
  });
});
