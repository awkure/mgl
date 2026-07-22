# Catalog Sort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Catalog filter sheet gets sort key + Asc/Desc; Last played uses new `lastPlayedAt` from Steam `rtime_last_played`.

**Architecture:** Schema field `lastPlayedAt` on Game; pure `sortCatalogGames` in domain; catalog-only UI in `ScreenFilterBar` sheet with `localStorage` persistence; `CatalogPage` applies sort after filters. Steam import maps unix `rtime_last_played` → ISO.

**Tech Stack:** React 19, Vitest, existing `FilterMenu` portal pattern, HashRouter (sort **not** in hash).

**Spec:** `docs/superpowers/specs/2026-07-22-catalog-sort-design.md`

## Global Constraints

- Schema v2 exact key sets — update `validation.ts` **and** `scripts/validate-data.mjs`
- RU UI copy; dense filter-sheet chrome
- Null sort values always sink (both dirs)
- Default sort `{ key: "updated", dir: "desc" }`
- Storage key `my-game-library.catalog-sort.v1`
- Do not put sort in URL / `CatalogSearchFilters`
- Preserve `lastPlayedAt` on GamePage save (not editor-writable)

---

### Task 1: `lastPlayedAt` schema + fixtures

**Files:**
- Modify: `src/domain/types.ts` — add `lastPlayedAt: string | null` after `hoursPlayed`
- Modify: `src/domain/validation.ts` — `ENTITY_FIELDS.games`, `LOCALLY_PATCHABLE_FIELDS.games`, validate null|ISO
- Modify: `scripts/validate-data.mjs` — same field rules
- Modify: `scripts/publish-patch.mjs` — allowlist set for games
- Modify: `public/data/library.json` — every game `lastPlayedAt: null`
- Modify: all test/benchmark game factories — `lastPlayedAt: null`
- Modify: `src/state/LibraryContext.tsx` — preserve `lastPlayedAt` on upsert
- Modify: `src/pages/GamePage.tsx` — new-game `lastPlayedAt: null`; read-only meta row
- Modify: `src/App/diffModel.ts` — label «Последняя игра»

**Interfaces:**
- Produces: `Game.lastPlayedAt: string | null`

- [ ] **Step 1:** Add field to `types.ts`, validation, validate-data, publish-patch allowlist
- [ ] **Step 2:** Bulk-add `lastPlayedAt: null` to `library.json` + test factories (keep key order near `hoursPlayed`)
- [ ] **Step 3:** LibraryContext preserve; GamePage display + new game null; diff label
- [ ] **Step 4:** Run `npx vitest run tests/domain-core.test.ts` and `npm run data:validate` — pass
- [ ] **Step 5:** Commit `feat(schema): add Game.lastPlayedAt`

---

### Task 2: Domain sort + storage helpers

**Files:**
- Create: `src/domain/catalogSort.ts`
- Create: `tests/catalog-sort.test.ts`

**Interfaces:**
- Produces:
  - `CATALOG_SORT_KEYS`, `CatalogSortKey`, `CatalogSortDir`, `CatalogSort`
  - `DEFAULT_CATALOG_SORT = { key: "updated", dir: "desc" }`
  - `CATALOG_SORT_STORAGE_KEY = "my-game-library.catalog-sort.v1"`
  - `CATALOG_SORT_EVENT = "mylib-catalog-sort"`
  - `parseCatalogSort(raw: string | null): CatalogSort`
  - `serializeCatalogSort(sort: CatalogSort): string`
  - `loadCatalogSort(storage): CatalogSort` / `saveCatalogSort(storage, sort): void`
  - `sortCatalogGames(games: readonly Game[], sort: CatalogSort): Game[]`

Compare rules per spec: nulls sink; secondary title `ru` localeCompare with numeric.

```ts
export const CATALOG_SORT_KEYS = ["title", "lastPlayed", "hoursPlayed", "updated"] as const;
export type CatalogSortKey = (typeof CATALOG_SORT_KEYS)[number];
export type CatalogSortDir = "asc" | "desc";
export interface CatalogSort { key: CatalogSortKey; dir: CatalogSortDir }
```

Value extractors:
- title → always present string
- lastPlayed → `game.lastPlayedAt`
- hoursPlayed → `game.hoursPlayed`
- updated → `game.updatedAt`

- [ ] **Step 1:** Write failing tests (title asc, hours desc, lastPlayed nulls sink both dirs, parse corrupt → default)
- [ ] **Step 2:** Implement `catalogSort.ts`
- [ ] **Step 3:** `npx vitest run tests/catalog-sort.test.ts` — pass
- [ ] **Step 4:** Commit `feat(domain): catalog sort helper`

---

### Task 3: Steam import maps `rtime_last_played`

**Files:**
- Modify: `src/domain/steamImport.ts` — `SteamOwnedGame.rtime_last_played?`; `MapSteamGameInput.rtimeLastPlayed?`; map to ISO/null
- Modify: `scripts/import-steam.mjs` — pass `candidate.rtime_last_played`
- Modify: `tests/steam-import.test.ts` — assert mapping

```ts
export function lastPlayedAtFromSteam(rtimeLastPlayed?: number): string | null {
  if (!Number.isFinite(rtimeLastPlayed) || (rtimeLastPlayed as number) <= 0) return null;
  return new Date((rtimeLastPlayed as number) * 1000).toISOString();
}
```

- [ ] **Step 1:** Failing test: `rtime_last_played: 1700000000` → ISO; `0`/missing → null
- [ ] **Step 2:** Implement mapping + CLI pass-through
- [ ] **Step 3:** Tests pass; commit `feat(steam): map rtime_last_played to lastPlayedAt`

---

### Task 4: Sort UI in filter sheet + CatalogPage

**Files:**
- Create: `src/components/SortMenu.tsx` — single-select `filter-menu` + portal (radio)
- Create: `src/components/catalogSortState.ts` — load/save + event helpers used by bar + page
- Modify: `src/components/ScreenFilterBar.tsx` — catalog sheet: SortMenu + dir toggle
- Modify: `src/pages/CatalogPage.tsx` — apply `sortCatalogGames` after filter
- Modify: `src/styles.css` — `.screen-filter-bar__sort` row
- Modify: `tests/screen-filter-bar.test.tsx` — sort controls appear; storage write; hash unchanged
- Create or extend: `tests/catalog-sort-ui.test.tsx` — CatalogPage order changes
- Modify: CSS test if needed for new classes

RU labels:
- title → Название
- lastPlayed → Последняя игра
- hoursPlayed → Часов в игре
- updated → Обновлено

Dir buttons: `↑` / `↓` with aria-labels «По возрастанию» / «По убыванию». Tier mode: no sort UI.

- [ ] **Step 1:** Failing UI tests
- [ ] **Step 2:** Implement SortMenu + wire ScreenFilterBar + CatalogPage + CSS
- [ ] **Step 3:** Tests pass
- [ ] **Step 4:** Commit `feat(ui): catalog sort in filter sheet`

---

### Task 5: Full verification

- [ ] **Step 1:** `npm test`
- [ ] **Step 2:** `npm run data:validate`
- [ ] **Step 3:** `npm run build`
- [ ] **Step 4:** Fix any fallout; final commit if needed

---

## Self-review vs spec

| Spec item | Task |
|---|---|
| Keys title/lastPlayed/hoursPlayed/updated | 2, 4 |
| Asc/Desc toggle | 4 |
| localStorage persistence | 2, 4 |
| Nulls sink | 2 |
| `lastPlayedAt` schema + library.json | 1 |
| Steam `rtime_last_played` | 3 |
| Filter-sheet UX catalog only | 4 |
| GamePage read-only display | 1 |
| Not in URL | 4 tests |
| Diff label | 1 |
