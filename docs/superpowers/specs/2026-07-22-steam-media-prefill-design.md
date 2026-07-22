# Steam per-game media + prefill (C + C2) — design

Date: 2026-07-22

**Screenshot source amended:** see `2026-07-22-steam-profile-screenshots-design.md` —
profile `GetUserFiles` (CLI + API key), not storefront `appdetails.screenshots`. SPA media
button removed.

Roadmap: `2026-07-22-steam-followups-roadmap.md` (Spec C, includes C2)  
Depends on: A (Steam identity / covers / assets), existing note attachments

## Goal

For one game with a Steam appid: (1) prefill empty title/tags/cover from storefront when user pastes a Steam URL or appid; (2) pull all screenshots as WebP note images and trailers as store links (+ optional thumbs) into a dedicated idempotent «Медиа Steam» note. CLI is the reliable path; GamePage offers the same flows when browser fetch works.

## Decisions

| Topic | Choice |
|---|---|
| Scope | C media + C2 prefill/store link (together) |
| Screenshots | Download `path_full` → WebP SHA-256 image assets → note image attachments |
| Screenshot cap | None |
| Trailers | No HLS/mp4 hosting; link to store app page labeled with movie name; optional thumbnail image |
| Note model | One dedicated note per game, marker `<!-- steam-media:v1 -->` |
| Re-pull | Replace that note’s attachments wholesale |
| Prefill | Empty fields only (title / tags / cover) |
| Triggers | CLI + GamePage (SPA); CORS fail → RU error + CLI hint |
| Approach | Domain helpers + extended `getAppDetails` + CLI script + GamePage actions |

## Global constraints

- Never write `placement` / `reviewMarkdown` via Steam media/prefill
- Schema v2; published assets content-addressed; orphans GC’d after note replace
- Browser local assets stay in local asset store; published path via patch/`--apply`
- Steam Web API key not required for storefront `appdetails` (unofficial, no key)
- Quota: SPA respects `canAddBlob` / localStorage preflight before encoding many screenshots

## Storefront data

Extend `getAppDetails` (and typed slice used by domain) with:

```ts
screenshots: Array<{ id: number; pathFull: string; pathThumbnail: string }>;
movies: Array<{ id: number; name: string; thumbnail: string | null }>;
```

Existing fields unchanged: `type`, `name`, `genres`, `headerImage`.

## Domain

New module preferred: `src/domain/steamMedia.ts` (keep `steamImport` / `steamReimport` focused).

```ts
export const STEAM_MEDIA_NOTE_MARKER = "<!-- steam-media:v1 -->";

export function parseSteamAppInput(raw: string): number; // throws on bad input
export function steamStoreAppUrl(appid: number): string; // https://store.steampowered.com/app/{id}/

export function isSteamMediaNote(note: Pick<Note, "bodyMarkdown">): boolean;

export function prefillGameFromSteamDetails(
  game: Game,
  details: SteamAppDetailsSlice,
  options?: { coverAssetId?: string | null },
): Partial<Game>; // only empty fields; may include steamAppId if caller sets it separately

export function steamMediaNoteBody(): string; // marker + markdown heading «Медиа Steam»
```

Attachment building (after bytes → assets prepared by CLI/SPA):

- Screenshots → `{ type: "image", assetId, alt }`
- Each movie → `{ type: "link", url: steamStoreAppUrl(appid), label: movie.name }` then optional thumb image attachment if downloaded

Find existing media note: notes for `gameId` where `isSteamMediaNote`. Upsert: create if missing; else keep note id/ranks, replace `attachments`, refresh `updatedAt`, preserve marker body (or rewrite canonical body).

**Prefill empty-only rules:**

| Field | Fill when |
|---|---|
| `steamAppId` | null → set from parsed appid |
| `title` | empty/whitespace |
| `tags` | empty array → genres via `uniqueTagList` |
| `coverAssetId` | null and a cover was prepared |
| `importedVia` | if currently `"manually"` and prefill applied steamAppId → set `"steam"` |
| `platforms` | if empty → `["Steam"]` |

Do not overwrite non-empty title/tags/cover. Do not change status/placement/review/hours/achievements.

## CLI

New: `scripts/import-steam-media.mjs` + `npm run import:steam-media` (+ just recipe).

Flags (sketch):

- `--appid <n>` and/or `--game-id <uuid>` (at least one; resolve game in library)
- `--apply` / `--out` / `--dry-run` (mirror steam-import semantics where practical)
- `--prefill` — also apply empty-only field updates + cover if missing
- `--no-trailer-thumbs` — skip movie thumbnail downloads

Flow:

1. Resolve game + appid  
2. `getAppDetails`  
3. Optional prefill  
4. Download each screenshot full URL → encode WebP (sharp, same spirit as `steamCover.mjs`; may share helper for generic URL→WebP)  
5. Build/replace media note + asset ops in patch  
6. `--apply` writes library + media; patch-only writes patch file  

Never full-library crawl in this command (single game only).

## SPA

**New / edit GamePage:**

1. Control to paste Steam URL or appid → `parseSteamAppInput` → fetch storefront → `prefillGameFromSteamDetails` into draft/persist empty fields; prepare cover via existing image pipeline when cover empty.  
2. Button «Подтянуть медиа Steam» when `steamAppId` set: fetch details → download screenshots (and optional thumbs) → local assets → upsert media note through LibraryContext note save path.  
3. On CORS/network failure: RU message + hint to run `npm run import:steam-media -- --appid … --apply`.  
4. Store link in sidebar whenever `steamAppId != null` (not only `importedVia === "steam"`).

Respect `storageLocked` / `canAddBlob`; if quota insufficient mid-batch, stop with clear error (partial attachments optional: prefer all-or-nothing for the note replace to avoid half media notes — **decision: all-or-nothing**; if any encode fails after start, abort without replacing note).

## Testing

- Unit: `parseSteamAppInput`; empty-only prefill; `isSteamMediaNote`; attachment mapping  
- CLI/unit: appdetails media parse fixtures  
- UI: store link when manual+appid; prefill fills empty title; media button disabled without appid  
- `data:validate` after sample apply fixtures if committed

## Out of scope

- Automatic media for every owned game on `import:steam`  
- Hosting trailer video binaries / HLS in `public/media`  
- Screenshot count caps  
- Overwriting non-empty title/tags/cover  
- Specs D / E  
- Changing tier/review via this flow  

## Files (expected)

| Path | Change |
|---|---|
| `scripts/lib/steamApi.mjs` | screenshots + movies on appdetails |
| `src/domain/steamMedia.ts` | parse, prefill, note marker helpers |
| `scripts/lib/steamImage.mjs` or extend `steamCover.mjs` | URL → WebP asset blob |
| `scripts/import-steam-media.mjs` | CLI |
| `package.json` / `justfile` | script + recipe |
| `src/pages/GamePage.tsx` | prefill + media button + store link |
| `src/state/LibraryContext.tsx` | upsert media note / assets if needed |
| `src/styles.css` | dense control chrome if needed |
| `tests/*` | domain + UI + API fixtures |
| `README.md` | «Заполнение одной игры» checklist |

## Verification

```bash
npm test
npm run data:validate
npm run build
```

Manual: paste store URL on new/edit game → empty fields fill; «Подтянуть медиа» creates/replaces media note with screenshots; re-run replaces attachments; CLI `--apply` works when SPA CORS fails; store link visible for manual games with appid.
