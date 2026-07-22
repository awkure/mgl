import sharp from "sharp";

/**
 * Probe sharp attention focal point in original-image coordinates.
 * @param {Buffer} imageBytes upright image bytes
 * @returns {Promise<{ x: number, y: number } | null>}
 */
export async function attentionFocus(imageBytes) {
  const meta = await sharp(imageBytes).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width <= 0 || height <= 0) return null;

  const side = Math.min(width, height);
  const { info } = await sharp(imageBytes)
    .resize(side, side, { fit: "cover", position: sharp.strategy.attention })
    .toBuffer({ resolveWithObject: true });

  if (typeof info.attentionX === "number" && typeof info.attentionY === "number") {
    return { x: info.attentionX, y: info.attentionY };
  }
  return null;
}
