# Steam Reimport + Field Locks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Incremental Steam reimport via sidecar snapshot + `steamOverrides` marks, soft status policy, `--force`, without touching tier/review.

**Architecture:** Pure merge/diff in `src/domain/steamReimport.ts`; schema field `steamOverrides` on `Game`; CLI `import-steam.mjs` loads snapshot, classifies create vs update (stop treating existing `steamAppId` as hard-skip), writes snapshot only on successful `--apply`. `LibraryContext.saveGame` auto-stamps overrides.

**Tech Stack:** TypeScript domain + Vitest, Node CLI (`scripts/import-steam.mjs`), existing V2 OperationPatch / `applyPatch`.

**Spec:** `docs/superpowers/specs/2026-07-22-steam-reimport-locks-design.md`

## Global Constraints

- Schema v2 exact key sets — `validation.ts` **and** `scripts/validate-data.mjs`
- `steamOverrides` default `{}`; migrate every game in `library.json` + fixtures
- Reimport may write: `hoursPlayed`, `lastPlayedAt`, `status`, `tags`, `title`, `coverAssetId` (under locks)
- Never write on reimport: `placement`, `reviewMarkdown` (even `--force`)
- Soft statuses: `wishlist` | `playing` | `played`; terminal: `completed` | `platinum` | `dropped`
- Platinum → skip achievement-progress writes unless `--force` (stub helper until achievements exist)
- Snapshot path: `public/data/steam-import-snapshot.json`; write **only** on successful `--apply`
- Do not commit a stub snapshot file
- RU copy for GamePage hint: «поля защищены от Steam»
- VCS: `git`; do not commit `.cursor/` skills

## File map

| Path | Responsibility |
|---|---|
| `src/domain/types.ts` | `SteamOverrideKey`, `Game.steamOverrides` |
| `src/domain/validation.ts` | exact keys + overrides shape |
| `scripts/validate-data.mjs` | published mirror |
| `scripts/publish-patch.mjs` | allowlist `steamOverrides` |
| `src/domain/steamImport.ts` | create map includes `steamOverrides: {}`; filter no longer hard-drops known appids (or classify helper moves here) |
| `src/domain/steamReimport.ts` | snapshot types, equality, merge, classify, patch updates, platinum stub |
| `scripts/import-steam.mjs` | `--force`, snapshot I/O, create+update pipeline |
| `src/state/LibraryContext.tsx` | auto-mark on Steam field edits |
| `src/pages/GamePage.tsx` | hint line + new-game `steamOverrides: {}` |
| `src/App/diffModel.ts` | label for `steamOverrides` |
| `public/data/library.json` | add `steamOverrides: {}` |
| `tests/steam-reimport.test.ts` | merge/snapshot matrix |
| `tests/steam-import.test.ts` | create path + classify |
| `tests/*` factories | `steamOverrides: {}` |
| `README.md` | `--force`, snapshot, reimport |

---

### Task 1: Schema `steamOverrides` + migrate data/factories

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/validation.ts`
- Modify: `scripts/validate-data.mjs`
- Modify: `scripts/publish-patch.mjs`
- Modify: `public/data/library.json`
- Modify: every test/benchmark game object (same places that gained `lastPlayedAt`)
- Modify: `src/domain/steamImport.ts` — `mapSteamCandidateToGame` sets `steamOverrides: {}`
- Modify: `src/pages/GamePage.tsx` — new game save includes `steamOverrides: {}`
- Modify: `src/state/LibraryContext.tsx` — preserve `steamOverrides` on save (marking logic in Task 5)
- Modify: `src/App/diffModel.ts` — `steamOverrides: "Защита от Steam"`

**Interfaces:**
- Produces:
```ts
export const STEAM_OVERRIDE_KEYS = ["title", "tags", "status", "coverAssetId"] as const;
export type SteamOverrideKey = (typeof STEAM_OVERRIDE_KEYS)[number];
// on Game:
steamOverrides: Partial<Record<SteamOverrideKey, true>>;
```

- [ ] **Step 1: Write failing validation test**

In `tests/domain-core.test.ts` (or nearest schema test), assert a game **without** `steamOverrides` fails validation, and with `steamOverrides: { title: true }` passes; unknown key `hoursPlayed: true` fails.

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx vitest run tests/domain-core.test.ts
```

Expected: FAIL on missing field / not yet validated.

- [ ] **Step 3: Implement types + validation**

`types.ts` — add `STEAM_OVERRIDE_KEYS`, type, field after `lastPlayedAt` (or after `importedVia`; keep consistent key order everywhere: after `lastPlayedAt`).

`validation.ts` — append `"steamOverrides"` to `ENTITY_FIELDS.games` and `LOCALLY_PATCHABLE_FIELDS.games`. Validate:

```ts
function validateSteamOverrides(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isObject(value)) { issue(issues, path, "Ожидался объект"); return; }
  for (const key of Object.keys(value)) {
    if (!(STEAM_OVERRIDE_KEYS as readonly string[]).includes(key)) {
      issue(issues, `${path}/${key}`, "Неизвестный ключ защиты Steam");
      continue;
    }
    if (value[key] !== true) issue(issues, `${path}/${key}`, "Ожидалось true");
  }
}
```

Mirror in `scripts/validate-data.mjs`. Add to `scripts/publish-patch.mjs` games Set.

- [ ] **Step 4: Migrate library + factories**

Bulk-add `"steamOverrides": {}` to every game in `public/data/library.json` (node one-liner OK). Update all test factories / inline games. `mapSteamCandidateToGame` returns `steamOverrides: {}`. GamePage new-game path + LibraryContext preserve previous overrides (default `{}`).

- [ ] **Step 5: Verify**

```bash
npx vitest run tests/domain-core.test.ts tests/steam-import.test.ts
npm run data:validate
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/types.ts src/domain/validation.ts src/domain/steamImport.ts \
  scripts/validate-data.mjs scripts/publish-patch.mjs public/data/library.json \
  src/state/LibraryContext.tsx src/pages/GamePage.tsx src/App/diffModel.ts tests/ benchmarks/
git commit -m "$(cat <<'EOF'
feat(schema): add Game.steamOverrides for Steam field locks

EOF
)"
```

---

### Task 2: Domain snapshot equality + merge + platinum stub

**Files:**
- Create: `src/domain/steamReimport.ts`
- Create: `tests/steam-reimport.test.ts`

**Interfaces:**
- Consumes: `Game`, `SteamOverrideKey`, helpers from `steamImport.ts` (`hoursFromSteamMinutes`, `lastPlayedAtFromSteam`, `statusFromPlaytime`, `uniqueTagList`)
- Produces:
```ts
export const STEAM_SOFT_STATUSES = ["wishlist", "playing", "played"] as const;

export interface SteamSnapshotGame {
  name: string;
  playtimeForever: number;
  playtime2Weeks: number;
  rtimeLastPlayed: number;
  genres: string[];
  headerImage: string | null;
}

export interface SteamImportSnapshot {
  version: 1;
  profileKey: string;
  fetchedAt: string;
  games: Record<string, SteamSnapshotGame>;
}

export interface SteamProposedFields {
  title: string;
  tags: string[];
  status: StatusId;
  hoursPlayed: number;
  lastPlayedAt: string | null;
  coverAssetId: string | null; // proposed id; null means "no new cover this run"
  // achievements stub later
}

export type SteamMergeSkipReason = "unchanged" | "locked";

export interface SteamMergeResult {
  game: Game | null; // null = skip
  skipReason?: SteamMergeSkipReason;
  changedKeys: string[];
}

export function snapshotGamesEqual(a: SteamSnapshotGame, b: SteamSnapshotGame): boolean;
export function canWriteAchievementProgress(status: StatusId, force: boolean): boolean;
export function mergeSteamGameUpdate(input: {
  existing: Game;
  proposed: SteamProposedFields;
  force: boolean;
  now: string;
}): SteamMergeResult;
export function buildSnapshotGameFromCandidate(candidate: {
  name: string;
  playtime_forever: number;
  playtime_2weeks: number;
  rtime_last_played: number;
  details: { genres?: string[]; headerImage?: string | null } | null;
}): SteamSnapshotGame;
```

- [ ] **Step 1: Write failing tests** in `tests/steam-reimport.test.ts`

Cover at least:

1. `snapshotGamesEqual` — same data true; genre order-insensitive; header/playtime mismatch false
2. `canWriteAchievementProgress("platinum", false) === false`; `true` with force; other statuses true
3. Merge: hours always update when proposed differs
4. Merge: marked `title` kept without force; updated with force
5. Merge: terminal `platinum` status not overwritten without force; with force yes
6. Merge: soft `played` → `playing` when proposed playing
7. Merge: `placement` + `reviewMarkdown` unchanged even with force
8. Merge: Steam wanted only locked fields → `skipReason: "locked"`, `game: null`
9. Merge: no diffs → `skipReason: "unchanged"`

Use a small `baseGame()` helper with `importedVia: "steam"`, `steamOverrides: {}`.

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run tests/steam-reimport.test.ts
```

Expected: FAIL module missing.

- [ ] **Step 3: Implement `steamReimport.ts`**

```ts
export function canWriteAchievementProgress(status: StatusId, force: boolean): boolean {
  return force || status !== "platinum";
}

export function snapshotGamesEqual(a: SteamSnapshotGame, b: SteamSnapshotGame): boolean {
  if (a.name !== b.name) return false;
  if (a.playtimeForever !== b.playtimeForever) return false;
  if (a.playtime2Weeks !== b.playtime2Weeks) return false;
  if (a.rtimeLastPlayed !== b.rtimeLastPlayed) return false;
  if (a.headerImage !== b.headerImage) return false;
  const norm = (tags: string[]) => [...tags].map((t) => t.trim().toLocaleLowerCase("ru")).filter(Boolean).sort();
  return JSON.stringify(norm(a.genres)) === JSON.stringify(norm(b.genres));
}

export function mergeSteamGameUpdate(input: {
  existing: Game;
  proposed: SteamProposedFields;
  force: boolean;
  now: string;
}): SteamMergeResult {
  const { existing, proposed, force, now } = input;
  const next: Game = { ...existing, placement: { ...existing.placement }, tags: [...existing.tags], platforms: [...existing.platforms], steamOverrides: { ...existing.steamOverrides } };
  const changedKeys: string[] = [];
  const wantedKeys: string[] = [];

  const apply = (key: string, canWrite: boolean, equal: boolean, write: () => void) => {
    if (equal) return;
    wantedKeys.push(key);
    if (!canWrite) return;
    write();
    changedKeys.push(key);
  };

  apply("hoursPlayed", true, next.hoursPlayed === proposed.hoursPlayed, () => { next.hoursPlayed = proposed.hoursPlayed; });
  apply("lastPlayedAt", true, next.lastPlayedAt === proposed.lastPlayedAt, () => { next.lastPlayedAt = proposed.lastPlayedAt; });

  apply(
    "title",
    force || !next.steamOverrides.title,
    next.title === proposed.title,
    () => { next.title = proposed.title; },
  );
  apply(
    "tags",
    force || !next.steamOverrides.tags,
    JSON.stringify(next.tags) === JSON.stringify(proposed.tags),
    () => { next.tags = [...proposed.tags]; },
  );
  apply(
    "coverAssetId",
    force || !next.steamOverrides.coverAssetId,
    proposed.coverAssetId == null || next.coverAssetId === proposed.coverAssetId,
    () => {
      if (proposed.coverAssetId != null) next.coverAssetId = proposed.coverAssetId;
    },
  );

  const soft = (STEAM_SOFT_STATUSES as readonly string[]).includes(next.status);
  apply(
    "status",
    force || (!next.steamOverrides.status && soft),
    next.status === proposed.status,
    () => { next.status = proposed.status; },
  );

  // Achievement progress stub: call site checks canWriteAchievementProgress(existing.status, force)
  // No field yet — keep helper exported for Task 2 tests only.

  if (changedKeys.length === 0) {
    return {
      game: null,
      skipReason: wantedKeys.length > 0 ? "locked" : "unchanged",
      changedKeys,
    };
  }
  next.updatedAt = now;
  return { game: next, changedKeys };
}
```

Implement `buildSnapshotGameFromCandidate` accordingly. For tags equality in merge, compare via `uniqueTagList` on both sides or sorted lowercased — match create-path genre → tags behavior.

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run tests/steam-reimport.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/domain/steamReimport.ts tests/steam-reimport.test.ts
git commit -m "$(cat <<'EOF'
feat(domain): Steam reimport merge and snapshot equality

EOF
)"
```

---

### Task 3: Classify create vs update (stop hard-skipping known appids)

**Files:**
- Modify: `src/domain/steamImport.ts` — change `filterSteamImportCandidates` **or** add `classifySteamOwnedGames` used by CLI
- Modify: `tests/steam-import.test.ts`

**Interfaces:**
- Produces:
```ts
export interface SteamImportClassification {
  creates: SteamImportCandidate[];
  updates: Array<{ candidate: SteamImportCandidate; existing: Game }>;
  fetched: number;
  skippedFilter: number;
  /** kept for logs; preferably 0 when reimport enabled */
  skippedDuplicate: number;
}

export function classifySteamOwnedGames(
  owned: readonly SteamOwnedGame[],
  options: SteamImportFilterOptions,
): SteamImportClassification;
```

**Behavior:** Same name/type/appid/played filters as today. If `steamAppId` (or title) matches existing game → **updates** bucket (prefer `steamAppId` match). Else → **creates**. `--limit` applies to `creates.length + updates.length` after filters (slice combined list in appid encounter order).

Keep `filterSteamImportCandidates` as thin wrapper returning only creates (update tests that expected skip-dup) **or** update those tests to use `classifySteamOwnedGames`. Prefer **replace call sites** with classify; deprecate/remove dup-skip from create-only filter if unused.

- [ ] **Step 1: Failing test** — owned appid already in library appears in `updates`, not dropped; create still works for new appid; limit 1 yields one total entry.

- [ ] **Step 2: Implement classify; fix old dup-skip expectations**

- [ ] **Step 3:** `npx vitest run tests/steam-import.test.ts` — PASS

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(steam): classify owned games into create vs update

EOF
)"
```

---

### Task 4: Patch builder for updates + CLI `--force` + snapshot I/O

**Files:**
- Modify: `src/domain/steamImport.ts` — extend `buildSteamImportPatch` **or** add `buildSteamReimportPatch` in `steamReimport.ts`
- Modify: `scripts/import-steam.mjs`
- Modify: `tests/steam-import.test.ts` / `tests/steam-reimport.test.ts` for patch shapes
- Modify: `README.md` (Steam import section)

**Interfaces:**
```ts
export function buildSteamUpsertPatch(
  baseRevision: string,
  items: readonly {
    kind: "create" | "update";
    game: Game;
    previousGame?: Game; // required for update — hash base
    cover?: SteamImportAssetBlob | null;
  }[],
  options?: { now?: string; transactionId?: string },
): OperationPatchLike;
```

Update ops: `baseExists: true`, `baseHash: canonicalHash(previousGame)` (import `canonicalHash` / same helper publish uses). Create ops unchanged (`baseExists: false`, `MISSING_VALUE_HASH`).

**CLI algorithm:**

1. Parse `--force` in `parseArgs`.
2. Resolve steamid; `GetOwnedGames`; `classifySteamOwnedGames`.
3. Load snapshot from `public/data/steam-import-snapshot.json` if present+valid+`profileKey === steamid`; else `null` (warn on invalid JSON).
4. Enrich details (throttle) for candidates that need it: all creates; updates unless snapshot-equal and `!force` (skip details/covers for snapshot-skips).
5. For each update: if `!force` && snapshot equal → `skippedUnchanged++`. Else propose fields; `mergeSteamGameUpdate`; if null → count skipReason; else push update item (fetch cover only if merge would allow cover change and cover missing/changed — simplest: fetch when `force || !existing.steamOverrides.coverAssetId`, then propose id).
6. Creates: existing map path + covers.
7. Build patch; `--dry-run` prints stats only (no writes).
8. Patch-only (`--out`): write patch, **do not** write snapshot.
9. `--apply`: applyPatch + media; then write snapshot:

```js
{
  version: 1,
  profileKey: steamid,
  fetchedAt: now,
  games: Object.fromEntries(
    // all owned rows that passed name filters this run (creates+updates+unchanged), keyed by String(appid)
  ),
}
```

Full replace of `games` map for that profile.

10. Log JSON including `created`, `updated`, `skippedUnchanged`, `skippedLocked`.

- [ ] **Step 1: Unit test** patch update has `baseExists: true` and stable hash for known previous game.

- [ ] **Step 2: Implement patch builder**

- [ ] **Step 3: Wire CLI** (keep flags backward compatible; update `usage()`)

- [ ] **Step 4: README** — document reimport, snapshot path, `--force`, platinum/locks behavior (short)

- [ ] **Step 5: Verify**

```bash
npx vitest run tests/steam-reimport.test.ts tests/steam-import.test.ts
npm run data:validate
npm run build
```

Expected: PASS. (Live Steam optional; do not require network in CI.)

- [ ] **Step 6: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(steam): incremental reimport with snapshot and --force

EOF
)"
```

---

### Task 5: Auto-mark overrides in LibraryContext + GamePage hint

**Files:**
- Modify: `src/state/LibraryContext.tsx` — `saveGame`
- Modify: `src/pages/GamePage.tsx` — hint under meta
- Create or modify: `tests/steam-overrides-ui.test.tsx` (or extend an existing LibraryContext/game save test if present)

**Interfaces:**
- Consumes: `STEAM_OVERRIDE_KEYS`, `Game.steamOverrides`
- Helper (domain preferred):

```ts
// steamReimport.ts or small steamOverrides.ts
export function nextSteamOverrides(
  previous: Game | undefined,
  nextFields: Pick<Game, "title" | "tags" | "status" | "coverAssetId" | "importedVia">,
): Partial<Record<SteamOverrideKey, true>> {
  const base = { ...(previous?.steamOverrides ?? {}) };
  if ((previous?.importedVia ?? nextFields.importedVia) !== "steam" && nextFields.importedVia !== "steam") {
    return base;
  }
  if (!previous) return base;
  if (previous.title !== nextFields.title) base.title = true;
  if (JSON.stringify(previous.tags) !== JSON.stringify(nextFields.tags)) base.tags = true;
  if (previous.status !== nextFields.status) base.status = true;
  if (previous.coverAssetId !== nextFields.coverAssetId) base.coverAssetId = true;
  return base;
}
```

Call from `saveGame` when building `database.games[id]`.

GamePage: if `Object.keys(game.steamOverrides).length > 0`, show one line in meta/dl: «поля защищены от Steam».

- [ ] **Step 1: Failing unit test** for `nextSteamOverrides` (title change sets mark; manual game no marks; cover change sets mark)

- [ ] **Step 2: Implement helper + wire LibraryContext**

- [ ] **Step 3: GamePage hint + light UI test** (render with overrides → text present)

- [ ] **Step 4:**

```bash
npx vitest run tests/steam-reimport.test.ts tests/steam-overrides-ui.test.tsx
npm run build
```

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(ui): auto-mark Steam field overrides on edit

EOF
)"
```

---

### Task 6: Final verification + README checklist touch

**Files:**
- Modify: `README.md` — check off «Статус и playtime» bullets that this pass completes (leave achievements/media/GHA unchecked)

- [ ] **Step 1: Full verify**

```bash
npm test
npm run data:validate
npm run build
```

Expected: all PASS.

- [ ] **Step 2: Commit docs if README changed**

```bash
git commit -m "$(cat <<'EOF'
docs: note Steam reimport snapshot and field locks

EOF
)"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|---|---|
| `steamOverrides` schema + migrate | 1 |
| Snapshot sidecar shape / equality | 2 |
| Merge allowlist + soft status + never tier/review | 2 |
| Platinum achievement skip stub | 2 (`canWriteAchievementProgress`) |
| Create vs update (no hard dup skip) | 3 |
| `--force`, snapshot write only `--apply` | 4 |
| Auto marks + GamePage hint | 5 |
| README / checklist | 4–6 |
| Achievements UI / media / GHA | out of scope |

No TBD placeholders. Types consistent: `SteamSnapshotGame`, `mergeSteamGameUpdate`, `classifySteamOwnedGames`, `buildSteamUpsertPatch`.
