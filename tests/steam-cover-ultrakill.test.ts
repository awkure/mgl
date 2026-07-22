import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  largestTextBox,
  pickLogoTextBox,
  rectContainsBox,
  textFitCoverRect,
  textFitSquare,
} from "../scripts/lib/steamCoverTextFit.mjs";
import { encodeSteamCoverWebp } from "../scripts/lib/steamCover.mjs";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/steam-covers");
const snapshot = JSON.parse(readFileSync(path.join(fixtures, "ultrakill-1229490.boxes.json"), "utf8"));
const jpeg = readFileSync(path.join(fixtures, "ultrakill-1229490.jpg"));

describe("ULTRAKILL cover OCR crop", () => {
  it("full-box union cannot fit in one square (top taglines + bottom logo)", () => {
    expect(textFitSquare(snapshot.boxes, snapshot)).toBeNull();
  });

  it("pickLogoTextBox prefers ULTRAKILL title over credit slab and footer", () => {
    const slab = largestTextBox(snapshot.boxes)!;
    expect(slab.width * slab.height).toBe(300 * 62);
    const logo = pickLogoTextBox(snapshot.boxes, snapshot)!;
    expect(logo).toEqual({ x: 0, y: 297, width: 296, height: 58 });
    expect(logo.y).toBeLessThan(slab.y);
  });

  it("attention above logo pins title to south of crop (cuts NEW BLOOD footer)", () => {
    const logo = pickLogoTextBox(snapshot.boxes, snapshot)!;
    const withAttention = textFitCoverRect(snapshot.boxes, snapshot, {
      attention: { x: 262, y: 182 },
    });
    expect(withAttention).not.toBeNull();
    expect(rectContainsBox(withAttention!, logo)).toBe(true);
    expect(withAttention!.top).toBe(60);
    expect(withAttention!.top + withAttention!.height).toBe(360);
  });

  it("encodeSteamCoverWebp pins logo south when attention is above", async () => {
    const logo = pickLogoTextBox(snapshot.boxes, snapshot)!;
    const extracts: Array<{ left: number; top: number; width: number; height: number }> = [];
    const positions: Array<string | number> = [];

    const webp = await encodeSteamCoverWebp(jpeg, {
      detectTextBoxes: async () => snapshot.boxes,
      attentionFocus: async () => ({ x: 262, y: 182 }),
      encodeExtract: async (bytes, rect) => {
        extracts.push(rect);
        return sharp(bytes).extract(rect).resize(512, 512).webp({ quality: 82 }).toBuffer();
      },
      encodeResize: async (_bytes, position) => {
        positions.push(position);
        throw new Error("attention-only path must not run when OCR+attention merge applies");
      },
    });

    expect(positions).toEqual([]);
    expect(extracts).toHaveLength(1);
    expect(rectContainsBox(extracts[0], logo)).toBe(true);
    expect(extracts[0].top).toBe(60);
    const meta = await sharp(webp).metadata();
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
  });
});
