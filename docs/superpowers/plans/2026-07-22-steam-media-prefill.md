# Steam Media Prefill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-game Steam screenshot WebP note + trailer store links; paste URL/appid empty-only prefill; CLI + GamePage.

**Architecture:** Extend storefront `getAppDetails` with screenshots/movies; pure `src/domain/steamMedia.ts` for parse/prefill/media-note helpers; Node `import-steam-media.mjs` for reliable apply; GamePage prefill + «Подтянуть медиа Steam» using same domain helpers (SPA fetch; CORS fail → CLI hint).

**Tech Stack:** TypeScript domain, Vitest, Node + sharp (existing), `@jsquash/webp` / existing `prepareImage` path in SPA, React GamePage, HashRouter app.

**Spec:** `docs/superpowers/specs/2026-07-22-steam-media-prefill-design.md`

## Global Constraints

- Never write `placement` / `reviewMarkdown` via this feature
- Empty-only prefill for title/tags/cover; no overwrite of filled fields
- Media note marker exactly `<!-- steam-media:v1 -->`; re-pull replaces attachments wholesale
- No screenshot cap; no HLS/mp4 in `public/media`
- All-or-nothing media note replace (abort without replace if any encode fails)
- SPA respects `canAddBlob` / storage lock; CORS fail → RU error + CLI hint
- Single game only (no full-library media crawl)
- Store link whenever `steamAppId != null`
- Schema v2 / orphan asset GC unchanged
- Do not commit `.cursor/` skills; leave unrelated `tsconfig.app.json` dirty alone

## File map

| Path | Responsibility |
|---|---|
| `scripts/lib/steamApi.mjs` | Parse screenshots/movies from appdetails |
| `src/domain/steamImport.ts` | Extend `SteamAppDetailsSlice` type |
| `src/domain/steamMedia.ts` | Parse app input, prefill, note marker, attachment builders, note upsert helper |
| `scripts/lib/steamImage.mjs` | Generic URL → WebP asset blob (CLI) |
| `scripts/import-steam-media.mjs` | CLI single-game media + optional prefill |
| `package.json` / `justfile` | `import:steam-media`, just recipes |
| `src/pages/GamePage.tsx` | Prefill UI, media button, store link |
| `src/styles.css` | Dense controls if needed |
| `tests/steam-media.test.ts` | Domain unit |
| `tests/steam-api.test.ts` | appdetails media fixtures |
| `tests/steam-media-ui.test.tsx` | GamePage behaviors |
| `README.md` | Checklist «Заполнение одной игры» |

---

### Task 1: appdetails media parse + `steamMedia` domain

**Files:**
- Modify: `scripts/lib/steamApi.mjs` — `getAppDetails` return screenshots/movies
- Modify: `src/domain/steamImport.ts` — `SteamAppDetailsSlice`
- Create: `src/domain/steamMedia.ts`
- Create: `tests/steam-media.test.ts`
- Modify: `tests/steam-api.test.ts` (or new fixtures)

**Interfaces:**

```ts
// steamImport.ts — extend SteamAppDetailsSlice
screenshots?: Array<{ id: number; pathFull: string; pathThumbnail: string }>;
movies?: Array<{ id: number; name: string; thumbnail: string | null }>;

// steamMedia.ts
export const STEAM_MEDIA_NOTE_MARKER = "<!-- steam-media:v1 -->";

export function parseSteamAppInput(raw: string): number;
export function steamStoreAppUrl(appid: number): string;
export function isSteamMediaNote(note: Pick<Note, "bodyMarkdown">): boolean;
export function steamMediaNoteBody(): string; // marker + "\n\n## Медиа Steam\n"

export function prefillGameFromSteamDetails(
  game: Pick<Game, "title" | "tags" | "coverAssetId" | "steamAppId" | "importedVia" | "platforms">,
  details: Pick<SteamAppDetailsSlice, "name" | "genres">,
  options: { appid: number; coverAssetId?: string | null },
): Partial<Game>;

export function buildSteamMediaAttachments(input: {
  appid: number;
  screenshotAssetIds: readonly string[];
  screenshotAlts?: readonly string[];
  movies: ReadonlyArray<{ name: string; thumbAssetId?: string | null }>;
}): NoteAttachment[];

export function upsertSteamMediaNote(input: {
  gameId: string;
  existingNotes: readonly Note[];
  attachments: NoteAttachment[];
  now: string;
}): { notes: Note[]; mediaNoteId: string; created: boolean };
```

**`parseSteamAppInput`:** accept digits; URLs with `/app/123/` or `store.steampowered.com/app/123`; throw RU error on bad input.

**Prefill rules:** per spec table (empty title/tags/cover/platforms; set steamAppId if null; importedVia manually→steam when appid applied).

**`upsertSteamMediaNote`:** find `isSteamMediaNote`; if found keep id/rank/groupRank/createdAt, replace attachments + body via `steamMediaNoteBody()`, bump `updatedAt`; else create new note with rank after max for game.

- [ ] **Step 1:** Failing tests — parse URL/appid; prefill empty vs skip filled; marker detect; attachments shape; upsert create then replace keeps id

- [ ] **Step 2:** `npx vitest run tests/steam-media.test.ts` — FAIL

- [ ] **Step 3:** Implement domain + extend `getAppDetails` parsing:

```js
screenshots: Array.isArray(data.screenshots)
  ? data.screenshots.map((s) => ({
      id: Number(s.id),
      pathFull: String(s.path_full ?? ""),
      pathThumbnail: String(s.path_thumbnail ?? ""),
    })).filter((s) => s.pathFull)
  : [],
movies: Array.isArray(data.movies)
  ? data.movies.map((m) => ({
      id: Number(m.id),
      name: String(m.name ?? "Trailer").trim() || "Trailer",
      thumbnail: typeof m.thumbnail === "string" ? m.thumbnail : null,
    }))
  : [],
```

- [ ] **Step 4:** Fixture tests for API parse; vitest PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(domain): Steam app parse, prefill, and media note helpers

EOF
)"
```

---

### Task 2: CLI URL→WebP + `import-steam-media`

**Files:**
- Create: `scripts/lib/steamImage.mjs` — `fetchAndEncodeSteamImage(url, { alt, maxEdge?: number })` (default max edge 1280 or reuse 512 like covers — **decision: max edge 1280 for screenshots, 512 for thumbs/covers**)
- Create: `scripts/import-steam-media.mjs`
- Modify: `package.json` — `"import:steam-media": "node --experimental-strip-types scripts/import-steam-media.mjs"`
- Modify: `justfile` — `steam-import-media` / `steam-import-media-via-patch` mirroring steam-import pattern
- Modify: `tests/*` for image helper with mocked fetch if feasible

**CLI flags:**

```
--appid <n>
--game-id <uuid>
--apply
--out <path>
--dry-run
--prefill
--no-trailer-thumbs
```

Require `--appid` or `--game-id`. Resolve: if game-id → library game; appid must match or fill; if only appid → `findGameBySteamAppId`.

Patch ops: asset sets + note set (and optional game set for prefill). Use same `applyPatch` / media write pattern as `import-steam.mjs`. Import domain via `pathToFileURL(.../steamMedia.ts)` with `.ts` extensions on any runtime relative imports inside that module.

All-or-nothing: download+encode all screenshots (and thumbs unless `--no-trailer-thumbs`) into memory first; on any failure exit before writing note; then build patch.

- [ ] **Step 1:** Implement `steamImage.mjs` (can TDD encode path lightly with tiny PNG fixture)

- [ ] **Step 2:** Implement CLI; `node scripts/import-steam-media.mjs --help` shows flags

- [ ] **Step 3:** Dry-run against library with a known steamAppId (optional live); unit tests without network preferred

- [ ] **Step 4:**

```bash
npx vitest run tests/steam-media.test.ts tests/steam-api.test.ts
npm run build
```

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(steam): CLI import Steam media note for one game

EOF
)"
```

---

### Task 3: GamePage store link + prefill

**Files:**
- Modify: `src/pages/GamePage.tsx` — NewGame + InlineGamePage
- Modify: `src/styles.css` — compact Steam paste row
- Create: `tests/steam-media-ui.test.tsx` (start with prefill + link cases)

**Store link:** When `game.steamAppId != null`, show link to `steamStoreAppUrl(appid)` in sidebar (label «Steam» / store), even if `importedVia === "manually"`. Keep existing importedVia steam link behavior without duplication — one store link is enough.

**Prefill UI:**
- Input + button «Подтянуть из Steam» (or paste-on-blur)
- On submit: `parseSteamAppInput` → `fetch` storefront `https://store.steampowered.com/api/appdetails?appids=…&l=russian` → map to `SteamAppDetailsSlice` (shared mapper function in `steamMedia.ts`: `steamAppDetailsFromStoreJson(appid, body)`)
- Apply `prefillGameFromSteamDetails` via `persist` / draft setters (empty only)
- If cover empty and `headerImage` present: fetch image blob → existing prepare cover path (`prepareImage` / ImagePicker pipeline) then persist `pendingCover`
- CORS/network error: setError with CLI hint including appid

For **NewGamePage**: update local state only (title/tags/platforms/steamAppId/pendingCover); set importedVia steam when appid set.

- [ ] **Step 1:** Failing UI tests — manual+appid shows store link; prefill sets empty title from mocked fetch

- [ ] **Step 2:** Implement UI + `steamAppDetailsFromStoreJson` helper used by SPA and tests

- [ ] **Step 3:** vitest UI + build PASS

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(ui): Steam URL prefill and store link on game page

EOF
)"
```

---

### Task 4: GamePage «Подтянуть медиа Steam»

**Files:**
- Modify: `src/pages/GamePage.tsx` — InlineGamePage button
- Modify: `src/styles.css` if needed
- Extend: `tests/steam-media-ui.test.tsx`

**Behavior:**
- Button enabled when `steamAppId` set and not `storageLocked`
- On click: fetch details → for each screenshot `pathFull`, fetch bytes → encode WebP via existing browser asset prep (same as note image attach / `prepareNoteAttachment` patterns) into `pending-image` attachments
- Trailer: link attachments + optional thumb pending-images
- Build next notes list via domain upsert mapped to `EditableNote` (convert pending images)
- `persist({ notes: nextNotes })` — all-or-nothing: if any fetch/encode fails before persist, show error, do not persist
- Progress: optional status text «Скачиваем скриншоты… i/n»
- CORS fail → CLI hint

EditableNote conversion: new media note gets `clientId` = existing note id or new uuid; `bodyMarkdown` = `steamMediaNoteBody()`; attachments as pending-image / link.

- [ ] **Step 1:** Failing test — button disabled without appid; with appid + mock fetch, persist called with media marker note

- [ ] **Step 2:** Implement pull flow

- [ ] **Step 3:**

```bash
npx vitest run tests/steam-media-ui.test.tsx tests/steam-media.test.ts
npm run build
```

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(ui): pull Steam screenshots into media note

EOF
)"
```

---

### Task 5: README + full verify

**Files:**
- Modify: `README.md` — document `import:steam-media`, prefill/media buttons; check off «Заполнение одной игры» bullets this pass completes

- [ ] **Step 1:**

```bash
npm test
npm run data:validate
npm run build
```

Expected: PASS

- [ ] **Step 2:** README + commit

```bash
git commit -m "$(cat <<'EOF'
docs: Steam per-game media prefill and import

EOF
)"
```

---

## Self-review (plan vs spec)

| Spec item | Task |
|---|---|
| appdetails screenshots/movies | 1 |
| parse / prefill / media note helpers | 1 |
| CLI single-game media + prefill flag | 2 |
| SPA prefill + store link | 3 |
| SPA media pull all-or-nothing | 4 |
| README / verify | 5 |
| No full-library crawl / no HLS hosting / empty-only | constraints |

No TBD placeholders. `upsertSteamMediaNote` + `steamAppDetailsFromStoreJson` named for implementers across CLI/SPA.
