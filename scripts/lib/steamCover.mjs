/** Fetch Steam cover art and encode to 512×512 WebP for library assets. */

import { createHash } from "node:crypto";
import sharp from "sharp";
import {
  padBoundsLogo,
  pickLogoTextBox,
  textFitCoverRect,
} from "./steamCoverTextFit.mjs";
import { attentionFocus as defaultAttentionFocus } from "./steamCoverAttention.mjs";
import { detectTextBoxes as defaultDetectTextBoxes } from "./steamCoverDetect.mjs";
import {
  localSquareAfterFrameTrim,
  mapLocalToSource,
  measureFrameDepths,
} from "./steamCoverFrameTrim.mjs";

const CDN_LIBRARY = (appid) =>
  `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function bytesToBase64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

/**
 * @param {number} width
 * @param {number} height
 * @param {{ x?: number, y?: number } | null} focus
 */
function shortSideCoverRect(width, height, focus) {
  const side = Math.min(width, height);
  let left = Math.floor((focus?.x ?? width / 2) - side / 2);
  let top = Math.floor((focus?.y ?? height / 2) - side / 2);
  left = Math.min(Math.max(0, left), width - side);
  top = Math.min(Math.max(0, top), height - side);
  return { left, top, width: side, height: side };
}

/**
 * @param {Buffer} upright
 * @param {{ left: number, top: number, width: number, height: number }} rect
 * @param {{ x0: number, y0: number, x1: number, y1: number } | null} mustSource
 * @param {{ x0: number, y0: number, x1: number, y1: number } | null} [mustFitLocal]
 */
async function trimCoverRect(upright, rect, mustSource, mustFitLocal = null) {
  let finalRect = rect;
  try {
    const crop = await sharp(upright)
      .extract(rect)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const measured = measureFrameDepths(crop.data, crop.info.width, crop.info.height);
    if ("depths" in measured) {
      const mustLocal = mustSource
        ? {
            x0: mustSource.x0 - rect.left,
            y0: mustSource.y0 - rect.top,
            x1: mustSource.x1 - rect.left,
            y1: mustSource.y1 - rect.top,
          }
        : null;
      let depths = { ...measured.depths };
      if (mustFitLocal) {
        depths = {
          left: Math.min(depths.left, Math.max(0, Math.floor(mustFitLocal.x0))),
          right: Math.min(depths.right, Math.max(0, Math.floor(crop.info.width - mustFitLocal.x1))),
          top: Math.min(depths.top, Math.max(0, Math.floor(mustFitLocal.y0))),
          bottom: Math.min(
            depths.bottom,
            Math.max(0, Math.floor(crop.info.height - mustFitLocal.y1)),
          ),
        };
      }
      const local = localSquareAfterFrameTrim(
        { width: crop.info.width, height: crop.info.height },
        depths,
        { must: mustLocal },
      );
      if (local) finalRect = mapLocalToSource(rect, local);
    }
  } catch {
    // keep rect
  }
  return finalRect;
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
    const imageSize = { width, height };
    const rect = textFitCoverRect(boxes ?? [], imageSize, { attention });
    if (rect) {
      let mustSource = null;
      let mustFitLocal = null;
      const logo = pickLogoTextBox(boxes ?? [], imageSize);
      if (logo) {
        mustSource = padBoundsLogo(
          {
            x0: logo.x,
            y0: logo.y,
            x1: logo.x + logo.width,
            y1: logo.y + logo.height,
          },
          imageSize,
        );
        mustFitLocal = {
          x0: logo.x - rect.left,
          y0: logo.y - rect.top,
          x1: logo.x + logo.width - rect.left,
          y1: logo.y + logo.height - rect.top,
        };
      }
      const finalRect = await trimCoverRect(upright, rect, mustSource, mustFitLocal);
      return await encodeExtract(upright, finalRect);
    }
  } catch {
    // fall through to attention materialize
  }

  try {
    const upright = await sharp(imageBytes).rotate().toBuffer();
    const meta = await sharp(upright).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    const attention = await attentionFocus(upright);
    let rect = shortSideCoverRect(width, height, attention);
    rect = await trimCoverRect(upright, rect, null);
    return await encodeExtract(upright, rect);
  } catch {
    try {
      return await encodeResize(imageBytes, sharp.strategy.attention);
    } catch {
      return await encodeResize(imageBytes, "centre");
    }
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
