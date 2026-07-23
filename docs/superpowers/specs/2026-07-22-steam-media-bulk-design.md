# Steam media bulk download — design

Date: 2026-07-22

Delta vs: `2026-07-22-steam-profile-screenshots-design.md`, `2026-07-22-steam-media-prefill-design.md`  
Related: `2026-07-22-steam-import-continue-design.md` (media stays outside progress cache)

## Goal

Download profile Steam screenshots/videos for library games and attach them as `<!-- steam-media:v1 -->` notes (GamePage media), via:

1. **`steam-import`** — media for games **created/updated in that run** (default on; `--no-media` to skip)
2. **`steam-import-media-all`** — full crawl of every library game with `steamAppId` (re-run without re-importing games)

Single-game `import:steam-media` stays.

## Decisions

| Topic | Choice |
|---|---|
| Architecture | Shared `scripts/lib/steamMediaImport.mjs`; both CLIs call it |
| Import media scope | Only games created/updated this `steam-import` run |
| Standalone bulk | `import-steam-media --all` + just `steam-import-media-all` |
| Failure mode | Best-effort: skip failed screenshot/thumb encodes; still upsert note with survivors |
| Per-game API fail | Log + skip that game; continue others |
| Exit code | `0` when run finishes; non-zero only on fatal (missing key/flags/library) |
| Empty UGC | Skip — do not create empty media note; leave existing note alone |
| Re-pull | Replace media-note attachments wholesale (marker idempotent) |
| Encode | Same as today: shot maxEdge 1280; video thumb 512; WebP into `public/media` |
| Source | Profile `GetUserFiles` only (filetype 4/3) — not storefront marketing |
| `--continue` | Media not cached; re-fetched for touched games unless `--no-media` |
| SPA | No change — CLI only |
| Video binaries | Links + optional thumbs only |

Amends prior out-of-scope: **full-library media crawl is now in scope** via `--all` / just recipe.

## Architecture

```
steamMedia.ts (domain note/attachments)
        ↑
steamMediaImport.mjs  ← encode + best-effort + note patch pieces
        ↑
   ┌────┴────┐
import-steam-media.mjs    import-steam.mjs
  (one game | --all)        (touched games after merge)
```

**Shared core** `scripts/lib/steamMediaImport.mjs`:

- Input: library (or mutable working copy), steamid, game, appid, `{ noVideoThumbs }`
- Fetch `getUserScreenshots` + `getUserVideos`
- Encode each image with try/catch; log skips; keep survivors
- Upsert via `buildSteamMediaAttachments` / `upsertSteamMediaNote` / existing patch helpers
- Return: encoded assets + note ops + per-file skip stats (or apply into in-memory library)

## CLI / just

### `import-steam.mjs`

- Default: after games/covers (and achievements) merge path ready, for each **touched** game with `steamAppId`, run shared media import
- `--no-media` — skip
- `--dry-run` — no media downloads (counts-only path unchanged for games; no media writes)
- Patch/`--apply`: after game/cover/achievement ops are built, run media for touched games against the **post-merge in-memory library**, merge media ops+blobs into the **same** patch, then write once (`--out` or `--apply`). Do not write library twice.

### `import-steam-media.mjs`

- Keep `--appid` / `--game-id` one-game mode
- Add `--all` — every `library.games[*]` with positive `steamAppId`
- `--all` mutually exclusive with `--appid` / `--game-id`
- `--apply`: sequential per-game apply into library so mid-run crash keeps earlier games’ media
- `--out` (bulk): one combined patch preferred

### Justfile

| Recipe | Command |
|---|---|
| `steam-import` | `import:steam -- --apply` (media on) |
| `steam-import-via-patch` | patch only (media on unless `--no-media`) |
| `steam-import-media` | one-game `--apply` (unchanged) |
| `steam-import-media-via-patch` | one-game patch (unchanged) |
| `steam-import-media-all` | `import:steam-media -- --all --apply` |
| `steam-import-media-all-via-patch` | `import:steam-media -- --all` |

## Error handling

| Case | Behavior |
|---|---|
| Screenshot/thumb encode fail | Skip file; continue; include survivors in note |
| `GetUserFiles` fail for one appid | Skip game; continue; record in summary `failedGames` |
| No screenshots/videos | Upsert empty (or link-only) media note |
| Missing API key / profile / library | Fatal exit |
| `--all` + `--appid` | Fatal flag error |

Summary JSON includes `skipped` (per-file) and `failedGames`.

## Out of scope

- SPA browser pull of profile media
- Private / unpublished client-local screenshots
- Storefront trailers / marketing shots
- Hosting video binaries / HLS
- Caching media blobs in `steam-import-progress.json`
- Media for library games **not** touched when running `steam-import` (use `--all` for that)

## Tests

- Shared helper: encode fail → survivors attached; empty UGC → note upsert
- `--all` walks only games with `steamAppId`; rejects `--all` + `--appid`
- `import-steam`: touched games get media-note ops; `--no-media` / `--dry-run` skip; untouched games unchanged
- Existing single-game tests: migrate all-or-nothing encode assumption → best-effort where needed

## Verification

```bash
just steam-import -- --limit 2
just steam-import-media-all
just steam-import-media -- --appid 570
npx vitest run tests/steam-media.test.ts tests/steam-api.test.ts tests/steam-import.test.ts
npm test
npm run data:validate
npm run build
```

## Docs

- README: `--no-media`, `steam-import-media-all`, note that `steam-import` attaches media notes by default
- Profile-screenshots design: full-library crawl moved in via this delta
