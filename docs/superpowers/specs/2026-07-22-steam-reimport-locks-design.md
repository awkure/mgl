# Steam reimport, snapshot, and field locks — design

Date: 2026-07-22

## Goal

Turn one-shot Steam import into safe **incremental reimport**: skip unchanged owned games via a sidecar snapshot; update only allowed Steam-managed fields; respect user overrides and terminal statuses; never clobber tier/review. Achievements UI/API stay out of scope, but merge reserves the **platinum → do not overwrite achievement progress** rule (unless `--force`).

## Scope

**In (subsystem A):**

- Sidecar snapshot + per-appid diff skip
- Explicit `steamOverrides` marks (auto on edit) + `--force`
- Soft-only status heuristics on reimport
- Partial updates for existing `steamAppId` games; create path unchanged for new appids
- Domain pure merge + CLI orchestration

**Out:**

- Achievements fetch/UI/catalog bar (subsystem B) — only platinum skip hook
- Per-game screenshots/videos (C)
- GHA Import Steam, Steam key in localStorage, 429/pagination (D)
- SPA-triggered reimport
- `--force` rewriting `placement` or `reviewMarkdown`

Related README checklist: «Статус и playtime» + overlapping «снимок» under sync (low-pri bullets that duplicate snapshot stay covered here).

## Decisions

| Topic | Choice |
|---|---|
| Approach | Domain merge helpers + CLI I/O |
| Lock model | Hybrid: snapshot skip-if-unchanged + explicit `steamOverrides` |
| Snapshot location | `public/data/steam-import-snapshot.json` (sidecar, published) |
| Reimport allowlist | `hoursPlayed`, `lastPlayedAt`, `status`, `tags`, `title`, `coverAssetId` |
| Never on reimport | `placement`, `reviewMarkdown` (even with `--force`) |
| Marks | Auto when Steam game field edited in app |
| Soft statuses | `wishlist` \| `playing` \| `played` — heuristic may rewrite |
| Terminal statuses | `completed` \| `platinum` \| `dropped` — no heuristic rewrite without `--force` |
| Platinum + achievements | If `status === "platinum"`, skip achievement-progress writes unless `--force` |
| `--force` | Ignore `steamOverrides`; allow status rewrite including terminal; still never touch tier/review |

## Data model

### Game

New field (schema v2 exact keys):

```ts
steamOverrides: Partial<Record<SteamOverrideKey, true>>
```

For this pass:

```ts
type SteamOverrideKey = "title" | "tags" | "status" | "coverAssetId"
```

- Default / migrate: `{}`
- `hoursPlayed` / `lastPlayedAt` are not override keys — always eligible when Steam values change
- Later achievements pass may extend `SteamOverrideKey`; platinum rule is merge policy, not only a mark

Exact key sets must update:

- `src/domain/types.ts`
- `src/domain/validation.ts` (`ENTITY_FIELDS`, shape rules)
- `scripts/validate-data.mjs`
- fixtures / test factories
- `public/data/library.json` — every game gets `steamOverrides: {}`

`LOCALLY_PATCHABLE_FIELDS`: include `steamOverrides` so patches and editor mutations can set marks.

### Snapshot sidecar

Path: `public/data/steam-import-snapshot.json`

```ts
{
  version: 1,
  profileKey: string,   // resolved steamID64
  fetchedAt: string,    // ISO-8601 UTC
  games: Record<string /* appid decimal */, {
    name: string,
    playtimeForever: number,   // Steam minutes
    playtime2Weeks: number,
    rtimeLastPlayed: number,   // unix seconds, 0 if unknown
    genres: string[],          // last storefront genres used for tags
    headerImage: string | null
  }>
}
```

- Not embedded in `library.json`; SPA browse does not load it
- Missing / invalid file = no snapshot skips (known games still run merge vs library); write full snapshot after successful `--apply`
- Do not commit a stub file; first successful `--apply` creates it
- After successful `--apply`, replace `games` map for that `profileKey` with the owned set observed this run (full replace, not sparse)
- If file `profileKey` ≠ current resolve: ignore old rows for skips; rewrite snapshot on success

## Marking overrides

When a game has `importedVia === "steam"` and the user (or local patch apply that represents an editor save) changes `title` | `tags` | `status` | `coverAssetId`, set `steamOverrides[field] = true`.

- No dedicated lock toggles in UI for A
- GamePage: if any `steamOverrides` key set, show one read-only line «поля защищены от Steam»
- Clearing marks is out of scope except via `--force` (one-shot ignore, does not clear stored marks) or a future explicit unlock

## Merge algorithm

Domain module (prefer `src/domain/steamReimport.ts`, reuse mapping helpers from `steamImport.ts`).

### Inputs

- Current `LibraryDatabase` (or games map)
- Previous snapshot (or null)
- Fresh owned list + optional storefront details (same as today’s import)
- `{ force: boolean }`

### Split

1. Filter owned rows with existing import filters (`playedOnly`, `appids`, name/type excludes). `--limit` caps total processed candidates after those filters (creates + updates together), same spirit as today’s CLI.
2. **Create:** no game with matching `steamAppId` → existing `mapSteamCandidateToGame` + cover path.
3. **Reimport:** matching `steamAppId` → merge path.

### Snapshot skip

For a known `appid`, if `!force` and snapshot entry exists and equals fresh slice on all of:

`name`, `playtimeForever`, `playtime2Weeks`, `rtimeLastPlayed`, `genres` (order-insensitive compare), `headerImage`

→ count `skippedUnchanged`, emit no game op.

### Field writes (known game)

Start from existing `Game`. Propose Steam values via existing helpers (`hoursFromSteamMinutes`, `lastPlayedAtFromSteam`, `statusFromPlaytime`, `uniqueTagList`, title/cover from details/CDN as today).

| Field | Apply when |
|---|---|
| `hoursPlayed`, `lastPlayedAt` | proposed ≠ current |
| `title`, `tags`, `coverAssetId` | proposed ≠ current AND (`force` OR `!steamOverrides[field]`) |
| `status` | proposed ≠ current AND (`force` OR (`!steamOverrides.status` AND current ∈ soft set)) |
| achievement progress (B stub) | proposed differs AND NOT (`status === "platinum" && !force`) |
| `placement`, `reviewMarkdown` | never |
| `steamOverrides`, `id`, `steamAppId`, `importedVia`, `createdAt` | leave as-is (`updatedAt` bump if any field applied) |

If no field actually changes after locks → treat as skip (locked or no-op), count `skippedLocked` when Steam wanted a change but marks/policy blocked all of it; otherwise `skippedUnchanged`.

Cover: only fetch/encode when merge decides `coverAssetId` may update (or create path).

### Outputs

- Patch ops (new games + asset blobs; updates as full-game `set` with `baseExists` / `baseHash` like other updates) **or** direct apply path unchanged
- Stats: `created`, `updated`, `skippedUnchanged`, `skippedLocked`
- New snapshot document for write after success

## CLI

Extend `scripts/import-steam.mjs` / `npm run import:steam`:

- New flag: `--force`
- Load/write `public/data/steam-import-snapshot.json` (path override optional later; default fixed)
- Print stats line with the four counters
- `--dry-run`: compute merge + stats; do not write library, media, or snapshot
- Write snapshot **only** with successful `--apply` (after library + media write). Patch-only mode leaves snapshot unchanged so a discarded patch cannot poison skip state.

## Error handling

- Invalid/missing snapshot JSON → warn, treat as null snapshot (no skips), continue; overwrite with valid snapshot on next successful `--apply`
- Profile resolve / API errors unchanged (`SteamApiError`)
- Schema validation failures abort before snapshot write

## Testing

- Unit: snapshot equality; merge matrix (marks, soft vs terminal status, platinum achievement stub, `--force`, never tier/review)
- Context/unit: Steam game title edit → `steamOverrides.title`
- Migrate fixtures + `library.json` empty overrides
- `npm test`, `npm run data:validate`, `npm run build`

## Files (expected)

| Path | Change |
|---|---|
| `src/domain/types.ts` | `steamOverrides`, `SteamOverrideKey` |
| `src/domain/validation.ts` | exact keys + shape |
| `scripts/validate-data.mjs` | mirror |
| `src/domain/steamReimport.ts` | snapshot types, diff, merge |
| `src/domain/steamImport.ts` | shared helpers only if needed |
| `scripts/import-steam.mjs` | `--force`, snapshot I/O, create+update pipeline |
| `src/state/LibraryContext.tsx` | auto-mark on Steam field edits |
| `src/pages/GamePage.tsx` | override hint line when marks present |
| `public/data/library.json` | `steamOverrides: {}` |
| `public/data/steam-import-snapshot.json` | created on first successful `--apply` (not stubbed in repo) |
| `tests/*` | domain + context + validate |
| `README.md` | document `--force`, snapshot, reimport behavior |

## Verification

```bash
npm test
npm run data:validate
npm run build
```

Manual: import once `--apply`; second run → mostly `skippedUnchanged`; edit title in UI; reimport → title kept, hours may still update; set status `platinum`; reimport without `--force` → status + (future) achievements untouched; `--force` updates status/marks-ignored fields but leaves tier/review.
