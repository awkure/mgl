# Steam import `--continue` — design

Date: 2026-07-22

Depends on: Steam reimport + achievements CLI (`scripts/import-steam.mjs`)  
Related: `2026-07-22-steam-reimport-locks-design.md`, `2026-07-22-steam-achievements-design.md`

## Goal

Survive long Steam import runs that die mid-fetch (details / achievements) or at apply. Persist a local **progress report** of API results so `--continue` can skip already-fetched appids. Without `--continue`, start fresh and **overwrite** any existing progress file.

## Decisions

| Topic | Choice |
|---|---|
| What to cache | Storefront details + achievement counts only (Approach A) |
| Flush | Incremental — after each details / achievements write for an appid |
| Path | Repo-root `steam-import-progress.json` |
| Git | Gitignore the file |
| Covers | Not cached; re-fetch when covers enabled |
| Success cleanup | Delete progress file after successful `--apply` |
| Fresh run | No `--continue` → overwrite progress at run start |
| Failed fetches | Record `{ ok: false }`; resume does **not** retry those appids |
| Dry-run | No progress read/write |

## Out of scope

- Partial library apply / resume after mid-write to `library.json`
- Caching cover WebP / base64
- Resume for `import-steam-media`
- Published snapshot changes (`steam-import-snapshot.json` stays apply-only)

## Progress file

Path: `steam-import-progress.json` (repository root).

```ts
type SteamImportProgressV1 = {
  version: 1;
  profileKey: string; // steamid64
  startedAt: string;  // ISO UTC
  updatedAt: string;  // ISO UTC
  flags: {
    noCovers: boolean;
    noAchievements: boolean;
    skipDetails: boolean;
    force: boolean;
    playedOnly: boolean;
  };
  /** appid string → details outcome */
  details: Record<
    string,
    | { ok: true; value: SteamAppDetailsLike | null; name?: string }
    | { ok: false; error?: string }
  >;
  /** appid string → achievement outcome */
  achievements: Record<
    string,
    | { ok: true; unlocked: number | null; total: number | null }
    | { ok: false; error?: string }
  >;
};
```

`SteamAppDetailsLike` matches what `getAppDetails` returns (enough to restore `candidate.details` + optional display name). Do not store cover blobs.

Atomic write: write temp file then rename (same pattern as other local JSON writers if present; else `writeFileSync` to `*.tmp` + `renameSync`).

## CLI

Extend `scripts/import-steam.mjs` / `just steam-import`:

- `--continue` — load progress; require file exists and validates
- Default (no flag) — create/overwrite progress at start of non-dry-run fetch work

### Load / validate (`--continue`)

1. File missing → exit with clear error (suggest omit `--continue` for a fresh run).
2. `version !== 1` or bad shape → abort.
3. `profileKey` must equal resolved steamid64 for this run → else abort.
4. Cached `flags` must equal this run’s corresponding flags (`noCovers`, `noAchievements`, `skipDetails`, `force`, `playedOnly`) → else abort with message to drop `--continue` or delete the file.
5. Do not require `limit` / `appids` / `--profile` string equality beyond resolved steamid; owned list may grow — only cached appids are skipped.

### Overwrite (no `--continue`)

At start of the first phase that would write progress (details and/or achievements), replace file with a fresh empty maps document for this `profileKey` + flags. Do not append to a previous failed run.

### Skip rules

**Details:** if `details[appid]` exists → apply cached value (or leave null on `ok: false`); do not call storefront. Else fetch, then flush entry.

**Achievements:** if `achievements[appid]` exists → restore into `achievementByAppid` (null counts on failure / unavailable); do not call schema/player APIs. Else fetch, then flush entry.

**Covers:** always fetch when covers enabled (no progress keys).

**Snapshot skip:** unchanged — snapshot-equal updates still skip details/achievements enrichment when `!force`; no need to touch progress for those appids.

### Success / failure

- Successful `--apply` (library + media + published snapshot written) → **delete** progress file.
- `--out` only (patch file, no apply) → **keep** progress (apply may still fail later; user can `--continue`).
- Process crash / thrown error mid-run → progress already on disk from last flush; next `--continue` resumes.

## Implementation sketch

| Piece | Role |
|---|---|
| `scripts/lib/steamImportProgress.mjs` (or inline helpers in `import-steam.mjs`) | load / validate / createEmpty / upsertDetail / upsertAchievement / writeAtomic / remove |
| `scripts/import-steam.mjs` | `--continue` parse; wire skip + flush; delete on apply success |
| `.gitignore` | `steam-import-progress.json` |
| `README.md` | short `--continue` note under Steam import |
| `tests/` | unit tests for progress load/validate/flag mismatch; optional CLI parse test |

Prefer a small dedicated module if helpers exceed ~80 lines; keep Node-strip-safe (no Parameter Properties / extensionless TS domain imports).

## Testing

- Progress validate: good v1; reject bad version / wrong profileKey / flag mismatch / missing file on continue
- Upsert + atomic write round-trip
- Skip: present `details` / `achievements` keys prevent fetch (mock)
- Overwrite path clears previous maps
- Apply success deletes file (temp dir fixture)

No live Steam required in CI.

## Verification

```bash
npx vitest run tests/steam-import*.test.* # + any new progress tests
npm run import:steam -- --help   # shows --continue
```

Manual: start import, interrupt mid-achievements, `just steam-import --no-covers -- --continue` skips cached appids; successful apply removes `steam-import-progress.json`.
