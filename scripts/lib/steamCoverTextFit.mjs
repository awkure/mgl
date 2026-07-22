export const TEXT_FIT_PAD = 0.08;

/**
 * @param {{ x: number, y: number, width: number, height: number }[]} boxes
 * @param {{ width: number, height: number }} imageSize
 * @returns {{ left: number, top: number, width: number, height: number } | null}
 */
export function textFitSquare(boxes, imageSize) {
  const W = imageSize.width;
  const H = imageSize.height;
  if (!boxes.length || W <= 0 || H <= 0) return null;

  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const b of boxes) {
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.width);
    y1 = Math.max(y1, b.y + b.height);
  }

  const unionW = x1 - x0;
  const unionH = y1 - y0;
  if (unionW <= 0 || unionH <= 0) return null;

  const p = TEXT_FIT_PAD * Math.max(unionW, unionH);
  let px0 = Math.max(0, x0 - p);
  let py0 = Math.max(0, y0 - p);
  let px1 = Math.min(W, x1 + p);
  let py1 = Math.min(H, y1 + p);

  const paddedW = px1 - px0;
  const paddedH = py1 - py0;
  const side = Math.max(paddedW, paddedH);
  if (side > Math.min(W, H)) return null;

  const cx = (px0 + px1) / 2;
  const cy = (py0 + py1) / 2;
  let left = cx - side / 2;
  let top = cy - side / 2;
  left = Math.min(Math.max(0, left), W - side);
  top = Math.min(Math.max(0, top), H - side);

  // Must still cover padded union
  if (left > px0 + 1e-6 || top > py0 + 1e-6 || left + side < px1 - 1e-6 || top + side < py1 - 1e-6) {
    return null;
  }

  const leftI = Math.floor(left);
  const topI = Math.floor(top);
  const sideI = Math.floor(side);
  if (sideI <= 0 || leftI + sideI > W || topI + sideI > H) return null;

  return { left: leftI, top: topI, width: sideI, height: sideI };
}
