import { describe, expect, it } from "vitest";
import { historyNotePreview } from "../src/domain/historyNotePreview";

describe("historyNotePreview", () => {
  it("returns null for empty / whitespace", () => {
    expect(historyNotePreview("")).toBeNull();
    expect(historyNotePreview("  \n\t")).toBeNull();
  });

  it("strips light markdown and keeps plain text", () => {
    expect(historyNotePreview("## Hello **world**")).toBe("Hello world");
    expect(historyNotePreview("[link](https://example.com)")).toBe("link");
  });

  it("keeps at most 3 non-empty lines", () => {
    const input = "a\n\nb\nc\nd\ne";
    expect(historyNotePreview(input)).toBe("a\nb\nc");
  });

  it("caps at 200 chars with ellipsis", () => {
    const long = "x".repeat(250);
    const out = historyNotePreview(long)!;
    expect(out.length).toBe(201);
    expect(out.endsWith("…")).toBe(true);
  });
});
