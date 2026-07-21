import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { declarationsIn } from "./cssTestUtils";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("compact game metadata", () => {
  it("places status and tier beside each other on one line", () => {
    const metadata = declarationsIn(styles, ".game-sidebar__meta");
    const shortField = declarationsIn(styles, ".game-sidebar__meta > .game-sidebar__meta-short");

    expect(metadata).toContain("display: grid");
    expect(metadata).toContain("grid-template-columns: minmax(0, 1fr) auto");
    expect(shortField).toContain("display: flex");
    expect(shortField).toContain("grid-column: auto");
    expect(shortField).toContain("align-items: center");
  });

  it("keeps inline suggestion inputs dense", () => {
    const editor = declarationsIn(styles, ".inline-values-editor .tag-input__control");

    expect(editor).toContain("min-height: 28px");
    expect(editor).toContain("gap: 2px");
  });
});
