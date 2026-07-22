/** Fetch a Steam CDN/store image URL and encode to WebP for library assets. */

import { createHash } from "node:crypto";
import sharp from "sharp";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function bytesToBase64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

/**
 * @param {string} url
 * @param {{ alt?: string; maxEdge?: number; fetchImpl?: typeof fetch; originalName?: string }} [options]
 * @returns {Promise<{ asset: object; base64: string }>}
 */
export async function fetchAndEncodeSteamImage(url, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const alt = options.alt ?? "";
  const maxEdge = options.maxEdge ?? 1280;
  const originalName = options.originalName ?? "steam-image.webp";

  let response;
  try {
    response = await fetchImpl(url);
  } catch (cause) {
    throw new Error(`Fetch failed for ${url}: ${cause instanceof Error ? cause.message : cause}`);
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  const imageBytes = Buffer.from(await response.arrayBuffer());
  if (imageBytes.byteLength < 32) {
    throw new Error(`Image too small for ${url}`);
  }

  const { data: webp, info } = await sharp(imageBytes)
    .rotate()
    .resize(maxEdge, maxEdge, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

  const id = sha256(webp);
  return {
    asset: {
      id,
      kind: "image",
      mime: "image/webp",
      width: info.width,
      height: info.height,
      byteLength: webp.byteLength,
      alt,
      originalName,
    },
    base64: bytesToBase64(webp),
  };
}
