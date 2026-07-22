/** Fetch Steam cover art and encode to 512×512 WebP for library assets. */

import { createHash } from "node:crypto";
import sharp from "sharp";
import { textFitCoverRect } from "./steamCoverTextFit.mjs";
import { attentionFocus as defaultAttentionFocus } from "./steamCoverAttention.mjs";
import { detectTextBoxes as defaultDetectTextBoxes } from "./steamCoverDetect.mjs";

const CDN_LIBRARY = (appid) =>
  `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function bytesToBase64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

/**
 * @param {Buffer} imageBytes
 * @param {{
 *   encodeResize?: (bytes: Buffer, position: string | number) => Promise<Buffer>
 *   detectTextBoxes?: (bytes: Buffer) => Promise<Array<{ x: number, y: number, width: number, height: number }>>
 *   attentionFocus?: (bytes: Buffer) => Promise<{ x: number, y: number } | null>
 *   encodeExtract?: (bytes: Buffer, rect: { left: number, top: number, width: number, height: number }) => Promise<Buffer>
 * }} [options]
 * @returns {Promise<Buffer>}
 */
export async function encodeSteamCoverWebp(imageBytes, options = {}) {
  const encodeResize =
    options.encodeResize ??
    ((bytes, position) =>
      sharp(bytes)
        .rotate()
        .resize(512, 512, { fit: "cover", position })
        .webp({ quality: 82 })
        .toBuffer());

  const encodeExtract =
    options.encodeExtract ??
    ((bytes, rect) =>
      sharp(bytes)
        .extract(rect)
        .resize(512, 512)
        .webp({ quality: 82 })
        .toBuffer());

  const detectTextBoxes = options.detectTextBoxes ?? defaultDetectTextBoxes;
  const attentionFocus = options.attentionFocus ?? defaultAttentionFocus;

  try {
    const upright = await sharp(imageBytes).rotate().toBuffer();
    const boxes = await detectTextBoxes(upright);
    const meta = await sharp(upright).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    const attention = await attentionFocus(upright);
    const rect = textFitCoverRect(boxes ?? [], { width, height }, { attention });
    if (rect) {
      return await encodeExtract(upright, rect);
    }
  } catch {
    // fall through to attention
  }

  try {
    return await encodeResize(imageBytes, sharp.strategy.attention);
  } catch {
    return await encodeResize(imageBytes, "centre");
  }
}

/**
 * @param {number|string} appid
 * @param {{
 *   headerImage?: string | null
 *   alt?: string
 *   fetchImpl?: typeof fetch
 *   detectTextBoxes?: (bytes: Buffer) => Promise<Array<{ x: number, y: number, width: number, height: number }>>
 *   encodeResize?: (bytes: Buffer, position: string | number) => Promise<Buffer>
 *   encodeExtract?: (bytes: Buffer, rect: { left: number, top: number, width: number, height: number }) => Promise<Buffer>
 *   attentionFocus?: (bytes: Buffer) => Promise<{ x: number, y: number } | null>
 * }} [options]
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

  const { headerImage: _headerImage, alt: _alt, fetchImpl: _fetchImpl, ...encodeOptions } = options;
  const webp = await encodeSteamCoverWebp(imageBytes, encodeOptions);

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
