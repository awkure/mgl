# Steam Cover Frame Trim Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After the OCR/attention square crop is chosen, detect a thin opposite-edge picture frame and zoom the extract so the frame is gone from the final 512×512 WebP (ULTRAKILL side pillars).

**Architecture:** Pure helper scans RGBA of the chosen square for L/R/T/B border depths (≤4%, opposite-pair gate, thick → abort). Re-squares inside the inset while keeping the OCR logo must-region when present. `encodeSteamCoverWebp` applies trim after `textFitCoverRect` (and on materialized attention/centre extract rects) before `encodeExtract`.

**Tech Stack:** Node ESM, `sharp` (raw pixels), Vitest. No new deps.

**Spec:** `docs/superpowers/specs/2026-07-22-steam-cover-frame-trim-design.md`

## Global Constraints

- Run **after** square `ExtractRect` is chosen; before 512 WebP encode
- Frame = **(L and R)** and/or **(T and B)** both have depth ≥ 1px
- Max depth per edge = `floor(0.04 * side)`; strip still border-like past that → **skip entire trim**
- Only apply depths from qualifying pairs
- Final square must still contain OCR logo must-region when one exists; else skip trim
- CLI encode only; SPA `prepareImage` unchanged
- Unit tests: synthetic RGBA buffers + existing ULTRAKILL fixture; no new packages
- Do not commit `.cursor/` skills; leave unrelated dirty files alone

## File map

| Path | Responsibility |
|---|---|
| `scripts/lib/steamCoverFrameTrim.mjs` | Pure: measure depths + inset/re-square (or skip) |
| `scripts/lib/steamCover.mjs` | After rect chosen: load crop RGBA → trim → extract |
| `tests/steam-cover-frame-trim.test.ts` | Synthetic frame / thick / one-sided / logo safety |
| `tests/steam-cover-ultrakill.test.ts` | Fixture: pillars gone, logo still in crop |
| `docs/superpowers/specs/2026-07-22-steam-cover-frame-trim-design.md` | Already written — update only if thresholds diverge |

---

### Task 1: Frame depth measurement + trim geometry (pure)

**Files:**
- Create: `scripts/lib/steamCoverFrameTrim.mjs`
- Create: `tests/steam-cover-frame-trim.test.ts`

**Interfaces:**
- Produces:
```js
/** Max border depth as fraction of that side's length. */
export const FRAME_TRIM_MAX_FRAC = 0.04;

/**
 * @typedef {{ left: number, top: number, width: number, height: number }} ExtractRect
 * @typedef {{ x0: number, y0: number, x1: number, y1: number }} Bounds
 * @typedef {{ left: number, right: number, top: number, bottom: number }} FrameDepths
 */

/**
 * Measure frame depths on a square (or rectangle) RGBA buffer (row-major, 4 bytes/pixel).
 * @param {Uint8Array|Buffer} rgba
 * @param {number} width
 * @param {number} height
 * @returns {{ depths: FrameDepths } | { thick: true } | { none: true }}
 *   - `thick` if any edge is still border-like past max depth
 *   - `none` if no opposite pair qualifies
 *   - else `depths` with only qualifying-pair sides non-zero (other pair zeroed)
 */
export function measureFrameDepths(rgba, width, height);

/**
 * Inset `rect` by `depths` (in the same coordinate space as the measured buffer,
 * i.e. local 0..width / 0..height when measuring a crop), then take largest square
 * inside the inset. If `must` is set (local coords) and cannot fit → return null.
 * @param {{ width: number, height: number }} size  // measured buffer size
 * @param {FrameDepths} depths
 * @param {{ must?: Bounds | null }} [options]
 * @returns {ExtractRect | null} local extract inside the measured buffer
 */
export function localSquareAfterFrameTrim(size, depths, options = {});

/**
 * Map local trim square back onto a source extract rect.
 * @param {ExtractRect} sourceRect
 * @param {ExtractRect} localSquare
 * @returns {ExtractRect}
 */
export function mapLocalToSource(sourceRect, localSquare);
```

**Detection rules (lock in code + tests):**

1. `maxDepthX = Math.floor(FRAME_TRIM_MAX_FRAC * width)`, `maxDepthY = Math.floor(FRAME_TRIM_MAX_FRAC * height)`.
2. For each edge, walk inward one line at a time (columns L/R, rows T/B).
3. Per line: mean RGB + mean absolute deviation (MAD) across the line.
4. Line is border-like if:
   - MAD ≤ `BORDER_MAD_MAX` (start **28**; tune only if ULTRAKILL fails), **or** mean RGB within `MEAN_MATCH` (start **30**) of the previous border line’s mean; **and**
   - when comparing the candidate border band to the next inward line, mean abs RGB delta ≥ `EDGE_STEP_MIN` (start **18**) **at the exit** (use the step between last border line and first interior line).
5. While scanning: if index `> maxDepth` and line still border-like → return `{ thick: true }`.
6. Depth = count of consecutive border-like lines from the edge (0 if first line not border-like).
7. Opposite depths similar: if both > 0 and `max(d1,d2) > 2 * min(d1,d2) + 2` → treat pair as not OK (asymmetric junk).
8. Pair OK: both depths ≥ 1 and ≤ max for that axis.
9. If L/R OK and/or T/B OK → return depths with non-qualifying pair zeroed. Else `{ none: true }`.

**Re-square:**
- Inset: `x0=L, y0=T, x1=width-R, y1=height-B`.
- `side = min(x1-x0, y1-y0)`; if `side < 1` → null.
- If `must`: use existing `placeSquareContaining` from `steamCoverTextFit.mjs` with focus = must centre (import it). If null → return null.
- Else: centre square in inset (`left = x0 + floor((innerW-side)/2)`, same for top).

- [ ] **Step 1: Write failing tests**

Create `tests/steam-cover-frame-trim.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  FRAME_TRIM_MAX_FRAC,
  measureFrameDepths,
  localSquareAfterFrameTrim,
  mapLocalToSource,
} from "../scripts/lib/steamCoverFrameTrim.mjs";

/** Build RGBA: solid red frame inset of `fw` px, grey interior. */
function framedRgba(size: number, fw: number) {
  const rgba = Buffer.alloc(size * size * 4, 0);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const border = x < fw || x >= size - fw || y < fw || y >= size - fw;
      if (border) {
        rgba[i] = 200; rgba[i + 1] = 20; rgba[i + 2] = 20; rgba[i + 3] = 255;
      } else {
        rgba[i] = 40; rgba[i + 1] = 40; rgba[i + 2] = 50; rgba[i + 3] = 255;
      }
    }
  }
  return rgba;
}

describe("measureFrameDepths", () => {
  it("exports 4% cap", () => {
    expect(FRAME_TRIM_MAX_FRAC).toBe(0.04);
  });

  it("detects thin 4-side frame (~3%)", () => {
    const size = 200;
    const fw = 6; // 3%
    const r = measureFrameDepths(framedRgba(size, fw), size, size);
    expect(r).toMatchObject({
      depths: { left: fw, right: fw, top: fw, bottom: fw },
    });
  });

  it("returns thick when border exceeds 4%", () => {
    const size = 200;
    const fw = 12; // 6% > 4%
    expect(measureFrameDepths(framedRgba(size, fw), size, size)).toEqual({ thick: true });
  });

  it("returns none when only left side is bordered", () => {
    const size = 100;
    const rgba = Buffer.alloc(size * size * 4, 40);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < 4; x++) {
        const i = (y * size + x) * 4;
        rgba[i] = 200; rgba[i + 1] = 20; rgba[i + 2] = 20; rgba[i + 3] = 255;
      }
      for (let x = 4; x < size; x++) {
        rgba[(y * size + x) * 4 + 3] = 255;
      }
    }
    expect(measureFrameDepths(rgba, size, size)).toEqual({ none: true });
  });
});

describe("localSquareAfterFrameTrim", () => {
  it("returns inset square for L/R+T/B depths", () => {
    const size = 200;
    const depths = { left: 6, right: 6, top: 6, bottom: 6 };
    const local = localSquareAfterFrameTrim({ width: size, height: size }, depths);
    expect(local).not.toBeNull();
    expect(local!.width).toBe(local!.height);
    expect(local!.width).toBe(188);
    expect(local!.left).toBe(6);
    expect(local!.top).toBe(6);
  });

  it("returns null when must-region cannot fit after inset", () => {
    const size = 100;
    const depths = { left: 4, right: 4, top: 4, bottom: 4 };
    // must spans almost full pre-inset width → cannot fit in side 92
    const must = { x0: 0, y0: 40, x1: 100, y1: 60 };
    expect(localSquareAfterFrameTrim({ width: size, height: size }, depths, { must })).toBeNull();
  });

  it("mapLocalToSource offsets into source rect", () => {
    expect(
      mapLocalToSource(
        { left: 10, top: 20, width: 200, height: 200 },
        { left: 6, top: 6, width: 188, height: 188 },
      ),
    ).toEqual({ left: 16, top: 26, width: 188, height: 188 });
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run tests/steam-cover-frame-trim.test.ts`  
Expected: FAIL (module missing)

- [ ] **Step 3: Implement `scripts/lib/steamCoverFrameTrim.mjs`**

Implement exports above. Import `placeSquareContaining` from `./steamCoverTextFit.mjs` for must-region placement. Keep helpers private (`lineStats`, `scanDepth`).

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run tests/steam-cover-frame-trim.test.ts`  
Expected: PASS  
If synthetic MAD/step thresholds miss solid frames, tighten `BORDER_MAD_MAX` / `EDGE_STEP_MIN` only as needed; do not raise `FRAME_TRIM_MAX_FRAC`.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/steamCoverFrameTrim.mjs tests/steam-cover-frame-trim.test.ts
git commit -m "$(cat <<'EOF'
feat(steam): measure thin cover frame depths

Opposite-edge strip scan with 4% thick-mat abort and
re-square helper for post-crop zoom.

EOF
)"
```

---

### Task 2: Wire trim into encode + ULTRAKILL regression

**Files:**
- Modify: `scripts/lib/steamCover.mjs`
- Modify: `tests/steam-cover-ultrakill.test.ts`
- Modify: `tests/steam-cover.test.ts` (encode path still works; inject stays valid)
- Optional note in: `docs/superpowers/specs/2026-07-22-steam-cover-frame-trim-design.md` if threshold constants exported differ from narrative

**Interfaces:**
- Consumes: `measureFrameDepths`, `localSquareAfterFrameTrim`, `mapLocalToSource` from Task 1
- Consumes: logo must-region — when OCR path runs, compute padded logo bounds in **source** coords (reuse `padBoundsLogo` + logo box from text-fit; export a small helper or duplicate pad call). Map must into **local** crop coords:  
  `mustLocal = { x0: must.x0 - rect.left, y0: must.y0 - rect.top, x1: must.x1 - rect.left, y1: must.y1 - rect.top }`
- Produces: `encodeSteamCoverWebp` final extract may be tighter than `textFitCoverRect` alone

**Encode change (OCR success path):**

```js
// after const rect = textFitCoverRect(...)
if (rect) {
  let finalRect = rect;
  try {
    const crop = await sharp(upright).extract(rect).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
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
      const local = localSquareAfterFrameTrim(
        { width: crop.info.width, height: crop.info.height },
        measured.depths,
        { must: mustLocal },
      );
      if (local) finalRect = mapLocalToSource(rect, local);
    }
  } catch {
    // keep rect
  }
  return await encodeExtract(upright, finalRect);
}
```

Build `mustSource` from the same logo used in `textFitCoverRect` — either:
- change `textFitCoverRect` to also return `{ rect, must }` (prefer minimal API break: add `textFitCoverPlan` that returns `{ rect, must }` and keep `textFitCoverRect` as `plan?.rect`), **or**
- re-call `pickLogoTextBox` + `padBoundsLogo` in `steamCover.mjs` (acceptable duplication for one call).

**Attention/centre fallback:** materialize cover square via sharp attention metadata if available (`attentionX`/`attentionY` + `min(W,H)` side), else centred short-side square; run same trim; `encodeExtract`. If materialize is too invasive for one task, ship OCR-path trim first and add fallback materialize in a follow-up commit inside this same task only if time — **spec preference is uniform trim**; implement materialize:

```js
function shortSideCoverRect(width, height, focus) {
  const side = Math.min(width, height);
  let left = Math.floor((focus?.x ?? width / 2) - side / 2);
  let top = Math.floor((focus?.y ?? height / 2) - side / 2);
  left = Math.min(Math.max(0, left), width - side);
  top = Math.min(Math.max(0, top), height - side);
  return { left, top, width: side, height: side };
}
```

Use attention focus when falling back; else centre. Then trim + extract (stop using `encodeResize` for the happy path). Keep `encodeResize` only if extract throws.

- [ ] **Step 1: Extend ULTRAKILL test — failing expectation on pillars**

In `tests/steam-cover-ultrakill.test.ts`, add:

```ts
it("frame trim removes left/right pillars from encoded cover", async () => {
  const webp = await encodeSteamCoverWebp(jpeg, {
    detectTextBoxes: async () => snapshot.boxes,
    attentionFocus: async () => ({ x: 262, y: 182 }),
  });
  const { data, info } = await sharp(webp).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  // Sample near left edge vs inward: after trim, edge should look like interior art, not solid red matte strip.
  // Use mean R of a 4px column at x=2 vs x=40; pillar was high-R / low-G — after trim, columns should be closer.
  function colMean(x: number) {
    let r = 0, g = 0, b = 0;
    for (let y = 0; y < info.height; y++) {
      const i = (y * info.width + x) * 4;
      r += data[i]; g += data[i + 1]; b += data[i + 2];
    }
    const n = info.height;
    return { r: r / n, g: g / n, b: b / n };
  }
  const edge = colMean(2);
  const inward = colMean(40);
  // Red pillar: edge.r >> edge.g. After trim, edge should not be a flat red matte.
  expect(edge.r - edge.g).toBeLessThan(120);
  // And left edge should not be dramatically redder-only than inward in a frame-like way
  expect(Math.abs(edge.r - inward.r)).toBeLessThan(80);
});
```

Also update the encode inject test: `encodeExtract` may be called with a **tighter** rect than `top: 60` full short side — assert `rectContainsBox` for logo still holds and `extracts[0].width < 300` **or** `extracts[0].left > 0` after trim (fixture crop is full width 300; after L/R trim left > 0 or width < 300).

Exact assertion after probing once:

```ts
expect(extracts[0].left + extracts[0].width).toBeLessThanOrEqual(300);
expect(extracts[0].width).toBeLessThan(300); // zoomed
expect(rectContainsBox(
  // logo in source coords vs extract
  extracts[0],
  logo,
)).toBe(true);
```

- [ ] **Step 2: Run ULTRAKILL test — expect FAIL** (no trim yet or pillars remain)

Run: `npx vitest run tests/steam-cover-ultrakill.test.ts`  
Expected: FAIL on new pillar assertion

- [ ] **Step 3: Wire `steamCover.mjs`**

Implement OCR-path trim + attention/centre materialized rect + trim as above. Export nothing new unless tests need it.

Tune `BORDER_MAD_MAX` / `EDGE_STEP_MIN` against ULTRAKILL fixture crop if Task 1 constants miss distressed red (allow higher MAD for grit, keep step + opposite pair).

- [ ] **Step 4: Run cover tests**

Run: `npx vitest run tests/steam-cover-frame-trim.test.ts tests/steam-cover-ultrakill.test.ts tests/steam-cover.test.ts tests/steam-cover-text-fit.test.ts`  
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/steamCover.mjs scripts/lib/steamCoverFrameTrim.mjs \
  tests/steam-cover-ultrakill.test.ts tests/steam-cover.test.ts \
  tests/steam-cover-frame-trim.test.ts
git commit -m "$(cat <<'EOF'
feat(steam): zoom cover crop past thin frames

After OCR/attention square, strip opposite-edge mats ≤4%
and re-square; keep logo must-region. Fixes ULTRAKILL pillars.

EOF
)"
```

---

### Task 3: Spec touch-up + smoke (optional if thresholds changed)

**Files:**
- Modify: `docs/superpowers/specs/2026-07-22-steam-cover-frame-trim-design.md` — only if exported constants or encode fallback materialize need a one-line decision note

- [ ] **Step 1:** If code exported `BORDER_MAD_MAX` etc., add a short “Implementation constants” bullet under Detection detail pointing at `steamCoverFrameTrim.mjs`.

- [ ] **Step 2:** Manual smoke (agent or human):

```bash
just steam-import-covers --force --appids 1229490
```

Open new `public/media/<sha>.webp` — no red side pillars; ULTRAKILL still near south.

- [ ] **Step 3: Commit** only if docs or library/media changed intentionally.

```bash
git add docs/superpowers/specs/2026-07-22-steam-cover-frame-trim-design.md
# plus media/library only if user asked to reimport in-tree
git commit -m "docs: note frame-trim detector constants"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
|---|---|
| After square rect | Task 2 |
| L+R and/or T+B gate | Task 1 |
| 4% thick → skip all | Task 1 |
| Qualifying-pair depths only | Task 1 |
| Re-square + logo must | Task 1–2 |
| Edge strip MAD/step | Task 1 |
| Attention/centre materialize | Task 2 |
| ULTRAKILL + synthetic tests | Task 1–2 |
| No new deps / CLI only | Global |

**Placeholder scan:** none intentional.  
**Type consistency:** `FrameDepths`, `ExtractRect`, `Bounds` shared; `mapLocalToSource` used in Task 2.
