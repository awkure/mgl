import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { declarationsIn } from "./cssTestUtils";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("diff dialog css", () => {
  it("pads the header below the iOS status bar via safe-area inset", () => {
    const dialog = declarationsIn(styles, ".diff-dialog");
    const header = declarationsIn(styles, ".diff-dialog__header");
    expect(dialog).toMatch(/--diff-safe-top:\s*env\(safe-area-inset-top/);
    expect(header).toMatch(/padding(?:-top)?:[^;]*var\(--diff-safe-top\)/);
  });
});
