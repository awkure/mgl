# Steam Cover OCR Text-Fit Crop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encode Steam covers with OCR text-detection crop first (square covering all text + 8% pad), then sharp attention, then centre.

**Architecture:** Pure geometry helper computes an extract rect from detection boxes. `encodeSteamCoverWebp` tries text-fit extract→512 WebP when boxes fit; otherwise attention→centre. Default detector wraps `ppu-paddle-ocr` `detect()`; tests inject `detectTextBoxes` so CI never loads models.

**Tech Stack:** Node ESM, `sharp`, `ppu-paddle-ocr` + `onnxruntime-node` (devDependencies), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-22-steam-cover-ocr-crop-design.md`

## Global Constraints

- Detection only — no recognition / title matching
- Pad = 8% of `max(unionW, unionH)` each side
- OCR success only when a square can cover padded union inside the image
- CLI cover path only (`scripts/lib/steamCover.mjs`); SPA `prepareImage` unchanged
- Asset shape stays 512×512 WebP, quality 82, SHA-256 id
- Unit tests must not download OCR models
- Do not commit `.cursor/` skills; leave unrelated dirty files alone

## File map

| Path | Responsibility |
|---|---|
| `scripts/lib/steamCoverTextFit.mjs` | Pure: boxes + image size → extract square or `null` |
| `scripts/lib/steamCoverDetect.mjs` | Default Paddle `detectTextBoxes` (lazy-init service) |
| `scripts/lib/steamCover.mjs` | Encode chain: text-fit → attention → centre |
| `tests/steam-cover-text-fit.test.ts` | Geometry unit tests |
| `tests/steam-cover.test.ts` | Encode-chain inject tests |
| `package.json` | Add `ppu-paddle-ocr`, `onnxruntime-node` as `devDependencies` |

---

### Task 1: Text-fit square geometry

**Files:**
- Create: `scripts/lib/steamCoverTextFit.mjs`
- Create: `tests/steam-cover-text-fit.test.ts`

**Interfaces:**
- Produces:
```js
/**
 * @typedef {{ x: number, y: number, width: number, height: number }} TextBox
 * @typedef {{ left: number, top: number, width: number, height: number }} ExtractRect
 */

/** Pad fraction of max(unionW, unionH) applied on each side. */
export const TEXT_FIT_PAD = 0.08;

/**
 * Compute a square extract rect that covers all boxes + pad, or null if unfit.
 * @param {TextBox[]} boxes
 * @param {{ width: number, height: number }} imageSize
 * @returns {ExtractRect | null}
 */
export function textFitSquare(boxes, imageSize);
```

- Rules (from spec):
  - Empty `boxes` → `null`
  - Union → pad `p = TEXT_FIT_PAD * max(unionW, unionH)` each side (expand, then clamp pad rect to image bounds for intermediate pad)
  - `side = max(paddedW, paddedH)`
  - If `side > min(W,H)` → `null`
  - Center square on padded-union centroid; clamp `left/top` into `[0, W-side]` / `[0, H-side]`
  - After clamp, if square does not fully contain padded union → `null`
  - Return integer pixel rect (`Math.floor` left/top/width/height); width === height === side (floor side carefully so rect stays inside image)

- [ ] **Step 1: Write failing tests**

Create `tests/steam-cover-text-fit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { TEXT_FIT_PAD, textFitSquare } from "../scripts/lib/steamCoverTextFit.mjs";

describe("textFitSquare", () => {
  it("returns null for empty boxes", () => {
    expect(textFitSquare([], { width: 600, height: 900 })).toBeNull();
  });

  it("returns a square covering a single centered box with 8% pad", () => {
    // box 100x50 at (250,400) on 600x900
    const rect = textFitSquare(
      [{ x: 250, y: 400, width: 100, height: 50 }],
      { width: 600, height: 900 },
    );
    expect(rect).not.toBeNull();
    expect(rect!.width).toBe(rect!.height);
    expect(TEXT_FIT_PAD).toBe(0.08);
    // padded union: w=100+2*p, h=50+2*p with p=0.08*100=8 → 116 x 66 → side 116
    expect(rect!.width).toBe(116);
    // square must contain padded union
    expect(rect!.left).toBeLessThanOrEqual(250 - 8);
    expect(rect!.top).toBeLessThanOrEqual(400 - 8);
    expect(rect!.left + rect!.width).toBeGreaterThanOrEqual(250 + 100 + 8);
    expect(rect!.top + rect!.height).toBeGreaterThanOrEqual(400 + 50 + 8);
  });

  it("returns null when padded union cannot fit in a square inside the image", () => {
    // tall text spanning almost full height
    const rect = textFitSquare(
      [{ x: 10, y: 10, width: 50, height: 880 }],
      { width: 600, height: 900 },
    );
    expect(rect).toBeNull();
  });

  it("unions multiple boxes before squaring", () => {
    const rect = textFitSquare(
      [
        { x: 200, y: 100, width: 80, height: 40 },
        { x: 300, y: 200, width: 80, height: 40 },
      ],
      { width: 600, height: 900 },
    );
    expect(rect).not.toBeNull();
    expect(rect!.width).toBe(rect!.height);
    // union 200..380, 100..240 → 180x140; p=0.08*180=14.4 → padded ~208.8 x 168.8 → side ~209
    expect(rect!.width).toBeGreaterThanOrEqual(180);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run tests/steam-cover-text-fit.test.ts`

Expected: FAIL — cannot resolve `steamCoverTextFit.mjs` / `textFitSquare` not found.

- [ ] **Step 3: Implement geometry**

Create `scripts/lib/steamCoverTextFit.mjs`:

```js
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
```

Adjust integer flooring if the single-box test expects exact `116` — with `p=8`, padded `234..358` × `392..458` → side 116; centroid `(296, 425)`; left `296-58=238`, top `425-58=367`. Verify containment of padded union `[242,392]–[358,458]` — fine. If floor drifts, assert with `toBeCloseTo` / containment only (keep containment asserts primary; exact `116` is OK if float math yields it).

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run tests/steam-cover-text-fit.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/steamCoverTextFit.mjs tests/steam-cover-text-fit.test.ts docs/superpowers/specs/2026-07-22-steam-cover-ocr-crop-design.md
git commit -m "$(cat <<'EOF'
feat(steam): text-fit square geometry for cover OCR crop

EOF
)"
```

---

### Task 2: Encode chain OCR → attention → centre

**Files:**
- Modify: `scripts/lib/steamCover.mjs`
- Modify: `tests/steam-cover.test.ts`

**Interfaces:**
- Consumes: `textFitSquare` from `./steamCoverTextFit.mjs`
- Extends `encodeSteamCoverWebp` options:
```js
/**
 * @param {Buffer} imageBytes
 * @param {{
 *   encodeResize?: (bytes: Buffer, position: string | number) => Promise<Buffer>
 *   detectTextBoxes?: (bytes: Buffer) => Promise<Array<{ x: number, y: number, width: number, height: number }>>
 *   encodeExtract?: (bytes: Buffer, rect: { left: number, top: number, width: number, height: number }) => Promise<Buffer>
 * }} [options]
 * @returns {Promise<Buffer>}
 */
export async function encodeSteamCoverWebp(imageBytes, options = {});
```
- Default `encodeExtract`:
```js
(bytes, rect) =>
  sharp(bytes)
    .rotate()
    .extract(rect)
    .resize(512, 512)
    .webp({ quality: 82 })
    .toBuffer()
```
- Default `detectTextBoxes`: import from `./steamCoverDetect.mjs` (Task 3). **For Task 2 only**, if `steamCoverDetect.mjs` not yet present, use:
```js
async () => []
```
as temporary default so attention path still works, then Task 3 replaces it. Prefer creating a stub `steamCoverDetect.mjs` exporting `detectTextBoxes = async () => []` in Task 2 Step 3 so imports stay stable.

- Flow:
  1. Try `boxes = await detectTextBoxes(imageBytes)` inside try/catch; on throw → skip to attention
  2. `meta = await sharp(imageBytes).rotate().metadata()` for W/H (use `meta.width`/`meta.height`; if missing → attention)
  3. `rect = textFitSquare(boxes, { width, height })`; if rect → `return encodeExtract(imageBytes, rect)`
  4. Else attention → centre as today

- [ ] **Step 1: Write failing tests**

Update existing attention fallback test: with default empty detect, behavior stays attention→centre. Add:

```ts
it("encodeSteamCoverWebp uses text-fit extract when boxes fit", async () => {
  const jpeg = await sharp({
    create: { width: 600, height: 900, channels: 3, background: { r: 10, g: 20, b: 30 } },
  }).jpeg().toBuffer();

  const extracts: Array<{ left: number; top: number; width: number; height: number }> = [];
  const positions: Array<string | number> = [];

  const webp = await encodeSteamCoverWebp(jpeg, {
    detectTextBoxes: async () => [{ x: 200, y: 300, width: 200, height: 80 }],
    encodeExtract: async (bytes, rect) => {
      extracts.push(rect);
      return sharp(bytes).extract(rect).resize(512, 512).webp({ quality: 82 }).toBuffer();
    },
    encodeResize: async (_bytes, position) => {
      positions.push(position);
      throw new Error("should not reach attention");
    },
  });

  expect(extracts).toHaveLength(1);
  expect(extracts[0].width).toBe(extracts[0].height);
  expect(positions).toEqual([]);
  const meta = await sharp(webp).metadata();
  expect(meta.width).toBe(512);
  expect(meta.height).toBe(512);
});

it("encodeSteamCoverWebp falls through to attention when detect returns empty", async () => {
  const jpeg = await sharp({
    create: { width: 200, height: 300, channels: 3, background: { r: 20, g: 40, b: 60 } },
  }).jpeg().toBuffer();

  const positions: Array<string | number> = [];
  const webp = await encodeSteamCoverWebp(jpeg, {
    detectTextBoxes: async () => [],
    encodeResize: async (_bytes, position) => {
      positions.push(position);
      if (position === sharp.strategy.attention) throw new Error("attention failed");
      return sharp(_bytes).resize(512, 512, { fit: "cover", position: "centre" }).webp({ quality: 82 }).toBuffer();
    },
  });
  expect(positions).toEqual([sharp.strategy.attention, "centre"]);
  expect(webp.subarray(0, 4).toString("ascii")).toBe("RIFF");
});

it("encodeSteamCoverWebp falls through when detect throws", async () => {
  const jpeg = await sharp({
    create: { width: 200, height: 300, channels: 3, background: { r: 20, g: 40, b: 60 } },
  }).jpeg().toBuffer();

  const positions: Array<string | number> = [];
  await encodeSteamCoverWebp(jpeg, {
    detectTextBoxes: async () => {
      throw new Error("detect down");
    },
    encodeResize: async (_bytes, position) => {
      positions.push(position);
      return sharp(_bytes).resize(512, 512, { fit: "cover", position }).webp({ quality: 82 }).toBuffer();
    },
  });
  expect(positions[0]).toBe(sharp.strategy.attention);
});

it("encodeSteamCoverWebp falls through when text union cannot fit square", async () => {
  const jpeg = await sharp({
    create: { width: 600, height: 900, channels: 3, background: { r: 10, g: 20, b: 30 } },
  }).jpeg().toBuffer();

  const positions: Array<string | number> = [];
  await encodeSteamCoverWebp(jpeg, {
    detectTextBoxes: async () => [{ x: 10, y: 10, width: 50, height: 880 }],
    encodeResize: async (_bytes, position) => {
      positions.push(position);
      return sharp(_bytes).resize(512, 512, { fit: "cover", position }).webp({ quality: 82 }).toBuffer();
    },
  });
  expect(positions[0]).toBe(sharp.strategy.attention);
});
```

Keep existing real-attention portrait test (works with empty default detect).

Update the old `"uses attention then falls back to centre on throw"` test to pass `detectTextBoxes: async () => []` so OCR does not interfere.

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run tests/steam-cover.test.ts`

Expected: FAIL — `detectTextBoxes` / text-fit path not wired.

- [ ] **Step 3: Implement encode chain**

Create stub `scripts/lib/steamCoverDetect.mjs`:

```js
/** @param {Buffer} _imageBytes */
export async function detectTextBoxes(_imageBytes) {
  return [];
}
```

Update `scripts/lib/steamCover.mjs` `encodeSteamCoverWebp`:

```js
import { textFitSquare } from "./steamCoverTextFit.mjs";
import { detectTextBoxes as defaultDetectTextBoxes } from "./steamCoverDetect.mjs";

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
        .rotate()
        .extract(rect)
        .resize(512, 512)
        .webp({ quality: 82 })
        .toBuffer());

  const detectTextBoxes = options.detectTextBoxes ?? defaultDetectTextBoxes;

  try {
    const boxes = await detectTextBoxes(imageBytes);
    const meta = await sharp(imageBytes).rotate().metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    const rect = textFitSquare(boxes ?? [], { width, height });
    if (rect) {
      return await encodeExtract(imageBytes, rect);
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
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run tests/steam-cover.test.ts tests/steam-cover-text-fit.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/steamCover.mjs scripts/lib/steamCoverDetect.mjs tests/steam-cover.test.ts
git commit -m "$(cat <<'EOF'
feat(steam): OCR text-fit then attention then centre crop

EOF
)"
```

---

### Task 3: Paddle detector + deps

**Files:**
- Modify: `scripts/lib/steamCoverDetect.mjs`
- Modify: `package.json` / lockfile via npm install

**Interfaces:**
- Produces real `detectTextBoxes(imageBytes: Buffer): Promise<TextBox[]>`
- Lazy singleton `PaddleOcrService`:
```js
import { PaddleOcrService } from "ppu-paddle-ocr";

let servicePromise = null;

async function getService() {
  if (!servicePromise) {
    servicePromise = (async () => {
      const service = new PaddleOcrService();
      await service.initialize();
      return service;
    })();
  }
  return servicePromise;
}

export async function detectTextBoxes(imageBytes) {
  const service = await getService();
  const ab =
    imageBytes.buffer instanceof ArrayBuffer
      ? imageBytes.buffer.slice(imageBytes.byteOffset, imageBytes.byteOffset + imageBytes.byteLength)
      : Uint8Array.from(imageBytes).buffer;
  const { boxes } = await service.detect(ab);
  return (boxes ?? []).map((b) => ({
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
  }));
}
```
- If package API differs slightly (`createEngine` vs `PaddleOcrService`), match installed README; keep return shape `{ x, y, width, height }[]`.

- [ ] **Step 1: Install deps**

Run:
```bash
npm install -D ppu-paddle-ocr onnxruntime-node
```

Expected: packages in `devDependencies`; lockfile updated.

- [ ] **Step 2: Replace stub detector**

Implement `scripts/lib/steamCoverDetect.mjs` as above (lazy init + map boxes).

- [ ] **Step 3: Verify unit tests still skip live OCR**

Run: `npx vitest run tests/steam-cover.test.ts tests/steam-cover-text-fit.test.ts`

Expected: PASS (injects / empty default not used; default path not hit when injects present; real-attention test uses real detect — **problem**: default detect will load Paddle on the real-attention test).

**Fix:** Keep real-attention test passing `detectTextBoxes: async () => []` so CI/unit never initializes Paddle. Update that test in this step if not already.

Optional smoke (not required for merge): manual one-off script calling `encodeSteamCoverWebp` without inject on a real cover JPEG.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json scripts/lib/steamCoverDetect.mjs tests/steam-cover.test.ts
git commit -m "$(cat <<'EOF'
feat(steam): wire ppu-paddle-ocr detect for cover text-fit

EOF
)"
```

---

## Spec coverage checklist

| Spec item | Task |
|---|---|
| `ppu-paddle-ocr` detect-only | Task 3 |
| 8% pad | Task 1 (`TEXT_FIT_PAD`) |
| Fit-all-text square or miss | Task 1 + Task 2 unfit fallthrough |
| Chain OCR → attention → centre | Task 2 |
| CLI only / SPA unchanged | All (only `scripts/lib/*`) |
| Inject tests, no model in CI | Task 2–3 |
| Asset 512² WebP unchanged | Task 2 extract/resize |

## Self-review

- No TBD placeholders
- Box type `{x,y,width,height}` consistent across tasks
- `textFitSquare` / `detectTextBoxes` / `encodeExtract` names aligned
- Real-attention test must inject empty detect after Task 3 so models stay out of `npm test`
