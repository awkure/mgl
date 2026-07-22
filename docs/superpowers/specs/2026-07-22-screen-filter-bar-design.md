# Screen filter bar + always-on search button

Date: 2026-07-22  
Status: approved design

## Problem

Mobile catalog/tier roots replace the header search control with a sticky under-header search bar. That removes the search button from those screens and mixes **navigation search** with **on-screen filtering**. Catalog already filters the list via hash; tier list does not filter the board.

## Goals

1. Search button (icon / global jump search) on **every** screen, including catalog and tier roots.
2. On catalog and tier roots: a **filter** text field in the header (same row as other actions), not under the header.
3. Filter field: adaptive width so sibling buttons stay visible; on click/focus expands wider with a short smooth animation; facet controls (status, tier, platform, tag) appear in a sheet/popover under the field.
4. Filtering applies to the **visible screen content** in real time.
5. Catalog and tier keep **independent** filter state.

## Non-goals

- Changing `gameMatchesFilters` / search scoring semantics.
- Sharing filter state between catalog and tier.
- Putting tier filters in the URL.
- Sticky under-header search/filter chrome.

## UX

### Search (all screens)

- `GlobalGameSearch` stays in the header on every route.
- Narrow viewports: collapsed icon; open → typeahead combobox (navigate to game or catalog).
- Does **not** drive on-screen list/board filtering.

### Filter bar (catalog + tier tab roots only)

- Collapsed: text field with placeholder (e.g. «Фильтр…»), adaptive max-width so search / random / patch remain visible.
- Expanded (focus or click): field grows (~200–250ms); facet sheet drops below with Статус / Тир / Платформа / Тег (`FilterMenu`); optional reset.
- Typing and facet toggles filter content immediately (`useDeferredValue` allowed).
- Leave tab root (open a game, settings, etc.): filter chrome hidden; search icon remains.

### Catalog

- Filters persist in `#/games?q&status&tier&platform&tag` as today.
- List filtered with `gameMatchesFilters`; sort unchanged (`updatedAt` desc).
- Page-level active filter chips may remain.

### Tier list

- Filters held in session React state (shell or page) — not URL, not shared with catalog.
- Hide non-matching cards; **hide empty tiers**.
- Drag/reorder still operates on remaining visible cards.

## Architecture

```text
AppShell
  ├─ ScreenFilterBar   (tiers/catalog roots only)
  │     ├─ catalog → hash + CATALOG_FILTERS_EVENT → CatalogPage
  │     └─ tier → session state → TierListPage (filtered games / hide empty)
  └─ GlobalGameSearch  (always; nav-only)
```

### Components

| Piece | Change |
|-------|--------|
| `AppShell` | Always mount header search. Mount `ScreenFilterBar` on tiers/catalog roots. Remove sticky `.app-search-bar` search slot / `data-search-bar` for search. |
| `GlobalGameSearch` | Nav-only. Drop catalog filters-only dual mode. May still navigate to `#/games?…` on “show all results”; does not own live on-page filter UI. |
| `ScreenFilterBar` (new) | Text field + expand + facet sheet. Controlled `filters` / `onChange`. Reuse `FilterMenu`. |
| `CatalogPage` | Keep hash sync; consume filters without depending on `GlobalGameSearch`. |
| `TierListPage` | Take `filters` prop; apply `gameMatchesFilters` internally; omit empty tiers. |
| `styles.css` | Header filter adaptive width + expand transition; remove/repurpose under-header search bar layout vars. |

### State

- Catalog: existing `CatalogSearchFilters` + hash serialize/parse.
- Tier: separate `CatalogSearchFilters`-shaped (or same type) session state, cleared on full reload.

## Animation

- Prefer CSS `transition` on `flex-grow` / `max-width` (~200–250ms, ease-out).
- Facet sheet: short opacity/translateY reveal.
- Respect `prefers-reduced-motion: reduce` (instant or minimal).

## Testing

- Shell: search present on catalog/tier roots; no under-header search bar.
- `ScreenFilterBar`: expand opens facets; typing filters catalog; tier hides cards + empty rows.
- Catalog hash sync / StrictMode regressions still pass.
- Update CSS tests (`mobile-nav-css`, `catalog-density-css`, `button-system-css`) for new classes and removed bar.

## Verification

```sh
npm test
npm run build
```

## Decisions log

- Collapsed filter = text field (not filters-only chip).
- Expand pattern = field grows modestly + facet sheet (not full overlay covering actions).
- Filter chrome in header row, not under header.
- Independent catalog vs tier filter state; catalog URL, tier session-only.
- Tier: hide non-matches and empty tiers.
