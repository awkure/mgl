# Steam cover frame trim (zoom past border) — design

Date: 2026-07-22

Depends on: `2026-07-22-steam-cover-ocr-crop-design.md`  
Related: `2026-07-22-steam-cover-attention-crop-design.md`, `2026-07-22-steam-covers-only-design.md`

## Goal

After the square crop is chosen, detect a thin **picture-frame** border on the crop and zoom in so the frame is no longer visible in the final 512×512 WebP.

Example: ULTRAKILL library capsule — distressed red strips on left/right (and matching top/bottom frame on the source) still show after OCR+attention square crop; trim them away.

## Problem

OCR/attention crop keeps title and subject but often leaves the Steam capsule’s decorative frame inside the square. Side pillars are especially ugly on 1:1 assets. Blind inset would clip intentional edge art; thick borders are usually design, not a matte.

## Decisions

| Topic | Choice |
|---|---|
| When | **After** square extract rect is chosen (OCR path, and attention/centre extract paths that yield a rect). Before 512 resize / WebP |
| What counts as frame | Opposite edges both show a border strip: **(L and R)** and/or **(T and B)** |
| Edges | All four may contribute depth; zoom only if at least one opposite pair qualifies |
| Max depth | **≤ 4%** of that side’s length per edge. Any measured depth above cap → **skip zoom entirely** (thick = don’t touch) |
| Detector | Edge strip scan: low along-edge variance + contrast jump vs inward neighbour (Approach 1) |
| Out | `sharp().trim()`, fixed % inset, ML |
| Logo safety | After inset, final square must still contain the OCR logo must-region when one was used; else skip or reduce trim |
| Scope | CLI encode only (`scripts/lib/steamCover.mjs` + small helper). SPA `prepareImage` unchanged |
| Deps | No new packages (sharp already present for raw pixels) |

## Behavior

1. Existing pipeline picks square `ExtractRect` on the upright source (OCR+attention, or fallbacks that extract).
2. Read raw pixels of that square (or of the full image restricted to the rect).
3. Measure border depth on L, R, T, B (pixels), each clamped by discovery rules below.
4. **Frame gate:**
   - Let `maxFrac = 0.04`. Max depth per edge = `floor(maxFrac * side)` (side = width for L/R, height for T/B).
   - Scan each edge. If the strip is still border-like **beyond** the max depth → treat as **thick mat** → **skip zoom entirely** (original rect). Matches product rule: thick → don’t touch.
   - Otherwise depth ∈ `[0, maxDepth]`.
   - **L/R pair OK** if both L and R depths ≥ 1 and each ≤ maxDepth.
   - **T/B pair OK** if both T and B depths ≥ 1 and each ≤ maxDepth.
   - Proceed only if at least one pair OK; else no trim.
5. **Inset:** only apply depths from qualifying pairs (if only L/R OK, T=B=0; if only T/B OK, L=R=0; if both, use all four).  
   `left' = left + L`, `top' = top + T`, `width' = width - L - R`, `height' = height - T - B`.
6. **Re-square:** take largest square inside the inset rectangle.
   - Prefer placement that still contains the logo must-region (same pin rules as crop if available).
   - Else centre the square in the inset.
7. If re-square cannot contain logo must-region → **skip trim** (keep pre-trim rect).
8. Extract final square → resize 512 → WebP (unchanged).

Attention-only / centre `fit: "cover"` resize paths that never produce an explicit rect: either (preferred) materialize an equivalent extract rect then run the same trim, or skip trim on those paths. Spec preference: **materialize rect** so trim applies uniformly.

## Detection detail (edge strip)

For a candidate edge (e.g. left columns `x = 0, 1, …`):

- Along the edge line (full height of the square), compute colour mean and variance (or mean absolute deviation).
- Compare to the next inward column: mean absolute RGB delta.
- Column is “border-like” if variance is low relative to interior **or** it matches the previous border column’s mean (same strip), **and** there is a clear step when leaving the strip into interior.
- Walk inward while columns stay border-like; stop at first interior-like column. Depth = count of border-like columns.
- Same for right / top / bottom (rows).
- Distressed frames (ULTRAKILL grit): allow moderate variance but require the strip to be **narrow** and **present on the opposite edge** with similar depth (± few px or ±50%).

Exact numeric thresholds live in code + unit tests; locked product rules are the **4% cap**, **opposite-pair gate**, and **logo must survive**.

- **Implementation constants** (`scripts/lib/steamCoverFrameTrim.mjs`): `FRAME_TRIM_MAX_FRAC` **0.04** (exported); module thresholds `BORDER_MAD_MAX` **40**, `MEAN_MATCH` **30**, `EDGE_STEP_MIN` **18** (used by edge-strip scan / `meanMatch` / inward step detection).

## Non-goals

- Removing arbitrary letterboxing from non-framed art
- Detecting frames only by dominant colour match without opposite-edge confirmation
- Zooming past thick mats / full-bleed colour fields
- Changing OCR logo pick or attention pin logic (except consuming must-region for safety)

## Test plan

- Unit: synthetic square with 2–3% solid L/R (and T/B) frame → depths detected, inset square drops frame.
- Unit: border deeper than 4% on a side → no trim.
- Unit: only one side bordered → no trim (not a frame).
- Fixture: ULTRAKILL square crop (or full encode) → left/right red pillars gone; title still in frame near south.
- Regression: existing OCR/attention cover tests still pass; trim is no-op when no frame.

## Risks

- Flat sky / solid walls at both left and right edges → false frame. Mitigate: require contrast step into interior, depth ≤ 4%, opposite pair; optional similar mean colour on opposite strips.
- Bottom frame + south-pinned title: inset may threaten logo → logo safety skip/reduce.
- Asymmetric frame (L≠R): allow independent depths if both > 0 and each ≤ 4%; re-square after asymmetric inset.
