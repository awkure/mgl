import { placeSquareContaining } from "./steamCoverTextFit.mjs";

/** Max border depth as fraction of that side's length. */
export const FRAME_TRIM_MAX_FRAC = 0.04;

const BORDER_MAD_MAX = 40;
const MEAN_MATCH = 30;
const EDGE_STEP_MIN = 18;

/**
 * @typedef {{ left: number, top: number, width: number, height: number }} ExtractRect
 * @typedef {{ x0: number, y0: number, x1: number, y1: number }} Bounds
 * @typedef {{ left: number, right: number, top: number, bottom: number }} FrameDepths
 */

/**
 * @param {Uint8Array|Buffer} rgba
 * @param {number} width
 * @param {number} height
 * @param {(index: number) => { r: number, g: number, b: number, mad: number } | null} getLineStats
 * @param {number} maxDepth
 * @returns {{ depth: number } | { thick: true }}
 */
function scanDepth(getLineStats, maxDepth) {
  let skip = 0;
  while (skip + 1 <= maxDepth) {
    const a = getLineStats(skip);
    const b = getLineStats(skip + 1);
    if (!a || !b) break;
    if (meanRgbDelta(a, b) >= EDGE_STEP_MIN) skip++;
    else break;
  }

  /** @param {number} i index from trimmed edge */
  const at = (i) => getLineStats(skip + i);

  const stats0 = at(0);
  if (!stats0 || stats0.mad > BORDER_MAD_MAX) {
    return { depth: 0 };
  }

  /** First inward index where the strip ends (consecutive-line step). */
  let exitIndex = null;
  for (let k = 1; ; k++) {
    const sk = at(k);
    const skPrev = at(k - 1);
    if (!sk || !skPrev) break;
    if (meanRgbDelta(skPrev, sk) >= EDGE_STEP_MIN) {
      exitIndex = k;
      break;
    }
  }
  if (exitIndex === null) return { depth: 0 };
  if (skip + exitIndex > maxDepth) {
    if (skip + exitIndex <= 2 * maxDepth + 4) return { thick: true };
    return { depth: 0 };
  }

  let depth = 0;
  /** @type {{ r: number, g: number, b: number } | null} */
  let prevMean = null;

  for (let i = 0; ; i++) {
    const stats = at(i);
    if (!stats) return { depth: skip + depth };

    const isLike =
      stats.mad <= BORDER_MAD_MAX ||
      (prevMean !== null && meanMatch(stats, prevMean));

    if (!isLike) {
      if (depth > 0) {
        const step = meanRgbDelta(prevMean, stats);
        if (step < EDGE_STEP_MIN) return { depth: 0 };
      }
      return { depth: skip + depth };
    }

    if (skip + i > maxDepth) return { thick: true };
    depth++;
    prevMean = stats;
    if (i + 1 >= exitIndex) {
      const inner = at(i + 1);
      if (inner) {
        const step = meanRgbDelta(prevMean, inner);
        if (step < EDGE_STEP_MIN) return { depth: 0 };
      }
      return { depth: skip + depth };
    }
  }
}

/**
 * @param {{ r: number, g: number, b: number }} a
 * @param {{ r: number, g: number, b: number }} b
 */
function meanMatch(a, b) {
  return (
    Math.abs(a.r - b.r) <= MEAN_MATCH &&
    Math.abs(a.g - b.g) <= MEAN_MATCH &&
    Math.abs(a.b - b.b) <= MEAN_MATCH
  );
}

/**
 * @param {{ r: number, g: number, b: number }} a
 * @param {{ r: number, g: number, b: number }} b
 */
function meanRgbDelta(a, b) {
  return (
    (Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b)) / 3
  );
}

/**
 * @param {Uint8Array|Buffer} rgba
 * @param {number} width
 * @param {number} height
 * @param {(coord: number) => number} lineIndex
 * @param {"column" | "row"} axis
 */
function lineStats(rgba, width, height, lineIndex, axis) {
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;

  if (axis === "column") {
    const x = lineIndex;
    if (x < 0 || x >= width) return null;
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * 4;
      sumR += rgba[i];
      sumG += rgba[i + 1];
      sumB += rgba[i + 2];
      count++;
    }
  } else {
    const y = lineIndex;
    if (y < 0 || y >= height) return null;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      sumR += rgba[i];
      sumG += rgba[i + 1];
      sumB += rgba[i + 2];
      count++;
    }
  }

  if (count === 0) return null;

  const r = sumR / count;
  const g = sumG / count;
  const b = sumB / count;

  let madSum = 0;
  if (axis === "column") {
    const x = lineIndex;
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * 4;
      madSum +=
        (Math.abs(rgba[i] - r) +
          Math.abs(rgba[i + 1] - g) +
          Math.abs(rgba[i + 2] - b)) /
        3;
    }
  } else {
    const y = lineIndex;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      madSum +=
        (Math.abs(rgba[i] - r) +
          Math.abs(rgba[i + 1] - g) +
          Math.abs(rgba[i + 2] - b)) /
        3;
    }
  }

  return { r, g, b, mad: madSum / count };
}

/**
 * @param {number} d1
 * @param {number} d2
 * @param {number} maxD
 */
function pairOk(d1, d2, maxD) {
  if (d1 < 1 || d2 < 1) return false;
  if (d1 > maxD || d2 > maxD) return false;
  if (Math.max(d1, d2) > 2 * Math.min(d1, d2) + 2) return false;
  return true;
}

/**
 * Measure frame depths on a square (or rectangle) RGBA buffer (row-major, 4 bytes/pixel).
 * @param {Uint8Array|Buffer} rgba
 * @param {number} width
 * @param {number} height
 * @returns {{ depths: FrameDepths } | { thick: true } | { none: true }}
 */
export function measureFrameDepths(rgba, width, height) {
  const maxDepthX = Math.floor(FRAME_TRIM_MAX_FRAC * width);
  const maxDepthY = Math.floor(FRAME_TRIM_MAX_FRAC * height);

  const leftR = scanDepth(
    (i) => lineStats(rgba, width, height, i, "column"),
    maxDepthX,
  );
  if ("thick" in leftR) return { thick: true };

  const rightR = scanDepth(
    (i) => lineStats(rgba, width, height, width - 1 - i, "column"),
    maxDepthX,
  );
  if ("thick" in rightR) return { thick: true };

  const topR = scanDepth(
    (i) => lineStats(rgba, width, height, i, "row"),
    maxDepthY,
  );
  if ("thick" in topR) return { thick: true };

  const bottomR = scanDepth(
    (i) => lineStats(rgba, width, height, height - 1 - i, "row"),
    maxDepthY,
  );
  if ("thick" in bottomR) return { thick: true };

  const depths = {
    left: leftR.depth,
    right: rightR.depth,
    top: topR.depth,
    bottom: bottomR.depth,
  };

  const lrOk = pairOk(depths.left, depths.right, maxDepthX);
  const tbOk = pairOk(depths.top, depths.bottom, maxDepthY);

  if (!lrOk && !tbOk) return { none: true };

  return {
    depths: {
      left: lrOk ? depths.left : 0,
      right: lrOk ? depths.right : 0,
      top: tbOk ? depths.top : 0,
      bottom: tbOk ? depths.bottom : 0,
    },
  };
}

/**
 * @param {{ width: number, height: number }} size
 * @param {FrameDepths} depths
 * @param {{ must?: Bounds | null }} [options]
 * @returns {ExtractRect | null}
 */
export function localSquareAfterFrameTrim(size, depths, options = {}) {
  const { width, height } = size;
  const x0 = depths.left;
  const y0 = depths.top;
  const x1 = width - depths.right;
  const y1 = height - depths.bottom;
  const innerW = x1 - x0;
  const innerH = y1 - y0;
  const side = Math.min(innerW, innerH);
  if (side < 1) return null;

  const must = options.must ?? null;
  if (must) {
    const clipped = {
      x0: Math.max(must.x0, x0),
      y0: Math.max(must.y0, y0),
      x1: Math.min(must.x1, x1),
      y1: Math.min(must.y1, y1),
    };
    if (clipped.x1 <= clipped.x0 || clipped.y1 <= clipped.y0) return null;

    const focus = {
      x: (clipped.x0 + clipped.x1) / 2,
      y: (clipped.y0 + clipped.y1) / 2,
    };
    const mustInInset = {
      x0: clipped.x0 - x0,
      y0: clipped.y0 - y0,
      x1: clipped.x1 - x0,
      y1: clipped.y1 - y0,
    };
    const inner = placeSquareContaining(
      mustInInset,
      { width: innerW, height: innerH },
      side,
      { x: focus.x - x0, y: focus.y - y0 },
    );
    if (!inner) return null;
    return {
      left: x0 + inner.left,
      top: y0 + inner.top,
      width: inner.width,
      height: inner.height,
    };
  }

  const left = x0 + Math.floor((innerW - side) / 2);
  const top = y0 + Math.floor((innerH - side) / 2);
  return { left, top, width: side, height: side };
}

/**
 * @param {ExtractRect} sourceRect
 * @param {ExtractRect} localSquare
 * @returns {ExtractRect}
 */
export function mapLocalToSource(sourceRect, localSquare) {
  return {
    left: sourceRect.left + localSquare.left,
    top: sourceRect.top + localSquare.top,
    width: localSquare.width,
    height: localSquare.height,
  };
}
