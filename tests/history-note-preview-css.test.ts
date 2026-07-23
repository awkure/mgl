import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { declarationsIn } from "./cssTestUtils";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("history note body preview css", () => {
  it("styles note create preview and edit block diff", () => {
    const delta = declarationsIn(styles, ".history-timeline__delta");
    expect(delta).toContain("white-space: pre-line");

    const diff = declarationsIn(styles, ".history-timeline__note-diff");
    expect(diff).toContain("grid-template-columns: 1fr 1fr");

    const oldSide = declarationsIn(styles, ".history-timeline__note-diff-old");
    expect(oldSide).toContain("color: var(--danger)");
    expect(oldSide).toContain("text-decoration: line-through");

    const newSide = declarationsIn(styles, ".history-timeline__note-diff-new");
    expect(newSide).toContain("color: var(--success)");
  });
});
