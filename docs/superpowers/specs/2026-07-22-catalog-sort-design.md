# Catalog sort — design

Date: 2026-07-22

## Goal

Add sorting to the catalog screen. Control lives in the same expandable filter sheet as status/tier/platform/tag menus. One sort key is **Last played**, backed by Steam import (`rtime_last_played`).

## Decisions

- **Keys (A):** `title` | `lastPlayed` | `hoursPlayed` | `updated`
- **Direction (B):** fixed keys + Asc/Desc toggle beside the sort dropdown
- **Persistence (B):** `localStorage` only — not in hash URL (filters stay in URL)
- **Nulls (A):** games missing the sort value always sink to the end, regardless of Asc/Desc
- **Approach:** domain sort helper + schema field `lastPlayedAt` + filter-sheet UI (catalog mode only)

Defaults: `{ key: "updated", dir: "desc" }` — matches today’s catalog order (`updatedAt` descending).

## Data model

New Game field:

- `lastPlayedAt: string | null` — ISO-8601 UTC datetime
- Manual games / never-played / not-yet-reimported Steam games: `null`
- Not editable in GamePage editor; Steam import is the write path
- Show read-only on GamePage meta when non-null («Последняя игра»)
- Diff label: `lastPlayedAt` → «Последняя игра»

Exact key sets must update:

- `src/domain/types.ts`
- `src/domain/validation.ts` (`ENTITY_FIELDS`, datetime rule)
- `scripts/validate-data.mjs`
- fixtures / test game factories
- published `public/data/library.json` — every game gets `lastPlayedAt: null` until re-import

`LOCALLY_PATCHABLE_FIELDS`: include `lastPlayedAt` so CLI Steam import patches can set it (same as `hoursPlayed` / `steamAppId`). No inline editor control.

### Steam import

- `GetOwnedGames` already returns `rtime_last_played` (unix seconds) when present
- Map in `mapSteamCandidateToGame`: `> 0` → `new Date(sec * 1000).toISOString()`, else `null`
- Thread field through CLI import path and unit tests

## Domain sort

```ts
type CatalogSortKey = "title" | "lastPlayed" | "hoursPlayed" | "updated";
type CatalogSortDir = "asc" | "desc";
interface CatalogSort { key: CatalogSortKey; dir: CatalogSortDir }
```

`sortCatalogGames(games, sort)` in `src/domain/` (new file or next to `catalogue.ts`):

| Key | Primary compare |
|---|---|
| `title` | `localeCompare(..., "ru")` |
| `lastPlayed` | ISO string compare on `lastPlayedAt` |
| `hoursPlayed` | numeric on `hoursPlayed` |
| `updated` | ISO string compare on `updatedAt` |

Rules:

1. Null / missing primary value → after all non-null (both dirs)
2. Secondary tie-break: title `ru` localeCompare
3. Corrupt / unknown stored sort → fall back to default

## UI

Catalog `ScreenFilterBar` sheet only (not tier mode):

1. Single-select dropdown (reuse `details.filter-menu` + portal pattern; radio behavior, not multi-checkbox). Label **Сортировка**. Options:
   - Название → `title`
   - Последняя игра → `lastPlayed`
   - Часов в игре → `hoursPlayed`
   - Обновлено → `updated`
2. Asc/Desc toggle beside it (`↑` / `↓`, aria-labels «По возрастанию» / «По убыванию»)

Storage key: `my-game-library.catalog-sort.v1` → JSON `{ key, dir }`.

Shared state: small hook / event mirror of filter sync so `ScreenFilterBar` and `CatalogPage` stay aligned (e.g. `CATALOG_SORT_EVENT` + read storage). **Do not** put sort in `CatalogSearchFilters` / hash serialize.

`CatalogPage`: filter then `sortCatalogGames(...)`. Sort is not an active-filter chip; «Сбросить» filters leaves sort alone.

## Out of scope

- Sort on tier list
- Sort in global search results
- URL/`hash` sort params
- Live Steam sync from SPA
- Backfilling last-played without re-running Steam import
- Asc/Desc labels that change by key (e.g. А→Я) — keep ↑/↓

## Files (expected)

| Path | Change |
|---|---|
| `src/domain/types.ts` | `lastPlayedAt` |
| `src/domain/validation.ts` | field + datetime |
| `src/domain/catalogue.ts` or `catalogSort.ts` | `sortCatalogGames` + types |
| `src/domain/steamImport.ts` | map `rtime_last_played` |
| `scripts/validate-data.mjs` / import CLI | mirror |
| `public/data/library.json` | add null field |
| `src/components/ScreenFilterBar.tsx` + sort menu component | UI |
| `src/pages/CatalogPage.tsx` | apply sort |
| `src/pages/GamePage.tsx` / `diffModel` | read-only display + label |
| `src/styles.css` | sort toggle layout in sheet |
| `tests/*` | domain, import, UI, CSS |

## Verification

```bash
npm test
npm run data:validate
npm run build
```

Manual: open catalog filter sheet → change sort/dir → order updates; reload keeps sort; hash query unchanged; Steam re-import fills `lastPlayedAt`.
