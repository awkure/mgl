import { describe, expect, it } from "vitest";
import { TEXT_FIT_PAD, textFitSquare } from "../scripts/lib/steamCoverTextFit.mjs";

describe("textFitSquare", () => {
  it("returns null for empty boxes", () => {
    expect(textFitSquare([], { width: 600, height: 900 })).toBeNull();
  });

  it("returns a square covering a single centered box with 8% pad", () => {
    // box 100x50 at (250,400) on 600x900
    const rect = textFitSquare(
      [{ x: 250, y: 400, width: 100, height: 50 }],
      { width: 600, height: 900 },
    );
    expect(rect).not.toBeNull();
    expect(rect!.width).toBe(rect!.height);
    expect(TEXT_FIT_PAD).toBe(0.08);
    // padded union: w=100+2*p, h=50+2*p with p=0.08*100=8 → 116 x 66 → side 116
    expect(rect!.width).toBe(116);
    // square must contain padded union
    expect(rect!.left).toBeLessThanOrEqual(250 - 8);
    expect(rect!.top).toBeLessThanOrEqual(400 - 8);
    expect(rect!.left + rect!.width).toBeGreaterThanOrEqual(250 + 100 + 8);
    expect(rect!.top + rect!.height).toBeGreaterThanOrEqual(400 + 50 + 8);
  });

  it("returns null when padded union cannot fit in a square inside the image", () => {
    // tall text spanning almost full height
    const rect = textFitSquare(
      [{ x: 10, y: 10, width: 50, height: 880 }],
      { width: 600, height: 900 },
    );
    expect(rect).toBeNull();
  });

  it("unions multiple boxes before squaring", () => {
    const rect = textFitSquare(
      [
        { x: 200, y: 100, width: 80, height: 40 },
        { x: 300, y: 200, width: 80, height: 40 },
      ],
      { width: 600, height: 900 },
    );
    expect(rect).not.toBeNull();
    expect(rect!.width).toBe(rect!.height);
    // union 200..380, 100..240 → 180x140; p=0.08*180=14.4 → padded ~208.8 x 168.8 → side ~209
    expect(rect!.width).toBeGreaterThanOrEqual(180);
  });
});
