import { describe, expect, it } from "vitest";
import {
  FRAME_TRIM_MAX_FRAC,
  measureFrameDepths,
  localSquareAfterFrameTrim,
  mapLocalToSource,
} from "../scripts/lib/steamCoverFrameTrim.mjs";

/** Build RGBA: solid red frame inset of `fw` px, grey interior. */
function framedRgba(size: number, fw: number) {
  const rgba = Buffer.alloc(size * size * 4, 0);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const border = x < fw || x >= size - fw || y < fw || y >= size - fw;
      if (border) {
        rgba[i] = 200; rgba[i + 1] = 20; rgba[i + 2] = 20; rgba[i + 3] = 255;
      } else {
        rgba[i] = 40; rgba[i + 1] = 40; rgba[i + 2] = 50; rgba[i + 3] = 255;
      }
    }
  }
  return rgba;
}

describe("measureFrameDepths", () => {
  it("exports 4% cap", () => {
    expect(FRAME_TRIM_MAX_FRAC).toBe(0.04);
  });

  it("detects thin 4-side frame (~3%)", () => {
    const size = 200;
    const fw = 6; // 3%
    const r = measureFrameDepths(framedRgba(size, fw), size, size);
    expect(r).toMatchObject({
      depths: { left: fw, right: fw, top: fw, bottom: fw },
    });
  });

  it("returns thick when border exceeds 4%", () => {
    const size = 200;
    const fw = 12; // 6% > 4%
    expect(measureFrameDepths(framedRgba(size, fw), size, size)).toEqual({ thick: true });
  });

  it("returns none when only left side is bordered", () => {
    const size = 100;
    const rgba = Buffer.alloc(size * size * 4, 40);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < 4; x++) {
        const i = (y * size + x) * 4;
        rgba[i] = 200; rgba[i + 1] = 20; rgba[i + 2] = 20; rgba[i + 3] = 255;
      }
      for (let x = 4; x < size; x++) {
        rgba[(y * size + x) * 4 + 3] = 255;
      }
    }
    expect(measureFrameDepths(rgba, size, size)).toEqual({ none: true });
  });
});

describe("localSquareAfterFrameTrim", () => {
  it("returns inset square for L/R+T/B depths", () => {
    const size = 200;
    const depths = { left: 6, right: 6, top: 6, bottom: 6 };
    const local = localSquareAfterFrameTrim({ width: size, height: size }, depths);
    expect(local).not.toBeNull();
    expect(local!.width).toBe(local!.height);
    expect(local!.width).toBe(188);
    expect(local!.left).toBe(6);
    expect(local!.top).toBe(6);
  });

  it("returns null when must-region cannot fit after inset", () => {
    const size = 100;
    const depths = { left: 4, right: 4, top: 4, bottom: 4 };
    // must spans almost full pre-inset width → cannot fit in side 92
    const must = { x0: 0, y0: 40, x1: 100, y1: 60 };
    expect(localSquareAfterFrameTrim({ width: size, height: size }, depths, { must })).toBeNull();
  });

  it("mapLocalToSource offsets into source rect", () => {
    expect(
      mapLocalToSource(
        { left: 10, top: 20, width: 200, height: 200 },
        { left: 6, top: 6, width: 188, height: 188 },
      ),
    ).toEqual({ left: 16, top: 26, width: 188, height: 188 });
  });
});
