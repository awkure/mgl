# Steam cover OCR text-fit crop — design

Date: 2026-07-22

Depends on: `2026-07-22-steam-cover-attention-crop-design.md`  
Related: `2026-07-22-steam-covers-only-design.md`

## Goal

When encoding Steam covers (2:3 → 1:1), prefer a square crop that keeps the **title/logo line** in frame. Detection only — no recognition / no title matching.

Fallback chain: **OCR text-fit → sharp attention → centre**.

## Problem

Attention crop is best-effort saliency. Titles still get clipped on some capsules. Need geometry of text regions, not reading the string. Previous attention design deferred OCR; this revisits detection-only.

## Decisions

| Topic | Choice |
|---|---|
| Detector | `ppu-paddle-ocr` **detect-only** (+ `onnxruntime-node`) |
| Recognition | Out — boxes only |
| Logo pick | Title-like (wide, short, not footer); among substantial candidates pick **highest** (title above credit slabs) |
| Pad around logo | **8%** sides/top of `max(w,h)`; **2%** bottom (`TEXT_FIT_PAD_BOTTOM`) so south-pin sits flush |
| OCR success | Picked logo box **must** stay in frame |
| Attention merge | Full short-side square containing padded logo. If attention is **above** logo → pin text to **south** of crop; if **below** → pin text to **north**. Horizontal still tracks attention.x |
| Still unfit → | Logo-only square / south-anchored; then pure attention; then centre |
| Scope | CLI cover encode only (`scripts/lib/steamCover.mjs`) |
| SPA `prepareImage` | Unchanged |
| Deps | `devDependencies` (CLI/scripts/tests) |

## Behavior

1. Fetch order unchanged (`library_600x900`, optional `header_image`).
2. `encodeSteamCoverWebp(imageBytes, options)`:
   1. Detect text boxes; pick logo via `pickLogoTextBox` (title-like → else largest).
   2. Probe sharp attention focal point (`attentionX`/`attentionY`).
   3. Place full short-side square that **contains** asymmetrically padded logo. Vertical edge from attention vs logo centre: attention above → text at south of crop; attention below → text at north. Horizontal clamps toward `attentionX`.
   4. Else logo-only / south fallback → else attention resize → else centre.
3. Asset shape unchanged: 512×512 WebP, SHA-256 id, same metadata.
4. Landscape header fallback uses the same encode path.

## Square geometry (detail)

- Logo box → `(x0,y0,x1,y1)`; pad 8% sides/top, 2% bottom; clamp to image.
- Cover crop: `side = min(W,H)` containing padded logo; vertical pin from attention.
- Legacy `textFitSquare`: union of boxes + symmetric 8% pad; `side = max(paddedW, paddedH)`; unfit if `side > min(W,H)`.
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
