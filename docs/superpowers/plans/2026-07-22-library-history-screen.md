# Library History Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Committed `public/data/history.json` of published game/note field changes, plus **История** tab (before Настройки) with soft timeline UI, consecutive same-game nesting, and clickable game nodes → `#/games/:id`.

**Architecture:** Append-only sibling JSON next to `library.json`. Publish/apply diffs old→new library into field events (timestamps from patch `changedAt`). SPA fetches history statically; UI clusters consecutive `gameId` runs for display only.

**Tech Stack:** TypeScript domain + Vitest, Node publish CLI (`scripts/publish-patch.mjs`), React HashRouter + existing tab stacks / SwipePager, CSS tokens in `src/styles.css`.

**Spec:** `docs/superpowers/specs/2026-07-22-library-history-screen-design.md`

## Global Constraints

- History lives in `public/data/history.json` — **not** inside `library.json` (revision hash unchanged)
- Published history only; never merge local pending patch into the feed
- Field-level events for **games** + **notes** only (no rank/asset primary events)
- Sort / cluster key = `changedAt` (from patch ops; seed uses `createdAt`)
- Nesting = consecutive same-`gameId` runs in time-sorted feed (UI-only)
- Living game node header (cover + title) **must** navigate to `#/games/:id` on **catalog** stack
- Missing/deleted game: denormalized title/cover, **not** clickable
- RU copy; existing design tokens; no marketing chrome
- Update `validation.ts` **and** `scripts/validate-data.mjs` for history schema
- Do not commit agent skills

## File map

| Path | Role |
|---|---|
| `src/domain/historyTypes.ts` | `HistoryEvent`, `HistoryFile`, schema const |
| `src/domain/historyDiff.ts` | `diffLibraryToHistoryEvents`, `historyEventId`, seed helper |
| `src/domain/historyCluster.ts` | `clusterHistoryByConsecutiveGame` |
| `src/domain/historyValidate.ts` | `validateHistoryFile` (shared rules; scripts may reimplement or import via strip-types) |
| `scripts/lib/history.mjs` | Node mirror of diff/id/validate/append for publish + seed |
| `scripts/seed-history.mjs` | One-shot seed from current library |
| `scripts/publish-patch.mjs` | Append history when writing library |
| `scripts/validate-data.mjs` | Validate `history.json` when present |
| `public/data/history.json` | Committed artifact (seeded) |
| `src/state/tabStacks.ts` | `TabId` + 4-tab order/pager |
| `src/components/AppShell.tsx` | Nav link + tab before settings |
| `src/components/Icon.tsx` | `history` icon |
| `src/components/SwipePager.tsx` | Fourth panel |
| `src/pages/HistoryPage.tsx` | Timeline UI |
| `src/styles.css` | `.history-timeline*` |
| `src/App.tsx` | Route kind, load/pass history, wire navigate |
| `tests/history-*.test.ts(x)` | Domain + UI + nav regressions |

---

### Task 1: History types + validation

**Files:**
- Create: `src/domain/historyTypes.ts`
- Create: `src/domain/historyValidate.ts`
- Create: `tests/history-validate.test.ts`
- Modify: `src/domain/index.ts` — re-export

**Interfaces:**
- Produces:
  - `HISTORY_SCHEMA_VERSION = 1`
  - `HistoryEntity = "game" | "note"`
  - `HistoryOp = "create" | "set" | "delete"`
  - `HistoryEvent` with fields: `id`, `changedAt`, `entity`, `entityId`, `gameId`, `field: string | null`, `op`, `before: unknown`, `after: unknown`, `title: string`, `coverAssetId: string | null`
  - `HistoryFile = { schemaVersion: 1; events: HistoryEvent[] }`
  - `validateHistoryFile(value: unknown): HistoryFile` (throws `DomainValidationError` or returns issues pattern matching `validation.ts`)

- [ ] **Step 1: Write failing validation tests**

```ts
import { describe, expect, it } from "vitest";
import { validateHistoryFile } from "../src/domain/historyValidate";

describe("validateHistoryFile", () => {
  it("accepts empty events", () => {
    expect(validateHistoryFile({ schemaVersion: 1, events: [] }).events).toEqual([]);
  });

  it("rejects wrong schemaVersion", () => {
    expect(() => validateHistoryFile({ schemaVersion: 2, events: [] })).toThrow();
  });

  it("rejects event missing gameId", () => {
    expect(() => validateHistoryFile({
      schemaVersion: 1,
      events: [{
        id: "x",
        changedAt: "2026-01-01T00:00:00.000Z",
        entity: "game",
        entityId: "g1",
        field: "status",
        op: "set",
        before: "backlog",
        after: "playing",
        title: "Hades",
        coverAssetId: null,
      }],
    })).toThrow();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npx vitest run tests/history-validate.test.ts`

- [ ] **Step 3: Implement types + validator**

Require exact keys on `HistoryFile` and each event. `changedAt` ISO. `field` null only for `create`/`delete`. `gameId` always non-empty string.

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/domain/historyTypes.ts src/domain/historyValidate.ts src/domain/index.ts tests/history-validate.test.ts
git commit -m "$(cat <<'EOF'
feat(history): add history.json types and validation

EOF
)"
```

---

### Task 2: Diff library → events + stable ids

**Files:**
- Create: `src/domain/historyDiff.ts`
- Create: `tests/history-diff.test.ts`

**Interfaces:**
- Consumes: `LibraryDatabase`, `PatchEnvelope` (optional), `HistoryEvent`
- Produces:
  - `historyEventId(parts: Omit<HistoryEvent, "id">): string` — SHA-256 hex of canonical JSON of parts
  - `diffLibraryToHistoryEvents(input: { before: LibraryDatabase; after: LibraryDatabase; patch?: PatchEnvelope | null }): HistoryEvent[]`
  - `seedHistoryEventsFromLibrary(library: LibraryDatabase): HistoryEvent[]`

**Tracked game fields (exact):**  
`title`, `coverAssetId`, `steamAppId`, `importedVia`, `hoursPlayed`, `lastPlayedAt`, `achievementsUnlocked`, `achievementsTotal`, `platforms`, `tags`, `status`, `placement`, `reviewMarkdown`  
(Skip `steamOverrides`, `createdAt`, `updatedAt` as primary fields — `updatedAt` only as timestamp fallback.)

**Tracked note fields:** `bodyMarkdown`, `attachments`, `groupRank`, `rank`

**Rules:**
- Create game/note → one `op: "create"` event (`field: null`); `before: null`, `after: null` (or omit bodies)
- Delete → `op: "delete"`
- Field change → `op: "set"` with JSON-comparable before/after; for `reviewMarkdown` / `bodyMarkdown` store `null` in before/after and rely on UI verb (avoid huge JSON)
- `changedAt`: from `patch.operations["/games/"+id]` or `/notes/"+id` `.changedAt` when present; else entity `updatedAt`/`createdAt`
- Snapshot `title` + `coverAssetId` from **after** entity when present, else **before**
- Notes always set `gameId` from note

- [ ] **Step 1: Write failing diff tests**

```ts
import { describe, expect, it } from "vitest";
import { diffLibraryToHistoryEvents, seedHistoryEventsFromLibrary } from "../src/domain/historyDiff";
// use minimal fixture libraries in-test

it("emits status field change with patch changedAt", () => { /* … */ });
it("emits create for new game", () => { /* … */ });
it("emits note body update under parent gameId", () => { /* … */ });
it("seed emits create per game and note", () => { /* … */ });
it("stable id is deterministic", () => { /* … */ });
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run tests/history-diff.test.ts`

- [ ] **Step 3: Implement `historyDiff.ts`**

Use `crypto.subtle` in browser tests via Node `node:crypto` `createHash("sha256")` — Vitest runs in Node; prefer `createHash` from `node:crypto` only if domain stays Node-safe. **Prefer pure hex from a small `sha256Hex(utf8)` that uses Web Crypto in browser and `node:crypto` in tests**, OR put hashing only in scripts and pass `id` from a shared canonical stringify + hash in `historyDiff` using existing `hashCanonical` from `src/domain/canonical.ts` if available.

Check `src/domain/canonical.ts` / `hashCanonical` — reuse if it already hashes canonical JSON.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/domain/historyDiff.ts tests/history-diff.test.ts
git commit -m "$(cat <<'EOF'
feat(history): diff library into append-only history events

EOF
)"
```

---

### Task 3: Consecutive game clustering

**Files:**
- Create: `src/domain/historyCluster.ts`
- Create: `tests/history-cluster.test.ts`

**Interfaces:**
- Produces:
```ts
export interface HistoryCluster {
  gameId: string;
  title: string;
  coverAssetId: string | null;
  changedAt: string; // newest in cluster
  events: HistoryEvent[]; // newest-first
}

export function clusterHistoryByConsecutiveGame(events: HistoryEvent[]): HistoryCluster[];
```

Algorithm: sort by `changedAt` desc (tie-break `id` asc); scan; start new cluster when `gameId` differs from previous.

- [ ] **Step 1: Failing tests** — interleaved games stay separate; adjacent same game nests; empty → `[]`

- [ ] **Step 2: Run FAIL** — `npx vitest run tests/history-cluster.test.ts`

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run PASS**

- [ ] **Step 5: Commit**

```bash
git add src/domain/historyCluster.ts tests/history-cluster.test.ts
git commit -m "$(cat <<'EOF'
feat(history): cluster consecutive same-game history events

EOF
)"
```

---

### Task 4: Node scripts — history.mjs, seed, validate-data, publish hook

**Files:**
- Create: `scripts/lib/history.mjs` — port/validate/diff/append/dedupe (can import TS via `--experimental-strip-types` from domain if repo already does; else duplicate minimal logic mirroring domain tests)
- Create: `scripts/seed-history.mjs`
- Modify: `scripts/validate-data.mjs` — validate `public/data/history.json` when file exists; if missing, warn or require after seed (spec: seed ships file — **require file** after Task 5)
- Modify: `scripts/publish-patch.mjs` — after computing `next` library, load old history (or empty), `diffLibraryToHistoryEvents({ before: database, after: next, patch })`, append+dedupe by `id`, write `public/data/history.json` into same commit paths
- Modify: `justfile` / `package.json` if other scripts need a `history-seed` recipe (optional: `node scripts/seed-history.mjs`)

**Interfaces:**
- Produces: `appendHistoryEvents(existing, incoming) → HistoryFile`
- Publish commit paths include `public/data/history.json`

- [ ] **Step 1: Failing script-level test** in `tests/history-publish.test.ts` (or extend existing publish tests) asserting apply/publish appends events and dedupes

Look for existing `tests/*publish*` patterns; mirror them.

- [ ] **Step 2: Run FAIL**

- [ ] **Step 3: Implement `scripts/lib/history.mjs` + wire `publishPatchInRepository`:**
  1. `relativeHistoryPath = "public/data/history.json"`
  2. Read existing or `{ schemaVersion: 1, events: [] }`
  3. Diff `database` → `next`
  4. Append + dedupe
  5. Write temp+rename like library
  6. Add path to `commitPaths`
  7. Rollback restores history file too

- [ ] **Step 4: Implement `seed-history.mjs`** — reads library, writes history (refuse overwrite unless `--force`)

- [ ] **Step 5: validate-data loads and validates history**

- [ ] **Step 6: Run tests PASS**

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/history.mjs scripts/seed-history.mjs scripts/validate-data.mjs scripts/publish-patch.mjs tests/history-publish.test.ts
git commit -m "$(cat <<'EOF'
feat(history): seed, validate, and append history on publish

EOF
)"
```

---

### Task 5: Seed committed `public/data/history.json`

**Files:**
- Create: `public/data/history.json` via seed script

- [ ] **Step 1: Run seed**

```bash
node scripts/seed-history.mjs
```

Expected: file created; event count ≥ number of games (+ notes)

- [ ] **Step 2: Validate**

```bash
node scripts/validate-data.mjs
```

Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add public/data/history.json
git commit -m "$(cat <<'EOF'
chore(history): seed history.json from current library

EOF
)"
```

---

### Task 6: Four-tab navigation (`history` before `settings`)

**Files:**
- Modify: `src/state/tabStacks.ts` — `TabId`, `TAB_ROOTS`, `TAB_ORDER`, `tabIdFromPath`, `cloneStacks`, `createInitialTabStacksState`, `tabFromPagerIndex` / `pagerIndexFromTab` as `0|1|2|3`
- Modify: `src/components/AppShell.tsx` — `AppRoute` includes `"history"`; desktop nav + mobile tab before settings; `tabProgressFromRoute`
- Modify: `src/components/Icon.tsx` — add `history` (clock-style outline path)
- Modify: `src/components/SwipePager.tsx` — fourth panel for history
- Modify: `src/App.tsx` — `routeKind("/history")`, pager panel, `openGameOnTab("catalog", id)` from history
- Modify/create tests: `tests/tab-stacks*.test.ts` or extend existing tab/pager tests; CSS tab-bar count if asserted

**Interfaces:**
- `TAB_ROOTS.history = { pathname: "/history" }`
- Order: `tiers`, `catalog`, `history`, `settings`
- Pager: history index `2`, settings index `3`

- [ ] **Step 1: Failing tests** — `tabIdFromPath("/history") === "history"`; `pagerIndexFromTab("settings") === 3`; order before settings

- [ ] **Step 2: Run FAIL**

- [ ] **Step 3: Implement tab stack + shell + icon + pager wiring** (HistoryPage can be stub: `<div className="page">История</div>`)

- [ ] **Step 4: Run PASS**

- [ ] **Step 5: Commit**

```bash
git add src/state/tabStacks.ts src/components/AppShell.tsx src/components/Icon.tsx src/components/SwipePager.tsx src/App.tsx tests/
git commit -m "$(cat <<'EOF'
feat(history): add История tab before settings

EOF
)"
```

---

### Task 7: `HistoryPage` soft timeline + clickable nodes

**Files:**
- Create: `src/pages/HistoryPage.tsx`
- Modify: `src/pages/index.ts`
- Modify: `src/styles.css` — `.history-page`, `.history-timeline`, `.history-timeline__rail`, `.history-timeline__node`, `.history-timeline__header`, `.history-timeline__link`, `.history-timeline__deltas`, `.history-timeline__delta`, `.history-timeline__time`, muted deleted state
- Create: `tests/history-page.test.tsx`
- Modify: `src/App.tsx` — fetch `${BASE_URL}data/history.json`, pass events + `resolveAssetUrl` + `games` id set + `onOpenGame(gameId)`

**UI rules (spec):**
- Heading: **История** / **Изменения опубликованной библиотеки.**
- Soft timeline rail + dots
- Cluster via `clusterHistoryByConsecutiveGame`
- Node header = one `<a href="#/games/...">` or button calling `onOpenGame` wrapping cover + title; time outside link
- If `gameId` not in live `games` → no href, class `is-missing`, optional «удалена»
- Field lines: RU labels via small map (`status`→«Статус», `placement`→«Тир», create→«Добавлена», note body→«Заметка · обновлён текст», etc.)
- Values: use `STATUS_LABELS` / `TIER_LABELS` where applicable; `formatRelativeDate(cluster.changedAt)` for time (existing helper)
- Empty events → `empty-state`
- Fetch error → error strip + retry button

- [ ] **Step 1: Failing RTL tests**

```tsx
it("renders nested deltas for consecutive same game", () => { /* … */ });
it("node link points to #/games/g1 when game exists", () => { /* … */ });
it("missing game is not a link", () => { /* … */ });
it("shows empty state", () => { /* … */ });
```

- [ ] **Step 2: Run FAIL** — `npx vitest run tests/history-page.test.tsx`

- [ ] **Step 3: Implement page + CSS** (tokens only; dark + light pairs if new colors — prefer existing `--accent`, `--line`, `--surface`, `--muted`)

- [ ] **Step 4: Wire App fetch** — page-local `useEffect` fetch is OK (YAGNI context); pass into `SwipePager` history panel

- [ ] **Step 5: Run PASS** + smoke `npx vitest run tests/history-page.test.tsx tests/history-cluster.test.ts`

- [ ] **Step 6: Commit**

```bash
git add src/pages/HistoryPage.tsx src/pages/index.ts src/styles.css src/App.tsx tests/history-page.test.tsx
git commit -m "$(cat <<'EOF'
feat(history): soft timeline page with clickable game nodes

EOF
)"
```

---

### Task 8: CSS / chrome regression for 4-tab bar

**Files:**
- Modify: existing `tests/*tab*` / `tests/*css*` / `tests/app-shell*` as present
- Ensure blob progress uses 3 gaps (4 tabs): `translateX(calc(var(--pager-progress) * (100% + 2px)))` still works if progress is 0..3 — **verify** CSS assumes 0..2; if tab width is `100%/4`, progress max 3 must match. Update CSS variables / blob math if needed.

- [ ] **Step 1: Inspect** `.app-tab-bar__blob` width — today sized for 3 tabs. Update to `calc((100% - …) / 4)` or equivalent.

- [ ] **Step 2: Add/extend test asserting history tab precedes settings in DOM order**

- [ ] **Step 3: Run relevant vitest + fix**

- [ ] **Step 4: Commit**

```bash
git add src/styles.css tests/
git commit -m "$(cat <<'EOF'
fix(history): size tab-bar blob for four tabs

EOF
)"
```

---

## Self-review checklist (author)

1. Spec coverage: data file, publish append, seed, field games+notes, consecutive nest, clickable catalog navigation, validate-data, empty/missing — each has a task.
2. No TBD placeholders in steps.
3. Types: `HistoryEvent` / `HistoryCluster` names consistent across tasks.
4. Publish rollback includes history path.
5. `library.json` schema untouched.

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-07-22-library-history-screen.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — this session with executing-plans + checkpoints  

Which approach?
