# Steam cover attention crop — design

Date: 2026-07-22

Depends on: Steam cover encode (`scripts/lib/steamCover.mjs`)  
Related: `2026-07-22-steam-reimport-locks-design.md`, `2026-07-22-steam-media-prefill-design.md`

## Goal

When importing Steam covers from portrait `library_600x900` (2:3 → 1:1), prefer a content-aware crop so title/logo bands are less often cut by centre crop. No OCR.

## Problem

`fetchAndEncodeSteamCover` resizes with `fit: "cover"` and `position: "centre"`. For 600×900 → 512×512, ~14% is clipped from top and bottom. Steam capsule titles often sit in the lower band → centre crop clips text.

OCR was considered and rejected as primary: stylized logos OCR poorly; need is bbox/placement not reading; sharp already ships attention/entropy strategies.

## Decisions

| Topic | Choice |
|---|---|
| Strategy | Approach B — `sharp.strategy.attention`, fallback `centre` on resize throw |
| South gravity | Out of scope (can revisit if attention fails audit) |
| OCR / text bbox | Out of scope |
| Logo CDN overlay | Out of scope |
| Scope surface | CLI cover encode only (`steamCover.mjs`); shared by import + media-prefill |
| SPA `prepareImage` | Unchanged |
| Existing published covers | Unchanged until reimport may write `coverAssetId` |

## Behavior

1. Fetch order unchanged: CDN `library_600x900.jpg`, then optional `header_image`.
2. Primary encode:
   ```js
   sharp(imageBytes)
     .rotate()
     .resize(512, 512, { fit: "cover", position: sharp.strategy.attention })
     .webp({ quality: 82 })
   ```
3. If that resize/encode throws → retry once with `position: "centre"`.
4. Asset shape unchanged: 512×512 WebP, SHA-256 id, same metadata fields.
5. Landscape `header_image` fallback also uses attention (no special case).

## Reimport / hashes

- New crop → different bytes → new asset id when cover is (re)encoded.
- Already-locked `steamOverrides.coverAssetId` blocks overwrite unless `--force` / unlock rules from reimport-locks design.
- Orphan asset GC unchanged.

## Out of scope

- Guaranteeing title always in frame (attention = best-effort)
- Batch re-encode of all existing `public/media` without import
- `--no-covers` / dry-run behavior changes
- Entropy strategy (use attention only unless later audit prefers entropy)

## Testing

- Keep existing encode + CDN-fallback + null tests in `tests/steam-cover.test.ts`.
- Ensure attention path still yields 512×512 WebP from a portrait fixture.
- Optional: uneven-detail fixture where centre vs attention would differ is nice-to-have, not required for merge.

## Success criteria

- Default Steam import covers use attention crop.
- Encode failure still produces a centre-cropped cover when possible (or null if both fail / no bytes).
- No new runtime deps beyond existing `sharp`.
