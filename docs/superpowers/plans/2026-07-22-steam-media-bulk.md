# Steam Media Bulk Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Download profile Steam screenshots/videos for library games into `<!-- steam-media:v1 -->` notes — by default during `steam-import` (touched games only) and via `steam-import-media-all` for a full library crawl.

**Architecture:** Extract shared `scripts/lib/steamMediaImport.mjs` (fetch UGC → best-effort WebP encode → note upsert patch pieces). Both `import-steam-media.mjs` (one game or `--all`) and `import-steam.mjs` (touched games, `--no-media` opt-out) call it. Merge media into the same import patch before a single write.

**Tech Stack:** Node ESM + sharp (existing), Vitest, domain `src/domain/steamMedia.ts`, justfile recipes.

**Spec:** `docs/superpowers/specs/2026-07-22-steam-media-bulk-design.md`

## Global Constraints

- Media source: profile `GetUserFiles` only (filetype 4 screenshots, 3 videos) — never storefront marketing shots
- Note marker exactly `<!-- steam-media:v1 -->`; re-pull replaces attachments wholesale
- Best-effort encode: skip failed screenshot/thumb; still upsert note with survivors
- Per-game API fail: skip game, continue others; exit `0` unless fatal (key/flags/library)
- Empty UGC: still upsert media note
- `steam-import` media scope: only games in `patchItems` (created/updated this run)
- Never write `placement` / `reviewMarkdown` via media path
- Do not cache media in `steam-import-progress.json`
- Schema v2 / SHA-256 assets / orphan rules unchanged
- Do not commit `.cursor/` skills

## File map

| Path | Responsibility |
|---|---|
| `scripts/lib/steamMediaImport.mjs` | Shared fetch/encode/upsert/patch merge + list games with appid |
| `scripts/import-steam-media.mjs` | One-game + `--all`; sequential `--apply` for bulk |
| `scripts/import-steam.mjs` | `--no-media`; media for touched games into same patch |
| `justfile` | `steam-import-media-all` (+ via-patch) |
| `tests/steam-media-import.test.ts` | Shared helper unit tests |
| `tests/steam-media.test.ts` | Adjust if encode all-or-nothing assumptions remain |
| `README.md` | Document `--no-media`, bulk recipes, default import media |

---

### Task 1: Shared `steamMediaImport` helper (best-effort)

**Files:**
- Create: `scripts/lib/steamMediaImport.mjs`
- Create: `tests/steam-media-import.test.ts`

**Interfaces:**

```js
/**
 * @typedef {{ asset: object; base64: string }} EncodedSteamAsset
 * @typedef {{
 *   ok: true;
 *   gameId: string;
 *   appid: number;
 *   encodedAssets: EncodedSteamAsset[];
 *   mediaNote: object;
 *   previousNote: object | null;
 *   mediaNoteExisted: boolean;
 *   skipped: Array<{ kind: "screenshot" | "video-thumb"; id: string; error: string }>;
 *   screenshotsRequested: number;
 *   screenshotsEncoded: number;
 *   videos: number;
 * }} SteamMediaGameOk
 * @typedef {{
 *   ok: false;
 *   gameId: string;
 *   appid: number;
 *   error: string;
 * }} SteamMediaGameFail
 */

export function listLibraryGamesWithSteamAppId(library) {
  // returns Array<{ game, appid }> for games with positive integer steamAppId
}

export async function importSteamMediaForGame(input) {
  // input: {
  //   apiKey, steamid, library, game, appid,
  //   noVideoThumbs?: boolean,
  //   now: string,
  //   getUserScreenshots?: fn, getUserVideos?: fn, // injectable for tests
  //   fetchAndEncodeSteamImage?: fn,
  // }
  // returns SteamMediaGameOk | SteamMediaGameFail
}

export function buildMediaNotePatchFragment(input) {
  // input: result (ok), { now, transactionId, existingAssetIds, libraryAssets }
  // returns { operations, blobs } — assets + note only (no prefill game)
}

export function mergePatchFragments(basePatch, fragment) {
  // returns new patch with operations/blobs merged; throws on orphan blob
}

export function mediaTargetsFromPatchItems(patchItems) {
  // Array<{ game, appid }> from create/update items with positive steamAppId
}

export function validateMediaTargetFlags(flags) {
  // throws on --all + --appid/--game-id; or neither target mode
}
```

- [ ] **Step 1: Write failing tests**

Create `tests/steam-media-import.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  listLibraryGamesWithSteamAppId,
  importSteamMediaForGame,
  mergePatchFragments,
  mediaTargetsFromPatchItems,
  validateMediaTargetFlags,
} from "../scripts/lib/steamMediaImport.mjs";

const NOW = "2026-07-22T12:00:00.000Z";

function game(id: string, appid: number | null) {
  return {
    id,
    title: id,
    steamAppId: appid,
    coverAssetId: null,
    importedVia: "steam",
    hoursPlayed: null,
    lastPlayedAt: null,
    achievementsUnlocked: null,
    achievementsTotal: null,
    steamOverrides: {},
    platforms: ["Steam"],
    tags: [],
    status: "played",
    placement: { tierId: "unranked", rank: 1024 },
    reviewMarkdown: "",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe("listLibraryGamesWithSteamAppId", () => {
  it("returns only games with positive steamAppId", () => {
    const library = {
      games: {
        a: game("a", 570),
        b: game("b", null),
        c: game("c", 0),
        d: game("d", 440),
      },
    };
    const rows = listLibraryGamesWithSteamAppId(library);
    expect(rows.map((r) => r.appid).sort()).toEqual([440, 570]);
  });
});

describe("validateMediaTargetFlags", () => {
  it("rejects --all with --appid", () => {
    expect(() => validateMediaTargetFlags({ all: true, appid: 570, gameId: null })).toThrow(
      /Cannot combine --all/,
    );
  });

  it("requires a target mode", () => {
    expect(() => validateMediaTargetFlags({ all: false, appid: null, gameId: null })).toThrow(
      /--appid|--all/,
    );
  });
});

describe("mediaTargetsFromPatchItems", () => {
  it("includes create/update games with appid only", () => {
    const rows = mediaTargetsFromPatchItems([
      { kind: "create", game: game("c1", 10) },
      { kind: "update", game: game("u1", 20) },
      { kind: "create", game: game("c2", null) },
    ]);
    expect(rows.map((r) => r.appid)).toEqual([10, 20]);
  });
});

describe("importSteamMediaForGame", () => {
  it("skips failed encodes and still upserts note with survivors", async () => {
    const g = game("g1", 570);
    const library = { games: { g1: g }, notes: {}, assets: {}, revision: "rev" };
    const encode = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({
        asset: {
          id: "a".repeat(64),
          kind: "image",
          mime: "image/webp",
          width: 10,
          height: 10,
          byteLength: 4,
          alt: "Screenshot 2",
          originalName: "ok.webp",
        },
        base64: "AAAA",
      });

    const result = await importSteamMediaForGame({
      apiKey: "k",
      steamid: "1",
      library,
      game: g,
      appid: 570,
      now: NOW,
      getUserScreenshots: async () => [
        { id: "s1", pathFull: "https://example/1.jpg" },
        { id: "s2", pathFull: "https://example/2.jpg" },
      ],
      getUserVideos: async () => [],
      fetchAndEncodeSteamImage: encode,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.screenshotsEncoded).toBe(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.mediaNote.attachments).toHaveLength(1);
    expect(result.encodedAssets).toHaveLength(1);
  });

  it("upserts empty media note when UGC empty", async () => {
    const g = game("g1", 570);
    const library = { games: { g1: g }, notes: {}, assets: {}, revision: "rev" };
    const result = await importSteamMediaForGame({
      apiKey: "k",
      steamid: "1",
      library,
      game: g,
      appid: 570,
      now: NOW,
      getUserScreenshots: async () => [],
      getUserVideos: async () => [],
      fetchAndEncodeSteamImage: vi.fn(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mediaNote.attachments).toEqual([]);
    expect(result.mediaNote.bodyMarkdown).toContain("<!-- steam-media:v1 -->");
  });

  it("returns ok:false when GetUserFiles throws", async () => {
    const g = game("g1", 570);
    const library = { games: { g1: g }, notes: {}, assets: {}, revision: "rev" };
    const result = await importSteamMediaForGame({
      apiKey: "k",
      steamid: "1",
      library,
      game: g,
      appid: 570,
      now: NOW,
      getUserScreenshots: async () => {
        throw new Error("rate limit");
      },
      getUserVideos: async () => [],
      fetchAndEncodeSteamImage: vi.fn(),
    });
    expect(result).toEqual({
      ok: false,
      gameId: "g1",
      appid: 570,
      error: "rate limit",
    });
  });
});

describe("mergePatchFragments", () => {
  it("merges operations and blobs", () => {
    const assetId = "b".repeat(64);
    const base = {
      patchVersion: 2,
      schemaVersion: 2,
      baseRevision: "r",
      operations: { "/games/x": { operation: "set" } },
      blobs: {},
    };
    const fragment = {
      operations: {
        "/notes/n1": { operation: "set", value: { id: "n1" } },
        [`/assets/${assetId}`]: { operation: "set", value: { id: assetId } },
      },
      blobs: { [assetId]: "QQ==" },
    };
    const merged = mergePatchFragments(base, fragment);
    expect(Object.keys(merged.operations)).toHaveLength(3);
    expect(merged.blobs[assetId]).toBe("QQ==");
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run tests/steam-media-import.test.ts`

Expected: FAIL (module / exports missing)

- [ ] **Step 3: Implement `scripts/lib/steamMediaImport.mjs`**

```js
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  getUserScreenshots as defaultGetUserScreenshots,
  getUserVideos as defaultGetUserVideos,
} from "./steamApi.mjs";
import { fetchAndEncodeSteamImage as defaultFetchAndEncode } from "./steamImage.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const domain = await import(pathToFileURL(path.join(root, "src/domain/steamMedia.ts")).href);
const { canonicalHash } = await import(pathToFileURL(path.join(root, "src/domain/canonical.ts")).href);

const MISSING_VALUE_HASH = "0".repeat(64);

export function listLibraryGamesWithSteamAppId(library) {
  const rows = [];
  for (const game of Object.values(library.games ?? {})) {
    const appid = game?.steamAppId;
    if (typeof appid === "number" && Number.isSafeInteger(appid) && appid > 0) {
      rows.push({ game, appid });
    }
  }
  return rows;
}

export function mediaTargetsFromPatchItems(patchItems) {
  const out = [];
  for (const item of patchItems) {
    const appid = item.game?.steamAppId;
    if (typeof appid === "number" && Number.isSafeInteger(appid) && appid > 0) {
      out.push({ game: item.game, appid });
    }
  }
  return out;
}

export function validateMediaTargetFlags(flags) {
  if (flags.all && (flags.appid != null || flags.gameId)) {
    throw new Error("Cannot combine --all with --appid/--game-id");
  }
  if (!flags.all && flags.appid == null && !flags.gameId) {
    throw new Error("Pass --appid and/or --game-id, or --all");
  }
}

export async function importSteamMediaForGame(input) {
  const getShots = input.getUserScreenshots ?? defaultGetUserScreenshots;
  const getVideos = input.getUserVideos ?? defaultGetUserVideos;
  const encode = input.fetchAndEncodeSteamImage ?? defaultFetchAndEncode;
  const { apiKey, steamid, library, game, appid, now } = input;
  const noVideoThumbs = Boolean(input.noVideoThumbs);

  let screenshots;
  let videos;
  try {
    screenshots = await getShots(apiKey, steamid, appid);
    videos = await getVideos(apiKey, steamid, appid);
  } catch (reason) {
    return {
      ok: false,
      gameId: game.id,
      appid,
      error: reason instanceof Error ? reason.message : String(reason),
    };
  }

  const skipped = [];
  const encodedAssets = [];
  const screenshotAssetIds = [];

  for (let index = 0; index < screenshots.length; index += 1) {
    const shot = screenshots[index];
    try {
      const encoded = await encode(shot.pathFull, {
        alt: `Screenshot ${index + 1}`,
        maxEdge: 1280,
        originalName: `steam-${appid}-shot-${shot.id}.webp`,
      });
      encodedAssets.push(encoded);
      screenshotAssetIds.push(encoded.asset.id);
    } catch (reason) {
      skipped.push({
        kind: "screenshot",
        id: String(shot.id),
        error: reason instanceof Error ? reason.message : String(reason),
      });
    }
  }

  const movieRows = [];
  for (const video of videos) {
    let thumbAssetId = null;
    if (!noVideoThumbs && video.previewUrl) {
      try {
        const encoded = await encode(video.previewUrl, {
          alt: video.name,
          maxEdge: 512,
          originalName: `steam-${appid}-video-${video.id}.webp`,
        });
        encodedAssets.push(encoded);
        thumbAssetId = encoded.asset.id;
      } catch (reason) {
        skipped.push({
          kind: "video-thumb",
          id: String(video.id),
          error: reason instanceof Error ? reason.message : String(reason),
        });
      }
    }
    movieRows.push({ name: video.name, url: video.url, thumbAssetId });
  }

  const attachments = domain.buildSteamMediaAttachments({
    screenshotAssetIds,
    movies: movieRows,
  });
  const existingNotes = Object.values(library.notes ?? {});
  const previousNote =
    existingNotes.find((note) => note.gameId === game.id && domain.isSteamMediaNote(note)) ?? null;
  const upsert = domain.upsertSteamMediaNote({
    gameId: game.id,
    existingNotes,
    attachments,
    now,
  });
  const mediaNote = upsert.notes.find((note) => note.id === upsert.mediaNoteId);
  if (!mediaNote) {
    return { ok: false, gameId: game.id, appid, error: "Media note missing after upsert" };
  }

  return {
    ok: true,
    gameId: game.id,
    appid,
    encodedAssets,
    mediaNote,
    previousNote,
    mediaNoteExisted: Boolean(previousNote),
    skipped,
    screenshotsRequested: screenshots.length,
    screenshotsEncoded: screenshotAssetIds.length,
    videos: videos.length,
  };
}

export function buildMediaNotePatchFragment(input) {
  const { result, now, transactionId, existingAssetIds, libraryAssets } = input;
  const operations = {};
  const blobs = {};
  for (const row of result.encodedAssets) {
    const existed = existingAssetIds.has(row.asset.id);
    operations[`/assets/${row.asset.id}`] = {
      operation: "set",
      value: row.asset,
      baseExists: existed,
      baseHash: existed ? canonicalHash(libraryAssets[row.asset.id]) : MISSING_VALUE_HASH,
      changedAt: now,
      transactionId,
    };
    blobs[row.asset.id] = row.base64;
  }
  operations[`/notes/${result.mediaNote.id}`] = {
    operation: "set",
    value: result.mediaNote,
    baseExists: result.mediaNoteExisted,
    baseHash:
      result.mediaNoteExisted && result.previousNote
        ? canonicalHash(result.previousNote)
        : MISSING_VALUE_HASH,
    changedAt: now,
    transactionId,
  };
  return { operations, blobs };
}

export function mergePatchFragments(basePatch, fragment) {
  const operations = { ...basePatch.operations, ...fragment.operations };
  const blobs = { ...basePatch.blobs, ...fragment.blobs };
  for (const id of Object.keys(blobs)) {
    if (!operations[`/assets/${id}`]) throw new Error(`Orphan blob ${id}`);
  }
  return { ...basePatch, operations, blobs };
}
```

Prefill game-field ops stay only in `import-steam-media.mjs` (not shared core).

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run tests/steam-media-import.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/steamMediaImport.mjs tests/steam-media-import.test.ts
git commit -m "$(cat <<'EOF'
feat(steam): shared best-effort media import helper

Extract fetch/encode/note upsert so import + bulk crawl share one path.
EOF
)"
```

---

### Task 2: CLI `--all` + refactor `import-steam-media` + just recipes

**Files:**
- Modify: `scripts/import-steam-media.mjs`
- Modify: `justfile`
- Modify: `tests/steam-media-import.test.ts` (already has `validateMediaTargetFlags`)

**Interfaces:**
- Consumes: `importSteamMediaForGame`, `buildMediaNotePatchFragment`, `mergePatchFragments`, `listLibraryGamesWithSteamAppId`, `validateMediaTargetFlags`
- Produces: CLI `--all`; just `steam-import-media-all` / `steam-import-media-all-via-patch`

- [ ] **Step 1: Extend parseArgs + usage**

- Add `all: false`; `--all` sets it
- Call `validateMediaTargetFlags(flags)` after parse (replace old appid/gameId-only check)
- Default `--out` when `--all` and not `--apply`: `steam-media-import-all.patch.json`
- Update `usage()` to document `--all`, best-effort encode, mutual exclusion

- [ ] **Step 2: Extract `applyAndWrite(library, patch)`**

Pull the existing `--apply` body (mkdir media, `applyPatch`, write blobs with collision check, write `library.json`) into a local helper used by one-game and `--all`.

- [ ] **Step 3: Refactor one-game path to shared helper**

Replace inline screenshot/video encode loop with `importSteamMediaForGame`. On `ok: false` in one-game mode → `process.exit(1)`. Prefill cover/game ops stay after media result (local).

Best-effort: one-game no longer aborts on one bad encode.

- [ ] **Step 4: Implement `--all` loop**

```js
const targets = listLibraryGamesWithSteamAppId(library);
if (!targets.length) {
  console.log(JSON.stringify({ all: true, games: 0, message: "no games with steamAppId" }));
  process.exit(0);
}

let working = library;
const failedGames = [];
const summaries = [];
const transactionId = `steam-media-all-${now}`;
let combinedPatch = {
  patchVersion: 2,
  schemaVersion: 2,
  baseRevision: library.revision || computeRevision(library),
  operations: {},
  blobs: {},
};

for (const { game, appid } of targets) {
  console.log(`media ${game.title} (${game.id}) appid=${appid}`);
  const result = await importSteamMediaForGame({
    apiKey,
    steamid,
    library: working,
    game,
    appid,
    now,
    noVideoThumbs: flags.noVideoThumbs,
  });
  if (!result.ok) {
    failedGames.push({ gameId: game.id, appid, error: result.error });
    console.warn(`skip game ${game.id}: ${result.error}`);
    continue;
  }
  const fragment = buildMediaNotePatchFragment({
    result,
    now,
    transactionId,
    existingAssetIds: new Set(Object.keys(working.assets ?? {})),
    libraryAssets: working.assets ?? {},
  });

  if (flags.apply) {
    const mini = {
      patchVersion: 2,
      schemaVersion: 2,
      baseRevision: working.revision || computeRevision(working),
      operations: fragment.operations,
      blobs: fragment.blobs,
    };
    working = applyAndWrite(working, mini);
  } else {
    combinedPatch = mergePatchFragments(combinedPatch, fragment);
    working = applyPatch(working, {
      patchVersion: 2,
      schemaVersion: 2,
      baseRevision: working.revision || "",
      operations: fragment.operations,
      blobs: {},
    });
  }
  summaries.push({
    gameId: game.id,
    appid,
    screenshotsEncoded: result.screenshotsEncoded,
    skipped: result.skipped.length,
    videos: result.videos,
  });
}

if (flags.out && !flags.apply) {
  writeFileSync(path.resolve(root, flags.out), `${JSON.stringify(combinedPatch, null, 2)}\n`);
}

console.log(JSON.stringify({
  all: true,
  games: summaries.length,
  failedGames,
  summaries,
  applied: flags.apply,
}));
process.exit(0); // even if failedGames non-empty
```

- [ ] **Step 5: Justfile recipes**

```just
# Steam media for every library game with steamAppId → patch
steam-import-media-all-via-patch *ARGS:
    npm run import:steam-media -- --all {{ARGS}}

# Steam media for every library game with steamAppId → public/data + public/media
steam-import-media-all *ARGS:
    npm run import:steam-media -- --all --apply {{ARGS}}
```

- [ ] **Step 6: Smoke CLI help**

Run: `npm run import:steam-media -- --help`

Expected: shows `--all`, mutual exclusion, best-effort note.

- [ ] **Step 7: Run tests**

Run: `npx vitest run tests/steam-media-import.test.ts tests/steam-media.test.ts`

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add scripts/import-steam-media.mjs justfile tests/steam-media-import.test.ts
git commit -m "$(cat <<'EOF'
feat(steam): add --all media crawl + just recipes

Bulk profile UGC into every library game with steamAppId.
EOF
)"
```

---

### Task 3: Wire media into `steam-import` (touched games)

**Files:**
- Modify: `scripts/import-steam.mjs`
- Modify: `tests/steam-media-import.test.ts` (`mediaTargetsFromPatchItems` already covered in Task 1)

**Interfaces:**
- Consumes: `importSteamMediaForGame`, `buildMediaNotePatchFragment`, `mergePatchFragments`, `mediaTargetsFromPatchItems`
- Produces: `--no-media`; media ops merged into same patch as games/covers

- [ ] **Step 1: Add `--no-media` flag**

```js
noMedia: false,
// ...
else if (arg === "--no-media") flags.noMedia = true;
```

Update file header comment + help: media on by default for touched games; `--no-media` skips.

- [ ] **Step 2: After `buildSteamUpsertPatch`, before out/apply**

Change `const patch` → `let patch`. After orphan-blob validation of the game patch, before writing:

```js
const mediaFailedGames = [];
let mediaSkippedFiles = 0;
let mediaGames = 0;

if (!flags.noMedia) {
  let working = applyPatch(library, patch);
  const transactionId = `steam-import-media-${now}`;
  for (const { game, appid } of mediaTargetsFromPatchItems(patchItems)) {
    process.stdout.write(`media appid=${appid} ${game.title}\n`);
    const result = await importSteamMediaForGame({
      apiKey,
      steamid,
      library: working,
      game,
      appid,
      now,
    });
    if (!result.ok) {
      mediaFailedGames.push({ gameId: game.id, appid, error: result.error });
      console.warn(`media skip ${appid}: ${result.error}`);
      continue;
    }
    mediaGames += 1;
    mediaSkippedFiles += result.skipped.length;
    const fragment = buildMediaNotePatchFragment({
      result,
      now,
      transactionId,
      existingAssetIds: new Set(Object.keys(working.assets ?? {})),
      libraryAssets: working.assets ?? {},
    });
    patch = mergePatchFragments(patch, fragment);
    working = applyPatch(working, {
      patchVersion: 2,
      schemaVersion: 2,
      baseRevision: working.revision || "",
      operations: fragment.operations,
      blobs: {},
    });
  }
}
```

Add `mediaGames`, `mediaFailedGames`, `mediaSkippedFiles` to final summary JSON.

`--dry-run` already exits before patch build — no media downloads (unchanged).

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/steam-media-import.test.ts tests/steam-import.test.ts`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add scripts/import-steam.mjs
git commit -m "$(cat <<'EOF'
feat(steam): attach profile media during steam-import

Default media for touched games; --no-media to skip.
EOF
)"
```

---

### Task 4: README + verification gate

**Files:**
- Modify: `README.md` (Steam import / media sections ~151–237)

- [ ] **Step 1: Update README**

Document:
- `just steam-import` attaches «Медиа Steam» for created/updated games (profile UGC)
- `--no-media` to skip
- `just steam-import-media-all` / `steam-import-media-all-via-patch` for full library crawl
- Best-effort: failed encodes skipped; note still upserted
- Keep one-game recipes

- [ ] **Step 2: Full gate**

Run:

```bash
npx vitest run tests/steam-media-import.test.ts tests/steam-media.test.ts tests/steam-api.test.ts tests/steam-import.test.ts
npm test
npm run data:validate
npm run build
```

Expected: all pass

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs(steam): document bulk media + import default media
EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|---|---|
| Shared `steamMediaImport.mjs` | 1 |
| Best-effort encode | 1 |
| Empty UGC upsert | 1 |
| Per-game API fail continue | 1, 2, 3 |
| `--all` + just recipes | 2 |
| Sequential `--apply` for bulk | 2 |
| Combined `--out` patch for bulk | 2 |
| `steam-import` media for touched only | 3 |
| `--no-media` | 3 |
| Same patch single write | 3 |
| No progress-file media cache | 3 (no progress writes) |
| README | 4 |
| Exit 0 with failedGames | 2, 3 |

## Placeholder / consistency self-review

- No TBD; names consistent across tasks (`importSteamMediaForGame`, `buildMediaNotePatchFragment`, `mergePatchFragments`, `mediaTargetsFromPatchItems`)
- Prefill stays only in one-game media CLI (not bulk, not steam-import)
- One-game CLI: `ok: false` → exit 1; bulk/import: continue + summary
