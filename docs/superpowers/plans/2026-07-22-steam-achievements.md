# Steam Achievements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fetch Steam achievement counts during import, store on `Game`, show list-card/GamePage progress, auto-`platinum` at 100% when soft.

**Architecture:** Schema fields + pure `achievementCountsFromSteam` / merge extensions in `steamReimport.ts`; Node `steamApi.mjs` for schema + player unlocks; CLI `--no-achievements` (default on); catalog list + GamePage read-only UI.

**Tech Stack:** TypeScript domain, Vitest, Node CLI (`import-steam.mjs`), existing Steam Web API helpers, React GameCard/GamePage, CSS tokens.

**Spec:** `docs/superpowers/specs/2026-07-22-steam-achievements-design.md`

## Global Constraints

- `placement` / `reviewMarkdown` never written by Steam (even `--force`)
- Schema v2 exact keys — `validation.ts` **and** `scripts/validate-data.mjs`
- `canWriteAchievementProgress(status, force)` — no count writes when `status === "platinum"` and `!force`
- Soft: `wishlist` \| `playing` \| `played`; terminal: `completed` \| `platinum` \| `dropped`
- Auto-`platinum` only when soft + status writable (`force` or `!steamOverrides.status`)
- Default fetch on; `--no-achievements` skips
- UI bar only on catalog `list` + GamePage meta (not tier/compact)
- RU copy; dense chrome (`mgl-ui`)
- Node ESM: runtime relative imports in CLI-loaded TS need `.ts` suffix where required
- Do not commit `.cursor/` skills

## File map

| Path | Responsibility |
|---|---|
| `src/domain/types.ts` | `achievementsUnlocked` / `achievementsTotal` |
| `src/domain/validation.ts` | exact keys + int rules + unlocked≤total |
| `scripts/validate-data.mjs` / `publish-patch.mjs` | mirror + allowlist |
| `src/domain/steamImport.ts` | create defaults `null` |
| `src/domain/steamReimport.ts` | counts helper, propose/merge, snapshot fields |
| `scripts/lib/steamApi.mjs` | `getSchemaForGame`, `getPlayerAchievements` |
| `scripts/import-steam.mjs` | flag, fetch loop, stats, snapshot |
| `public/data/library.json` | migrate nulls |
| `src/state/LibraryContext.tsx` | preserve on save |
| `src/components/GameCard.tsx` + `src/styles.css` | list progress bar |
| `src/pages/GamePage.tsx` / `src/App/diffModel.ts` | meta + labels |
| `tests/*` | domain, merge, UI, API fixtures |
| `README.md` | flag + checklist |

---

### Task 1: Schema fields + migrate factories

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/validation.ts`
- Modify: `scripts/validate-data.mjs`
- Modify: `scripts/publish-patch.mjs`
- Modify: `public/data/library.json`
- Modify: test/benchmark game factories (same sweep as `steamOverrides`)
- Modify: `src/domain/steamImport.ts` — `mapSteamCandidateToGame` → both `null`
- Modify: `src/state/LibraryContext.tsx` — preserve on save
- Modify: `src/pages/GamePage.tsx` — new-game path nulls (meta UI in Task 4)
- Modify: `src/App/diffModel.ts` — labels

**Interfaces:**
- Produces: `Game.achievementsUnlocked: number | null`, `Game.achievementsTotal: number | null`

Place fields after `lastPlayedAt` (before `steamOverrides` or after — **keep one consistent order everywhere**: after `lastPlayedAt`, before `steamOverrides`).

Validation:

```ts
// both null OK
// each non-null: Number.isSafeInteger && >= 0
// if both non-null: unlocked <= total
```

- [ ] **Step 1:** Failing validation tests in `tests/domain-core.test.ts` (missing fields fail; unlocked > total fails; valid pair passes)

- [ ] **Step 2:** Run `npx vitest run tests/domain-core.test.ts` — expect FAIL

- [ ] **Step 3:** Implement types + dual validators + publish allowlist + migrate library/factories + preserve/create nulls + diff labels

- [ ] **Step 4:**

```bash
npx vitest run tests/domain-core.test.ts tests/steam-import.test.ts
npm run data:validate
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/types.ts src/domain/validation.ts src/domain/steamImport.ts \
  scripts/validate-data.mjs scripts/publish-patch.mjs public/data/library.json \
  src/state/LibraryContext.tsx src/pages/GamePage.tsx src/App/diffModel.ts tests/ benchmarks/
git commit -m "$(cat <<'EOF'
feat(schema): add Game achievement count fields

EOF
)"
```

---

### Task 2: Domain counts helper + merge + snapshot

**Files:**
- Modify: `src/domain/steamReimport.ts`
- Modify: `tests/steam-reimport.test.ts`

**Interfaces:**
- Extends:
```ts
export interface SteamSnapshotGame {
  // ...existing...
  achievementsUnlocked: number | null;
  achievementsTotal: number | null;
}

export interface SteamProposedFields {
  // ...existing...
  achievementsUnlocked: number | null;
  achievementsTotal: number | null;
}

export function achievementCountsFromSteam(input: {
  schemaTotal: number | null;
  unlocked: number | null;
  available: boolean;
}): { unlocked: number; total: number } | null;

// buildSnapshotGameFromCandidate(..., achievements?: { unlocked: number | null; total: number | null })
// OR set achievement fields after build in CLI — prefer optional arg on builder:
export function buildSnapshotGameFromCandidate(
  candidate: { ... },
  achievements?: { unlocked: number | null; total: number | null },
): SteamSnapshotGame;
```

**`achievementCountsFromSteam`:**
- `available === false` → `null`
- `schemaTotal` null/≤0 or `unlocked` null → `null`
- else `{ unlocked, total: schemaTotal }` with unlocked clamped `min(unlocked, total)` ≥ 0

**`snapshotGamesEqual`:** compare achievement fields; if either side missing property (old snapshot), treat unequal (`undefined` ≠ null for migration — normalize reader to require both keys present or fail equal).

**`mergeSteamGameUpdate`:**
1. If proposed counts both non-null and `canWriteAchievementProgress(existing.status, force)` and differ → write counts
2. Else if proposed null → leave existing counts
3. After count resolution, if `unlocked === total && total > 0` and status writable soft (`force || (!override && soft)`) → `status = "platinum"`
4. If `!canWriteAchievementProgress` → skip both count writes and this auto-platinum path (unless force already true inside helper)
5. Playtime heuristic status still applied as today for soft cases **before** or carefully ordered: **achievements auto-platinum overrides** when 100% conditions hold (spec: achievements win)

Recommended order in merge:
1. hours / lastPlayed / title / tags / cover (unchanged)
2. Apply playtime `proposed.status` under soft/mark rules (existing)
3. Apply achievement counts under platinum lock
4. If 100% + soft writable → force status to `platinum` (may override step 2)

- [ ] **Step 1:** Failing tests — counts helper; merge writes counts; platinum lock blocks; 100% → platinum on soft; terminal completed not auto-platinum without force; snapshot equality includes achievements; missing snapshot achievement keys → not equal

- [ ] **Step 2:** `npx vitest run tests/steam-reimport.test.ts` — FAIL

- [ ] **Step 3:** Implement helpers + merge + snapshot + update `proposeSteamFieldsFromCandidate` to accept optional counts (default null)

```ts
export function proposeSteamFieldsFromCandidate(
  candidate: ...,
  coverAssetId: string | null,
  achievements?: { unlocked: number | null; total: number | null } | null,
): SteamProposedFields
```

- [ ] **Step 4:** Tests PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(domain): merge Steam achievement counts and auto-platinum

EOF
)"
```

---

### Task 3: Steam API + CLI `--no-achievements`

**Files:**
- Modify: `scripts/lib/steamApi.mjs`
- Modify: `scripts/import-steam.mjs`
- Modify: `tests/steam-api.test.ts` (fixtures / mocked fetch if pattern exists)
- Modify: `README.md` (flag docs; leave checklist checkboxes for Task 5 if preferred)

**API shapes (Steam):**

- `ISteamUserStats/GetSchemaForGame/v2/` → `game.availableGameStats.achievements` length = total
- `ISteamUserStats/GetPlayerAchievements/v1/` → `playerstats.achievements` filter `achieved === 1`; `playerstats.success === false` → unavailable

```js
export async function getSchemaForGame(key, appid) { /* returns { total: number } | null */ }
export async function getPlayerAchievements(key, steamid, appid) {
  /* returns { available: boolean, unlocked: number | null } */
}
```

**CLI:**
- Parse `--no-achievements`
- After classify / before or after covers: for each create + each update not snapshot-skipped, if achievements enabled: throttle → schema + player → `achievementCountsFromSteam` → pass into propose / map create
- On create: after `mapSteamCandidateToGame`, set counts on game if fetched
- Snapshot rows must include achievement fields (pass into `buildSnapshotGameFromCandidate`)
- Progress `\rachievements i/n appid=…`
- Stats: `achievementsUpdated`, `achievementsSkipped`, `achievementsFailed`
- Transient fail: warn, keep prior counts, `achievementsFailed++`
- Snapshot-unchanged games: `achievementsSkipped++`, no API call

- [ ] **Step 1:** Unit tests for API parsers with fixture JSON (success, private, empty)

- [ ] **Step 2:** Implement API helpers

- [ ] **Step 3:** Wire CLI; update usage()

- [ ] **Step 4:**

```bash
npx vitest run tests/steam-api.test.ts tests/steam-reimport.test.ts tests/steam-import.test.ts
npm run build
```

Expected: PASS (no live network required)

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(steam): fetch achievement counts during import

EOF
)"
```

---

### Task 4: Catalog list bar + GamePage meta

**Files:**
- Modify: `src/components/GameCard.tsx`
- Modify: `src/styles.css`
- Modify: `src/pages/GamePage.tsx`
- Create: `tests/steam-achievements-ui.test.tsx` (or extend game-card / catalog tests)
- Optional: CSS assertion test if repo pattern requires

**UI rules:**
- `variant === "list"` and both counts non-null and `total > 0`:
  - Block: progress bar (`width: (unlocked/total)*100%`) + text `${unlocked}/${total}`
  - `aria-label`: `Достижения: ${unlocked} из ${total}`
- Tier / compact: no bar
- GamePage meta after lastPlayed: «Достижения» → `12/40` or `—`

Follow existing `game-card__*` BEM; use CSS variables only.

- [ ] **Step 1:** Failing UI tests — list shows bar; tier does not; GamePage shows counts / em dash

- [ ] **Step 2:** Implement UI + CSS

- [ ] **Step 3:**

```bash
npx vitest run tests/steam-achievements-ui.test.tsx tests/game-card-click.test.tsx
npm run build
```

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(ui): show Steam achievement progress on catalog and game page

EOF
)"
```

---

### Task 5: README checklist + full verify

**Files:**
- Modify: `README.md` — document `--no-achievements`; check off «Достижения» bullets that B completes

- [ ] **Step 1:**

```bash
npm test
npm run data:validate
npm run build
```

Expected: all PASS

- [ ] **Step 2:** README updates + commit

```bash
git commit -m "$(cat <<'EOF'
docs: Steam achievements import and UI

EOF
)"
```

---

## Self-review (plan vs spec)

| Spec item | Task |
|---|---|
| Schema fields + validate | 1 |
| Counts helper + merge + auto-platinum + lock | 2 |
| Snapshot achievement fields | 2–3 |
| API + CLI `--no-achievements` | 3 |
| List bar + GamePage | 4 |
| README / verify | 5 |
| Never tier/review | merge unchanged (2) |
| No per-achievement list / SPA | out |

No TBD placeholders. Interfaces consistent across tasks.
