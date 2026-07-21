import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { declarationsIn } from "./cssTestUtils";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("catalog card css", () => {
  it("wraps list titles with a two-line clamp", () => {
    const title = declarationsIn(styles, ".game-card--list .game-card__title");
    expect(title).toContain("white-space: normal");
    expect(title).toContain("-webkit-line-clamp: 2");
    expect(title).toContain("overflow-wrap: anywhere");
    expect(title).toContain("max-width: 100%");
  });

  it("uses content-visibility for offscreen list cards", () => {
    const card = declarationsIn(styles, ".game-card--list");
    expect(card).toContain("content-visibility: auto");
    expect(card).toContain("contain-intrinsic-size: auto 86px");
  });
});
