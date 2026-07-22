# Steam cover OCR text-fit crop — design

Date: 2026-07-22

Depends on: `2026-07-22-steam-cover-attention-crop-design.md`  
Related: `2026-07-22-steam-covers-only-design.md`

## Goal

When encoding Steam covers (2:3 → 1:1), prefer a square crop that contains **all detected text** (title/logo bands). Detection only — no recognition / no title matching.

Fallback chain: **OCR text-fit → sharp attention → centre**.

## Problem

Attention crop is best-effort saliency. Titles still get clipped on some capsules. Need geometry of text regions, not reading the string. Previous attention design deferred OCR; this revisits detection-only.

## Decisions

| Topic | Choice |
|---|---|
| Detector | `ppu-paddle-ocr` **detect-only** (+ `onnxruntime-node`) |
| Recognition | Out — boxes only |
| Pad around text union | **8%** of `max(unionW, unionH)` on each side |
| OCR success | Boxes present **and** a square can cover padded union inside the image (`side ≤ min(W,H)` after clamp that still covers padded union) |
| OCR miss → | attention resize, then centre on throw (unchanged) |
| Scope | CLI cover encode only (`scripts/lib/steamCover.mjs`) |
| SPA `prepareImage` | Unchanged |
| Deps | `devDependencies` (CLI/scripts/tests) |

## Behavior

1. Fetch order unchanged (`library_600x900`, optional `header_image`).
2. `encodeSteamCoverWebp(imageBytes, options)`:
   1. `detectTextBoxes(imageBytes)` → list of axis-aligned boxes (injectable; default = Paddle detect).
   2. If non-empty: union → pad 8% → `side = max(paddedW, paddedH)` → square centered on padded-union centroid → clamp into image. If resulting square still covers padded union → `extract` → resize 512×512 WebP → return.
   3. Else (no boxes / detect throw / unfit geometry) → `resize(..., position: attention)`.
   4. Else throw → `position: "centre"`.
3. Asset shape unchanged: 512×512 WebP, SHA-256 id, same metadata.
4. Landscape header fallback uses the same encode path.

## Square geometry (detail)

- Union of detection boxes → `(x0,y0,x1,y1)`.
- Pad: `p = 0.08 * max(w,h)`; expand then clamp to image for pad step.
- `side = max(paddedW, paddedH)`.
- If `side > min(W,H)` → unfit → attention.
- Else place square on centroid; clamp `left/top` into `[0, W-side]` / `[0, H-side]`.
- After clamp, if square no longer contains padded union → unfit → attention.
- Extract integer pixel rect; resize to 512×512 (already square).

## Reimport / hashes

- New crop → new bytes → new asset id on re-encode.
- Cover lock / `--force` rules unchanged (`steamCovers` / covers-only CLI).
- Orphan GC unchanged.

## Out of scope

- Reading / matching game titles
- Guaranteeing stylized logos always detected
- Batch re-encode without import/covers CLI
- Changing SPA upload `prepareImage`
- Entropy strategy

## Testing

- `tests/steam-cover.test.ts`:
  - Injected boxes that fit → OCR extract path (no live model in CI)
  - Empty boxes / unfit union / detect throw → attention then centre
  - Keep real attention portrait fixture
- Do not require downloading OCR models in unit tests

## Success criteria

- Default CLI cover encode tries text-fit first when detection succeeds and geometry fits.
- Miss / unfit / throw still yields attention then centre.
- No SPA or published schema change.
- Unit tests cover the three-step chain via injects; no live OCR required for `npm test`.
