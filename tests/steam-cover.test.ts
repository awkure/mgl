import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { fetchAndEncodeSteamCover } from "../scripts/lib/steamCover.mjs";

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

    const result = await fetchAndEncodeSteamCover(570, { alt: "Dota 2", fetchImpl });
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
    });
    expect(result).not.toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("returns null when no image is available", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) }));
    await expect(fetchAndEncodeSteamCover(999, { fetchImpl })).resolves.toBeNull();
  });
});
