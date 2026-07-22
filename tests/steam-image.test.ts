import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { fetchAndEncodeSteamImage } from "../scripts/lib/steamImage.mjs";

describe("steamImage", () => {
  it("encodes a fetched JPEG into WebP capped by maxEdge", async () => {
    const jpeg = await sharp({
      create: { width: 1920, height: 1080, channels: 3, background: { r: 10, g: 20, b: 30 } },
    }).jpeg().toBuffer();

    const fetchImpl = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => jpeg.buffer.slice(jpeg.byteOffset, jpeg.byteOffset + jpeg.byteLength),
    }));

    const result = await fetchAndEncodeSteamImage("https://cdn.example/shot.jpg", {
      alt: "Shot 1",
      maxEdge: 1280,
      fetchImpl,
    });

    expect(result.asset).toMatchObject({
      kind: "image",
      mime: "image/webp",
      alt: "Shot 1",
    });
    expect(result.asset.width).toBeLessThanOrEqual(1280);
    expect(result.asset.height).toBeLessThanOrEqual(1280);
    expect(result.asset.id).toMatch(/^[0-9a-f]{64}$/);
    expect(Buffer.from(result.base64, "base64").subarray(0, 4).toString("ascii")).toBe("RIFF");
  });

  it("throws when fetch fails", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }));
    await expect(
      fetchAndEncodeSteamImage("https://cdn.example/missing.jpg", { fetchImpl }),
    ).rejects.toThrow(/HTTP 404/);
  });
});
