import { describe, expect, it } from "vitest";
import {
  TEXT_FIT_PAD,
  TEXT_FIT_PAD_BOTTOM,
  largestTextBox,
  pickLogoTextBox,
  placeSquareContaining,
  placeSquareLogoAttention,
  rectContainsBox,
  textFitCoverRect,
  textFitSquare,
} from "../scripts/lib/steamCoverTextFit.mjs";

describe("textFitSquare", () => {
  it("returns null for empty boxes", () => {
    expect(textFitSquare([], { width: 600, height: 900 })).toBeNull();
  });

  it("returns a square covering a single centered box with 8% pad", () => {
    const rect = textFitSquare(
      [{ x: 250, y: 400, width: 100, height: 50 }],
      { width: 600, height: 900 },
    );
    expect(rect).not.toBeNull();
    expect(rect!.width).toBe(rect!.height);
    expect(TEXT_FIT_PAD).toBe(0.08);
    expect(rect!.width).toBe(116);
    expect(rect!.left).toBeLessThanOrEqual(250 - 8);
    expect(rect!.top).toBeLessThanOrEqual(400 - 8);
    expect(rect!.left + rect!.width).toBeGreaterThanOrEqual(250 + 100 + 8);
    expect(rect!.top + rect!.height).toBeGreaterThanOrEqual(400 + 50 + 8);
  });

  it("returns null when padded union cannot fit in a square inside the image", () => {
    const rect = textFitSquare(
      [{ x: 10, y: 10, width: 50, height: 880 }],
      { width: 600, height: 900 },
    );
    expect(rect).toBeNull();
  });

  it("largestTextBox picks max area", () => {
    const big = { x: 10, y: 200, width: 200, height: 80 };
    const small = { x: 10, y: 10, width: 40, height: 12 };
    expect(largestTextBox([small, big])).toEqual(big);
  });

  it("pickLogoTextBox prefers highest substantial title over lower credit slab", () => {
    expect(TEXT_FIT_PAD_BOTTOM).toBe(0.02);
    const title = { x: 0, y: 297, width: 296, height: 58 };
    const slab = { x: 0, y: 346, width: 300, height: 62 };
    const footer = { x: 23, y: 396, width: 256, height: 49 };
    const tagline = { x: 40, y: 40, width: 80, height: 16 };
    expect(pickLogoTextBox([tagline, slab, title, footer], { width: 300, height: 450 })).toEqual(title);
  });

  it("attention above logo pins text to south edge of crop", () => {
    const logo = { x: 50, y: 700, width: 400, height: 80 };
    const tagline = { x: 10, y: 10, width: 120, height: 20 };
    const above = textFitCoverRect([tagline, logo], { width: 600, height: 900 }, {
      attention: { x: 300, y: 200 },
    });
    expect(above).not.toBeNull();
    expect(rectContainsBox(above!, logo)).toBe(true);
    // South pin: crop bottom hugs padded logo bottom (small bottom pad)
    expect(above!.top + above!.height).toBeGreaterThanOrEqual(700 + 80);
    expect(above!.top).toBeLessThan(300);
  });

  it("attention below logo pins text to north edge of crop", () => {
    // Title-like: wide + short relative to 900h (max height 0.12*900=108)
    const logo = { x: 50, y: 100, width: 400, height: 80 };
    const below = textFitCoverRect([logo], { width: 600, height: 900 }, {
      attention: { x: 300, y: 800 },
    });
    expect(below).not.toBeNull();
    expect(rectContainsBox(below!, logo)).toBe(true);
    // North pin: crop top hugs padded logo top
    expect(below!.top).toBeLessThanOrEqual(100);
    expect(below!.top + below!.height).toBeGreaterThan(400);
  });

  it("placeSquareLogoAttention: above → topMin, below → topMax", () => {
    // Logo near top so both pins are distinct within a 300² crop on 450h
    const must = { x0: 0, y0: 50, x1: 300, y1: 150 };
    const size = { width: 300, height: 450 };
    const above = placeSquareLogoAttention(must, size, 300, { x: 150, y: 20 });
    const below = placeSquareLogoAttention(must, size, 300, { x: 150, y: 400 });
    expect(above!.top).toBe(0); // topMin — text south
    expect(below!.top).toBe(50); // topMax — text north
  });

  it("placeSquareContaining clamps focus so must-region stays inside", () => {
    const must = { x0: 0, y0: 322, x1: 300, y1: 430 };
    const rect = placeSquareContaining(must, { width: 300, height: 450 }, 300, { x: 150, y: 50 });
    expect(rect).not.toBeNull();
    expect(rect!.top).toBeGreaterThanOrEqual(130);
    expect(rect!.top + rect!.height).toBeGreaterThanOrEqual(430);
  });

  it("textFitCoverRect south-falls back when the largest box itself is too tall", () => {
    const box = { x: 10, y: 10, width: 50, height: 880 };
    const rect = textFitCoverRect([box], { width: 600, height: 900 });
    expect(rect).not.toBeNull();
    expect(rect!.width).toBe(600);
    expect(rect!.height).toBe(600);
    expect(rectContainsBox(rect!, { x: 10, y: 800, width: 50, height: 90 })).toBe(true);
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
    expect(rect!.width).toBeGreaterThanOrEqual(180);
  });
});
