import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { encodeSteamCoverWebp, fetchAndEncodeSteamCover } from "../scripts/lib/steamCover.mjs";

const noDetect = { detectTextBoxes: async () => [] };

describe("steamCover", () => {
  it("encodes a fetched JPEG into a 512 WebP asset", async () => {
    const jpeg = await sharp({
      create: { width: 200, height: 300, channels: 3, background: { r: 20, g: 40, b: 60 } },
    }).jpeg().toBuffer();

    const fetchImpl = vi.fn(async (url) => {
      expect(String(url)).toContain("/apps/570/library_600x900.jpg");
      return {
        ok: true,
        arrayBuffer: async () => jpeg.buffer.slice(jpeg.byteOffset, jpeg.byteOffset + jpeg.byteLength),
      };
    });

    const result = await fetchAndEncodeSteamCover(570, { alt: "Dota 2", fetchImpl, ...noDetect });
    expect(result).not.toBeNull();
    expect(result.asset).toMatchObject({
      kind: "image",
      mime: "image/webp",
      width: 512,
      height: 512,
      alt: "Dota 2",
    });
    expect(result.asset.id).toMatch(/^[0-9a-f]{64}$/);
    expect(result.asset.byteLength).toBeGreaterThan(0);
    expect(result.base64.length).toBeGreaterThan(0);
    expect(Buffer.from(result.base64, "base64").subarray(0, 4).toString("ascii")).toBe("RIFF");
  });

  it("falls back to header_image when CDN fails", async () => {
    const jpeg = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 1, g: 2, b: 3 } },
    }).jpeg().toBuffer();

    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes("library_600x900")) {
        return { ok: false, arrayBuffer: async () => new ArrayBuffer(0) };
      }
      return {
        ok: true,
        arrayBuffer: async () => jpeg.buffer.slice(jpeg.byteOffset, jpeg.byteOffset + jpeg.byteLength),
      };
    });

    const result = await fetchAndEncodeSteamCover(10, {
      headerImage: "https://example.com/header.jpg",
      fetchImpl,
      ...noDetect,
    });
    expect(result).not.toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("returns null when no image is available", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) }));
    await expect(fetchAndEncodeSteamCover(999, { fetchImpl })).resolves.toBeNull();
  });

  it("encodeSteamCoverWebp uses attention then falls back to centre on throw", async () => {
    const jpeg = await sharp({
      create: { width: 200, height: 300, channels: 3, background: { r: 20, g: 40, b: 60 } },
    }).jpeg().toBuffer();

    const positions: Array<string | number> = [];
    const encodeResize = vi.fn(async (_bytes: Buffer, position: string | number) => {
      positions.push(position);
      if (position === sharp.strategy.attention) {
        throw new Error("attention failed");
      }
      return sharp(_bytes)
        .resize(512, 512, { fit: "cover", position: "centre" })
        .webp({ quality: 82 })
        .toBuffer();
    });

    const webp = await encodeSteamCoverWebp(jpeg, {
      encodeResize,
      detectTextBoxes: async () => [],
    });
    expect(positions).toEqual([sharp.strategy.attention, "centre"]);
    expect(webp.subarray(0, 4).toString("ascii")).toBe("RIFF");
    const meta = await sharp(webp).metadata();
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
  });

  it("encodeSteamCoverWebp uses text-fit extract when boxes fit", async () => {
    const jpeg = await sharp({
      create: { width: 600, height: 900, channels: 3, background: { r: 10, g: 20, b: 30 } },
    }).jpeg().toBuffer();

    const extracts: Array<{ left: number; top: number; width: number; height: number }> = [];
    const positions: Array<string | number> = [];

    const webp = await encodeSteamCoverWebp(jpeg, {
      detectTextBoxes: async () => [{ x: 200, y: 300, width: 200, height: 80 }],
      encodeExtract: async (bytes, rect) => {
        extracts.push(rect);
        return sharp(bytes).extract(rect).resize(512, 512).webp({ quality: 82 }).toBuffer();
      },
      encodeResize: async (_bytes, position) => {
        positions.push(position);
        throw new Error("should not reach attention");
      },
    });

    expect(extracts).toHaveLength(1);
    expect(extracts[0].width).toBe(extracts[0].height);
    expect(positions).toEqual([]);
    const meta = await sharp(webp).metadata();
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
  });

  it("encodeSteamCoverWebp falls through to attention when detect returns empty", async () => {
    const jpeg = await sharp({
      create: { width: 200, height: 300, channels: 3, background: { r: 20, g: 40, b: 60 } },
    }).jpeg().toBuffer();

    const positions: Array<string | number> = [];
    const webp = await encodeSteamCoverWebp(jpeg, {
      detectTextBoxes: async () => [],
      encodeResize: async (_bytes, position) => {
        positions.push(position);
        if (position === sharp.strategy.attention) throw new Error("attention failed");
        return sharp(_bytes).resize(512, 512, { fit: "cover", position: "centre" }).webp({ quality: 82 }).toBuffer();
      },
    });
    expect(positions).toEqual([sharp.strategy.attention, "centre"]);
    expect(webp.subarray(0, 4).toString("ascii")).toBe("RIFF");
  });

  it("encodeSteamCoverWebp falls through when detect throws", async () => {
    const jpeg = await sharp({
      create: { width: 200, height: 300, channels: 3, background: { r: 20, g: 40, b: 60 } },
    }).jpeg().toBuffer();

    const positions: Array<string | number> = [];
    await encodeSteamCoverWebp(jpeg, {
      detectTextBoxes: async () => {
        throw new Error("detect down");
      },
      encodeResize: async (_bytes, position) => {
        positions.push(position);
        return sharp(_bytes).resize(512, 512, { fit: "cover", position }).webp({ quality: 82 }).toBuffer();
      },
    });
    expect(positions[0]).toBe(sharp.strategy.attention);
  });

  it("encodeSteamCoverWebp uses largest-box text-fit even when all-box union is tall", async () => {
    const jpeg = await sharp({
      create: { width: 600, height: 900, channels: 3, background: { r: 10, g: 20, b: 30 } },
    }).jpeg().toBuffer();

    const logo = { x: 50, y: 700, width: 400, height: 80 };
    const tagline = { x: 10, y: 10, width: 120, height: 20 };
    const extracts: Array<{ left: number; top: number; width: number; height: number }> = [];
    const positions: Array<string | number> = [];
    await encodeSteamCoverWebp(jpeg, {
      detectTextBoxes: async () => [tagline, logo],
      // Focus near logo so merge stays low (no real saliency on flat synthetic)
      attentionFocus: async () => ({ x: 300, y: 740 }),
      encodeExtract: async (bytes, rect) => {
        extracts.push(rect);
        return sharp(bytes).extract(rect).resize(512, 512).webp({ quality: 82 }).toBuffer();
      },
      encodeResize: async (_bytes, position) => {
        positions.push(position);
        return sharp(_bytes).resize(512, 512, { fit: "cover", position }).webp({ quality: 82 }).toBuffer();
      },
    });
    expect(positions).toEqual([]);
    expect(extracts).toHaveLength(1);
    expect(extracts[0].width).toBe(extracts[0].height);
    expect(extracts[0].top).toBeGreaterThan(200);
    expect(extracts[0].top + extracts[0].height).toBeGreaterThanOrEqual(780);
  });

  it("encodeSteamCoverWebp passes EXIF-upright buffer to detect", async () => {
    const jpeg = await sharp({
      create: { width: 600, height: 900, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();

    let detectBytes: Buffer | null = null;
    await encodeSteamCoverWebp(jpeg, {
      detectTextBoxes: async (bytes) => {
        detectBytes = bytes;
        return [];
      },
      encodeResize: async (bytes, position) =>
        sharp(bytes)
          .rotate()
          .resize(512, 512, { fit: "cover", position })
          .webp({ quality: 82 })
          .toBuffer(),
    });

    const upright = await sharp(jpeg).rotate().toBuffer();
    expect(detectBytes).not.toBeNull();
    expect(Buffer.compare(detectBytes!, upright)).toBe(0);
  });

  it("encodeSteamCoverWebp succeeds with real attention crop on portrait JPEG", async () => {
    const jpeg = await sharp({
      create: { width: 600, height: 900, channels: 3, background: { r: 10, g: 20, b: 30 } },
    }).jpeg().toBuffer();

    const webp = await encodeSteamCoverWebp(jpeg, {
      detectTextBoxes: async () => [],
    });
    const meta = await sharp(webp).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
  });
});
