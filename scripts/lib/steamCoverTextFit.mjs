export const TEXT_FIT_PAD = 0.08;
/** Extra space below logo when south-pinning — keep small so title sits flush south. */
export const TEXT_FIT_PAD_BOTTOM = 0.02;
/** Logo line should not be taller than this fraction of image height. */
export const LOGO_MAX_HEIGHT_FRAC = 0.15;
/** Prefer logos at least this wide (fraction of image width). */
export const LOGO_MIN_WIDTH_FRAC = 0.35;
/** Reject boxes whose centre sits in the bottom footer band. */
export const LOGO_FOOTER_CENTRE_FRAC = 0.88;

/**
 * @typedef {{ x: number, y: number, width: number, height: number }} TextBox
 * @typedef {{ left: number, top: number, width: number, height: number }} ExtractRect
 * @typedef {{ x: number, y: number }} Point
 * @typedef {{ x0: number, y0: number, x1: number, y1: number }} Bounds
 */

/**
 * @param {TextBox[]} boxes
 * @returns {Bounds | null}
 */
function unionBounds(boxes) {
  if (!boxes.length) return null;
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
  if (!(x1 > x0) || !(y1 > y0)) return null;
  return { x0, y0, x1, y1 };
}

/**
 * Symmetric pad (legacy / generic square fit).
 * @param {Bounds} union
 * @param {{ width: number, height: number }} imageSize
 * @returns {Bounds}
 */
function padBounds(union, imageSize) {
  const W = imageSize.width;
  const H = imageSize.height;
  const unionW = union.x1 - union.x0;
  const unionH = union.y1 - union.y0;
  const p = TEXT_FIT_PAD * Math.max(unionW, unionH);
  return {
    x0: Math.max(0, union.x0 - p),
    y0: Math.max(0, union.y0 - p),
    x1: Math.min(W, union.x1 + p),
    y1: Math.min(H, union.y1 + p),
  };
}

/**
 * Pad for logo must-region: normal side/top pad, smaller bottom pad (flush south).
 * @param {Bounds} union
 * @param {{ width: number, height: number }} imageSize
 * @returns {Bounds}
 */
export function padBoundsLogo(union, imageSize) {
  const W = imageSize.width;
  const H = imageSize.height;
  const unionW = union.x1 - union.x0;
  const unionH = union.y1 - union.y0;
  const span = Math.max(unionW, unionH);
  const p = TEXT_FIT_PAD * span;
  const pBottom = TEXT_FIT_PAD_BOTTOM * span;
  return {
    x0: Math.max(0, union.x0 - p),
    y0: Math.max(0, union.y0 - p),
    x1: Math.min(W, union.x1 + p),
    y1: Math.min(H, union.y1 + pBottom),
  };
}

/**
 * Largest box by area.
 * @param {TextBox[]} boxes
 * @returns {TextBox | null}
 */
export function largestTextBox(boxes) {
  let best = null;
  let bestArea = -1;
  for (const b of boxes) {
    const area = b.width * b.height;
    if (area > bestArea) {
      bestArea = area;
      best = b;
    }
  }
  return best;
}

/**
 * @param {TextBox} box
 * @param {{ width: number, height: number }} imageSize
 */
function isTitleLike(box, imageSize) {
  const W = imageSize.width;
  const H = imageSize.height;
  if (W <= 0 || H <= 0) return false;
  if (box.width < LOGO_MIN_WIDTH_FRAC * W) return false;
  if (box.height > LOGO_MAX_HEIGHT_FRAC * H) return false;
  const cy = box.y + box.height / 2;
  // Publisher footers (e.g. "A NEW BLOOD PRODUCTION") sit under the title.
  if (cy >= LOGO_FOOTER_CENTRE_FRAC * H) return false;
  return true;
}

/**
 * Pick primary logo box: prefer wide, short title lines in the lower half of the image.
 * Among substantial candidates, prefer the highest (title sits above credit slabs).
 * Falls back to largest area if no title-like candidate exists.
 * @param {TextBox[]} boxes
 * @param {{ width: number, height: number }} imageSize
 * @returns {TextBox | null}
 */
export function pickLogoTextBox(boxes, imageSize) {
  if (!boxes.length) return null;
  const H = imageSize.height;
  const lower = boxes.filter((b) => b.y + b.height / 2 >= H * 0.45);
  const pool = lower.length ? lower : boxes;

  const candidates = pool.filter((b) => isTitleLike(b, imageSize));
  if (!candidates.length) {
    return largestTextBox(pool) ?? largestTextBox(boxes);
  }

  let maxArea = 0;
  for (const b of candidates) {
    maxArea = Math.max(maxArea, b.width * b.height);
  }
  // Keep boxes that are a real logo-sized chunk, not tiny taglines under the title.
  const substantial = candidates.filter((b) => b.width * b.height >= maxArea * 0.7);
  substantial.sort((a, b) => a.y - b.y || b.width * b.height - a.width * a.height);
  return substantial[0] ?? largestTextBox(candidates);
}

/**
 * Square covering the given boxes' union + pad, or null if that square cannot fit.
 * @param {TextBox[]} boxes
 * @param {{ width: number, height: number }} imageSize
 * @returns {ExtractRect | null}
 */
export function textFitSquare(boxes, imageSize) {
  const W = imageSize.width;
  const H = imageSize.height;
  if (!boxes.length || W <= 0 || H <= 0) return null;

  const union = unionBounds(boxes);
  if (!union) return null;
  const padded = padBounds(union, imageSize);

  const paddedW = padded.x1 - padded.x0;
  const paddedH = padded.y1 - padded.y0;
  const side = Math.max(paddedW, paddedH);
  if (side > Math.min(W, H)) return null;

  return placeSquareContaining(padded, { width: W, height: H }, side, {
    x: (padded.x0 + padded.x1) / 2,
    y: (padded.y0 + padded.y1) / 2,
  });
}

/**
 * When the target box still cannot fit in a square: short-side square anchored to keep
 * the bottom of that box in frame.
 * @param {TextBox[]} boxes
 * @param {{ width: number, height: number }} imageSize
 * @returns {ExtractRect | null}
 */
export function textFitSouthSquare(boxes, imageSize) {
  const W = imageSize.width;
  const H = imageSize.height;
  if (!boxes.length || W <= 0 || H <= 0) return null;

  const union = unionBounds(boxes);
  if (!union) return null;
  const padded = padBoundsLogo(union, imageSize);
  const side = Math.min(W, H);
  if (side <= 0) return null;

  const bottom = padded.y1;
  let top = bottom - side;
  if (top < 0) top = 0;
  if (top + side > H) top = H - side;

  const cx = (padded.x0 + padded.x1) / 2;
  let left = cx - side / 2;
  left = Math.min(Math.max(0, left), W - side);

  const leftI = Math.floor(left);
  const topI = Math.floor(top);
  const sideI = Math.floor(side);
  if (sideI <= 0 || leftI + sideI > W || topI + sideI > H) return null;

  return { left: leftI, top: topI, width: sideI, height: sideI };
}

/**
 * Place a square of `side` that contains `must`, preferring centre near `focus`.
 * @param {Bounds} must
 * @param {{ width: number, height: number }} imageSize
 * @param {number} side
 * @param {Point} focus
 * @returns {ExtractRect | null}
 */
export function placeSquareContaining(must, imageSize, side, focus) {
  const W = imageSize.width;
  const H = imageSize.height;
  if (side <= 0 || side > Math.min(W, H)) return null;
  if (must.x1 - must.x0 > side + 1e-6 || must.y1 - must.y0 > side + 1e-6) return null;

  const leftMin = Math.max(0, must.x1 - side);
  const leftMax = Math.min(must.x0, W - side);
  const topMin = Math.max(0, must.y1 - side);
  const topMax = Math.min(must.y0, H - side);
  if (leftMin > leftMax + 1e-6 || topMin > topMax + 1e-6) return null;

  let left = focus.x - side / 2;
  let top = focus.y - side / 2;
  left = Math.min(Math.max(leftMin, left), leftMax);
  top = Math.min(Math.max(topMin, top), topMax);

  const leftI = Math.floor(left);
  const topI = Math.floor(top);
  const sideI = Math.floor(side);
  if (sideI <= 0 || leftI + sideI > W || topI + sideI > H) return null;

  return { left: leftI, top: topI, width: sideI, height: sideI };
}

/**
 * Valid ranges for a square of `side` that still contains `must`.
 * @param {Bounds} must
 * @param {{ width: number, height: number }} imageSize
 * @param {number} side
 * @returns {{ leftMin: number, leftMax: number, topMin: number, topMax: number } | null}
 */
function squareRangeContaining(must, imageSize, side) {
  const W = imageSize.width;
  const H = imageSize.height;
  if (side <= 0 || side > Math.min(W, H)) return null;
  if (must.x1 - must.x0 > side + 1e-6 || must.y1 - must.y0 > side + 1e-6) return null;

  const leftMin = Math.max(0, must.x1 - side);
  const leftMax = Math.min(must.x0, W - side);
  const topMin = Math.max(0, must.y1 - side);
  const topMax = Math.min(must.y0, H - side);
  if (leftMin > leftMax + 1e-6 || topMin > topMax + 1e-6) return null;
  return { leftMin, leftMax, topMin, topMax };
}

/**
 * Logo must stay in frame. Vertical placement from attention vs logo:
 * - attention above logo → push text to south edge of crop (room above for subject)
 * - attention below logo → push text to north edge of crop (room below for subject)
 * Horizontal: still clamp toward attention.x within the valid range.
 * @param {Bounds} must
 * @param {{ width: number, height: number }} imageSize
 * @param {number} side
 * @param {Point | null | undefined} attention
 * @returns {ExtractRect | null}
 */
export function placeSquareLogoAttention(must, imageSize, side, attention) {
  const range = squareRangeContaining(must, imageSize, side);
  if (!range) return null;

  const { leftMin, leftMax, topMin, topMax } = range;
  const logoCx = (must.x0 + must.x1) / 2;
  const logoCy = (must.y0 + must.y1) / 2;

  let top;
  if (attention && Number.isFinite(attention.y)) {
    if (attention.y < logoCy) {
      top = topMin; // text at south of crop
    } else if (attention.y > logoCy) {
      top = topMax; // text at north of crop
    } else {
      top = Math.min(Math.max(topMin, logoCy - side / 2), topMax);
    }
  } else {
    top = Math.min(Math.max(topMin, logoCy - side / 2), topMax);
  }

  const focusX = attention && Number.isFinite(attention.x) ? attention.x : logoCx;
  let left = focusX - side / 2;
  left = Math.min(Math.max(leftMin, left), leftMax);

  const leftI = Math.floor(left);
  const topI = Math.floor(top);
  const sideI = Math.floor(side);
  const W = imageSize.width;
  const H = imageSize.height;
  if (sideI <= 0 || leftI + sideI > W || topI + sideI > H) return null;

  return { left: leftI, top: topI, width: sideI, height: sideI };
}

/**
 * Crop around title-like logo box; vertical edge pinned by attention direction.
 * @param {TextBox[]} boxes
 * @param {{ width: number, height: number }} imageSize
 * @param {{ attention?: Point | null }} [options]
 * @returns {ExtractRect | null}
 */
export function textFitCoverRect(boxes, imageSize, options = {}) {
  const logo = pickLogoTextBox(boxes, imageSize);
  if (!logo) return null;

  const union = unionBounds([logo]);
  if (!union) return null;
  const must = padBoundsLogo(union, imageSize);
  const side = Math.min(imageSize.width, imageSize.height);

  return (
    placeSquareLogoAttention(must, imageSize, side, options.attention ?? null) ??
    textFitSquare([logo], imageSize) ??
    textFitSouthSquare([logo], imageSize)
  );
}

/** @param {ExtractRect} rect @param {TextBox} box */
export function rectContainsBox(rect, box, epsilon = 1) {
  return (
    rect.left <= box.x + epsilon &&
    rect.top <= box.y + epsilon &&
    rect.left + rect.width >= box.x + box.width - epsilon &&
    rect.top + rect.height >= box.y + box.height - epsilon
  );
}
