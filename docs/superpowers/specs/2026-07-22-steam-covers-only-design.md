# Steam covers-only refresh — design

Date: 2026-07-22

Related: `2026-07-22-steam-cover-attention-crop-design.md`, `2026-07-22-steam-reimport-locks-design.md`, `2026-07-22-steam-media-bulk-design.md` (standalone library crawl pattern)

## Goal

Cover-only CLI / just tactic: re-download and attach/replace Steam covers for library games that already have `steamAppId`. Touch only `coverAssetId` + new image asset. No owned-games API, snapshot, achievements, game creates, or title/tags/status merges.

Use case: batch re-crop after attention-encode change (or fill/replace covers) without a full `steam-import` reimport.

## Decisions

| Topic | Choice |
|---|---|
| Architecture | Standalone CLI (mirror `steam-import-media --all`), not a flag on `import-steam` |
| Target set | Every library game with positive `steamAppId` |
| Locked covers | Respect `steamOverrides.coverAssetId`; `--force` ignores lock |
| Existing unlocked covers | Always re-fetch + replace when asset id changes |
| Same bytes / same id | Count `unchanged`; no write |
| Creates | None — games must already exist |
| Steam Web API key | Not required (CDN cover path only) |
| Storefront details / `header_image` | Out — CDN `library_600x900` only via `fetchAndEncodeSteamCover` |
| Snapshot / progress | Untouched |
| `steamOverrides` writes | Do not set `coverAssetId` mark (CLI ≠ user edit) |
| SPA | No change |
| Exit code | `0` when run finishes; non-zero only on fatal (bad flags / missing library) |

## Architecture

```
steamCover.mjs (fetch + encode)
        ↑
import-steam-covers.mjs
        ↓
  patch (asset create + game coverAssetId update)
  or --apply → public/data + public/media
```

No domain merge through `mergeSteamGameUpdate` — cover field only. Reuse existing patch/apply helpers already used by steam import/media scripts.

## CLI / just

### `scripts/import-steam-covers.mjs` + `npm run import:steam-covers`

| Flag | Behavior |
|---|---|
| `--apply` | Write `public/data/library.json` + `public/media` |
| `--out <path>` | Patch JSON (default `steam-covers.patch.json` unless `--apply`) |
| `--force` | Ignore `steamOverrides.coverAssetId` |
| `--appids a,b,c` | Filter by Steam app id |
| `--game-id <uuid>` | One library game |
| `--limit n` | Cap after filter |
| `--dry-run` | Counts only; no fetch / no write |

`--apply` XOR `--dry-run`. `--game-id` mutually exclusive with `--appids`. Missing `--game-id` → fatal. Empty `--appids` match set → finish with zero updates (exit 0).

### Justfile

| Recipe | Command |
|---|---|
| `steam-import-covers` | `import:steam-covers -- --apply` |
| `steam-import-covers-via-patch` | `import:steam-covers` (patch default) |

## Per-game flow

1. Load published library.
2. Select games with positive `steamAppId`; apply filters.
3. Skip if locked and not `--force` → `skippedLocked`.
4. `fetchAndEncodeSteamCover(appid)` (CDN only).
5. Null / throw → log; `coversFailed++`; continue.
6. If `asset.id === game.coverAssetId` → `unchanged++`; continue.
7. Else emit asset create + game update (`coverAssetId` only as field op); apply derives `updatedAt` from op `changedAt`. Orphan previous cover left for existing GC / validate (same as steam-import).

## Error handling

| Case | Behavior |
|---|---|
| Cover fetch/encode fail | Skip game; continue |
| Locked cover | Skip unless `--force` |
| Missing library / bad flags | Fatal |
| No matching games | Finish with zero updates; exit 0 |

## Out of scope

- `--missing-only`
- Wiring covers-only into `steam-import` / owned-games path
- Storefront `header_image` fallback round-trip
- Snapshot / progress / media notes
- SPA cover refresh UI
- Orphan asset GC rewrite
- Attention-crop algorithm changes (already separate spec)

## Tests

- Locked skip vs `--force` replace
- Patch ops: only asset create + `coverAssetId` on game (`updatedAt` via apply `changedAt`, not a field op)
- Filter / `--limit` / `--game-id`
- Same-id → no update op
- Mock fetch like `tests/steam-cover.test.ts`

## Verification

```bash
just steam-import-covers-via-patch -- --limit 2
just steam-import-covers -- --limit 2
npx vitest run tests/steam-covers-import.test.ts tests/steam-cover.test.ts
npm test
npm run data:validate
npm run build
```

## Docs

- README Steam section: covers-only recipes + `--force` lock behavior
- justfile comments next to other steam recipes
