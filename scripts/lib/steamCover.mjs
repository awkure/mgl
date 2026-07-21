/** Fetch Steam cover art and encode to 512×512 WebP for library assets. */

import { createHash } from "node:crypto";
import sharp from "sharp";

const CDN_LIBRARY = (appid) =>
  `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function bytesToBase64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

/**
 * @param {number|string} appid
 * @param {{ headerImage?: string | null; alt?: string; fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<null | { asset: object; base64: string }>}
 */
export async function fetchAndEncodeSteamCover(appid, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const alt = options.alt ?? `Steam ${appid}`;
  const urls = [CDN_LIBRARY(appid)];
  if (options.headerImage) urls.push(options.headerImage);

  let imageBytes = null;
  for (const url of urls) {
    try {
      const response = await fetchImpl(url);
      if (!response.ok) continue;
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength < 32) continue;
      imageBytes = buffer;
      break;
    } catch {
      // try next URL
    }
  }
  if (!imageBytes) return null;

  const webp = await sharp(imageBytes)
    .rotate()
    .resize(512, 512, { fit: "cover", position: "centre" })
    .webp({ quality: 82 })
    .toBuffer();

  const id = sha256(webp);
  return {
    asset: {
      id,
      kind: "image",
      mime: "image/webp",
      width: 512,
      height: 512,
      byteLength: webp.byteLength,
      alt,
      originalName: `steam-${appid}.webp`,
    },
    base64: bytesToBase64(webp),
  };
}
