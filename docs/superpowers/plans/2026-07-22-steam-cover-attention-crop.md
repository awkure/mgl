# Steam Cover Attention Crop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encode Steam library covers with sharp attention crop (centre fallback on throw) so 2:3→1:1 clips less title/logo.

**Architecture:** Keep fetch URL order in `fetchAndEncodeSteamCover`. Extract a small `encodeSteamCoverWebp` helper that tries `sharp.strategy.attention`, then retries `centre` once on throw. Optional `encodeResize` inject for unit-testing the fallback without mocking all of sharp.

**Tech Stack:** Node ESM, existing `sharp`, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-22-steam-cover-attention-crop-design.md`

## Global Constraints

- No OCR / south gravity / logo overlay / entropy
- CLI cover path only (`scripts/lib/steamCover.mjs`); SPA `prepareImage` unchanged
- No new runtime deps
- Asset shape stays 512×512 WebP, quality 82, SHA-256 id
- Fetch order unchanged: `library_600x900` then optional `header_image`
- Do not commit `.cursor/` skills; leave unrelated dirty files alone

## File map

| Path | Responsibility |
|---|---|
| `scripts/lib/steamCover.mjs` | `encodeSteamCoverWebp` + wire into `fetchAndEncodeSteamCover` |
| `tests/steam-cover.test.ts` | Attention encode + centre fallback unit tests |

---

### Task 1: Attention encode + centre fallback

**Files:**
- Modify: `scripts/lib/steamCover.mjs`
- Modify: `tests/steam-cover.test.ts`

**Interfaces:**
- Produces:
```js
/**
 * @param {Buffer} imageBytes
 * @param {{
 *   encodeResize?: (bytes: Buffer, position: string | number) => Promise<Buffer>
 * }} [options]
 * @returns {Promise<Buffer>}
 */
export async function encodeSteamCoverWebp(imageBytes, options = {});
```
- Default `encodeResize(bytes, position)`:
```js
sharp(bytes)
  .rotate()
  .resize(512, 512, { fit: "cover", position })
  .webp({ quality: 82 })
  .toBuffer()
```
- Primary `position`: `sharp.strategy.attention`
- On throw: retry once with `"centre"`
- If centre also throws: rethrow (caller already treats missing bytes as null; encode errors may still surface — preserve current throw-through behavior for double failure)
- `fetchAndEncodeSteamCover` uses `encodeSteamCoverWebp(imageBytes)` after successful fetch (no inject)

- [ ] **Step 1: Write failing tests**

Add to `tests/steam-cover.test.ts`:

```ts
import { encodeSteamCoverWebp } from "../scripts/lib/steamCover.mjs";

it("encodeSteamCoverWebp uses attention then falls back to centre on throw", async () => {
  const jpeg = await sharp({
    create: { width: 200, height: 300, channels: 3, background: { r: 20, g: 40, b: 60 } },
  }).jpeg().toBuffer();

  const positions: Array<string | number> = [];
  const encodeResize = vi.fn(async (_bytes: Buffer, position: string | number) => {
    positions.push(position);
    if (position === sharp.strategy.attention) {
      throw new Error("attention failed");
    }
    return sharp(_bytes)
      .resize(512, 512, { fit: "cover", position: "centre" })
      .webp({ quality: 82 })
      .toBuffer();
  });

  const webp = await encodeSteamCoverWebp(jpeg, { encodeResize });
  expect(positions).toEqual([sharp.strategy.attention, "centre"]);
  expect(webp.subarray(0, 4).toString("ascii")).toBe("RIFF");
  const meta = await sharp(webp).metadata();
  expect(meta.width).toBe(512);
  expect(meta.height).toBe(512);
});

it("encodeSteamCoverWebp succeeds with real attention crop on portrait JPEG", async () => {
  const jpeg = await sharp({
    create: { width: 600, height: 900, channels: 3, background: { r: 10, g: 20, b: 30 } },
  }).jpeg().toBuffer();

  const webp = await encodeSteamCoverWebp(jpeg);
  const meta = await sharp(webp).metadata();
  expect(meta.format).toBe("webp");
  expect(meta.width).toBe(512);
  expect(meta.height).toBe(512);
});
```

Keep existing three `fetchAndEncodeSteamCover` tests unchanged.

- [ ] **Step 2: Run tests to verify fail**

Run: `npm test -- tests/steam-cover.test.ts`

Expected: FAIL — `encodeSteamCoverWebp` is not exported / not a function.

- [ ] **Step 3: Implement**

In `scripts/lib/steamCover.mjs`, add and export:

```js
/**
 * @param {Buffer} imageBytes
 * @param {{ encodeResize?: (bytes: Buffer, position: string|number) => Promise<Buffer> }} [options]
 * @returns {Promise<Buffer>}
 */
export async function encodeSteamCoverWebp(imageBytes, options = {}) {
  const encodeResize =
    options.encodeResize ??
    ((bytes, position) =>
      sharp(bytes)
        .rotate()
        .resize(512, 512, { fit: "cover", position })
        .webp({ quality: 82 })
        .toBuffer());

  try {
    return await encodeResize(imageBytes, sharp.strategy.attention);
  } catch {
    return await encodeResize(imageBytes, "centre");
  }
}
```

Replace the inline sharp chain in `fetchAndEncodeSteamCover` with:

```js
const webp = await encodeSteamCoverWebp(imageBytes);
```

Leave fetch loop, hashing, and return shape unchanged.

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- tests/steam-cover.test.ts`

Expected: PASS (all cases in that file).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/steamCover.mjs tests/steam-cover.test.ts
git commit -m "$(cat <<'EOF'
feat(steam): attention-crop covers with centre fallback

2:3 library capsules keep logos better than fixed centre crop.
EOF
)"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
|---|---|
| `position: sharp.strategy.attention` | Task 1 |
| Fallback `centre` on throw | Task 1 (`encodeSteamCoverWebp`) |
| Fetch order unchanged | Task 1 (no fetch edits) |
| 512 WebP q82 / SHA asset shape | Task 1 |
| Header fallback also attention | Task 1 (same encode path) |
| No OCR / SPA / new deps | Global constraints |
| Existing fetch tests kept | Task 1 Step 1 |
| Portrait fixture → 512² | Task 1 real-attention test |

No placeholders. Single subsystem — one plan.
