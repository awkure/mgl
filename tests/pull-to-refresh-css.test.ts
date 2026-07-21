import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { declarationsIn } from "./cssTestUtils";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("pull-to-refresh css", () => {
  it("defines indicator, content transform host, and spinning spinner", () => {
    expect(declarationsIn(styles, ".pull-to-refresh")).toContain("position: relative");
    expect(declarationsIn(styles, ".pull-to-refresh__indicator")).toContain("height: var(--ptr-offset)");
    expect(declarationsIn(styles, ".pull-to-refresh__content")).toContain("will-change: transform");
    expect(declarationsIn(styles, ".pull-to-refresh__spinner")).toContain("border-radius: 50%");
    expect(declarationsIn(styles, ".pull-to-refresh__spinner.is-spinning")).toContain("animation: boot-spin");
  });

  it("keeps tier board column layout inside the content wrapper", () => {
    const content = declarationsIn(styles, ".tier-board.pull-to-refresh > .pull-to-refresh__content");
    expect(content).toContain("display: flex");
    expect(content).toContain("flex-direction: column");
  });
});
