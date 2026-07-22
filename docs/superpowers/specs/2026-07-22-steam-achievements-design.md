# Steam achievements — design

Date: 2026-07-22

Roadmap: `2026-07-22-steam-followups-roadmap.md` (Spec B)  
Depends on: `2026-07-22-steam-reimport-locks-design.md` (A)

## Goal

During Steam import/reimport, fetch achievement progress for owned games, store counts on `Game`, show catalog/GamePage progress UI, and auto-set `status: platinum` at 100% unlock when status is still soft and unlocked. Honor A’s platinum progress lock and never touch tier/review.

## Decisions

| Topic | Choice |
|---|---|
| Storage | On `Game`: `achievementsUnlocked` / `achievementsTotal` (`number \| null`) |
| Fetch timing | During `import:steam` (creates + non-snapshot-skipped updates) |
| Escape hatch | `--no-achievements` (default: fetch on) |
| 100% unlock | Auto `status: "platinum"` if soft + status writable |
| UI | Catalog `list` cards + GamePage meta; not tier/compact |
| Per-achievement list | Out of scope |
| Approach | Domain helpers + `steamApi.mjs` + CLI wiring + GameCard/GamePage |

## Global constraints (from A / roadmap)

- `placement` / `reviewMarkdown` never written by Steam (even `--force`)
- Schema v2 exact keys; dual validation (`validation.ts` + `validate-data.mjs`)
- `canWriteAchievementProgress(status, force)` — skip count writes when `status === "platinum"` and `!force`
- Soft statuses: `wishlist` \| `playing` \| `played`; terminal: `completed` \| `platinum` \| `dropped`

## Data model

```ts
// on Game (after lastPlayedAt / near other Steam-ish fields; keep key order consistent everywhere)
achievementsUnlocked: number | null;
achievementsTotal: number | null;
```

Rules:

- Default / migrate: both `null`
- Both null = unknown / never fetched / no Steam stats
- Each non-null value: finite non-negative safe integer
- If both non-null: `unlocked <= total`
- Not editable in GamePage editor; Steam import is the write path
- `LOCALLY_PATCHABLE_FIELDS` includes both so CLI patches apply
- Diff labels: «Достижения (открыто)» / «Достижения (всего)» (or one combined label if diff UI prefers)

Create path (`mapSteamCandidateToGame`): start `null` until achievement fetch fills them in the same import run.

### Snapshot sidecar

Extend `SteamSnapshotGame` with:

```ts
achievementsUnlocked: number | null;
achievementsTotal: number | null;
```

Include in `snapshotGamesEqual`. When owned slice + achievements counts match snapshot and `!force`, skip game (no details / no achievement re-fetch). Missing keys on old snapshots → treat as unequal for achievement fields (force one enrich pass), then rewrite snapshot on `--apply`.

## Merge / status

Extend propose + `mergeSteamGameUpdate` (or adjacent helpers):

1. Proposed counts from Steam APIs (or null if unavailable).
2. Apply count writes only if `canWriteAchievementProgress(existing.status, force)` and proposed non-null and differs.
3. If after counts `unlocked === total && total > 0`:
   - And (`force` OR (`!steamOverrides.status` AND current status ∈ soft set)):
   - Set `status` to `"platinum"` (even if playtime heuristic would say otherwise for this field write — achievements win for this auto path when conditions hold).
4. If platinum lock blocks counts, do not change status via this path either (unless `--force`).
5. Never write `placement` / `reviewMarkdown`.

Manual games / no `steamAppId`: leave null; no fetch.

## API

In `scripts/lib/steamApi.mjs` (key Node-only):

- `getSchemaForGame(key, appid)` → schema achievements list / count
- `getPlayerAchievements(key, steamid, appid)` → player unlocks / success

Domain (pure):

```ts
achievementCountsFromSteam(input: {
  schemaTotal: number | null;
  unlocked: number | null;
  available: boolean; // false if private / no stats
}): { unlocked: number; total: number } | null;
```

Private profile stats, empty schema, or HTTP errors: return `null`; CLI warns and keeps previous Game values (do not clear to null on transient failure). Abort whole import only on hard auth/key failures that already abort today.

Throttle + `withRetry` consistent with existing Steam helpers (achievement endpoints may use a modest interval; reuse or share throttle with details where practical).

## CLI

Extend `scripts/import-steam.mjs`:

- Flag `--no-achievements`
- When achievements enabled and game not snapshot-skipped: fetch schema + player progress; feed merge/create
- Progress: `achievements i/n appid=…`
- Stats JSON extras: `achievementsUpdated`, `achievementsSkipped`, `achievementsFailed`
- Snapshot write on `--apply` includes achievement fields

## UI

**Catalog** (`GameCard` variant `list` only):

- If both counts non-null and `total > 0`: progress bar + text `unlocked/total`
- Else: no badge

**GamePage:**

- Read-only meta row «Достижения»: `12/40` or «—» when unknown
- No inline edit

**Styles:** reuse dense library tokens; BEM under existing card/meta patterns (`mygameslist-ui`).

## Testing

- Unit: `achievementCountsFromSteam`; merge matrix (counts + auto-platinum + platinum lock + force + soft vs terminal)
- Snapshot equality with achievement fields
- Validation: nulls, unlocked > total rejects
- UI: list card shows bar; tier variant does not; GamePage row
- `data:validate` after library migrate

## Out of scope

- Per-achievement names/icons/rare%
- Auto-`completed` (only auto-`platinum`)
- SPA / browser Steam API
- Friend achievements
- Tier / compact card bars
- Dedicated achievements-only CLI (can add later; not required for B)
- Specs C / D / E

## Files (expected)

| Path | Change |
|---|---|
| `src/domain/types.ts` | two fields |
| `src/domain/validation.ts` / `scripts/validate-data.mjs` / `publish-patch.mjs` | keys + rules |
| `src/domain/steamImport.ts` | create defaults null |
| `src/domain/steamReimport.ts` | propose/merge/snapshot/counts helper |
| `scripts/lib/steamApi.mjs` | schema + player achievements |
| `scripts/import-steam.mjs` | `--no-achievements`, fetch loop, stats |
| `public/data/library.json` | migrate nulls |
| `src/components/GameCard.tsx` + CSS | list progress |
| `src/pages/GamePage.tsx` / `diffModel` | meta + labels |
| `src/state/LibraryContext.tsx` | preserve fields on save |
| `tests/*` | domain + UI + import |
| `README.md` | check «Достижения» bullets; document flag |

## Verification

```bash
npm test
npm run data:validate
npm run build
```

Manual: import with achievements → counts fill; 100% soft game → `platinum`; already `platinum` without `--force` → counts stable; `--no-achievements` skips API; catalog list shows bar; tier card does not.
