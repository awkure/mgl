# Mobile search bar under header

## Goal

On mobile chrome, replace the collapsed search icon with an always-visible search field under the header on tiers and catalog. Tapping/focusing opens the same filters + results overlay as today. On settings / game / new, keep the header icon fallback.

Desktop search stays unchanged (inline in header).

## Placement

| Context | Search UI |
|---|---|
| Mobile + `tiers` or `catalog` | Sticky bar under header: full-width field (search icon + input + filter button). No search control in the header row. |
| Mobile + `settings` / `game` / `new` | Header keeps icon-only collapsed control (current ≤500px look). No under-header bar. |
| Desktop / non-mobile chrome | Unchanged: search in header. |

Layout must reserve vertical space so main content does not sit under the bar. Prefer a dedicated `--app-search-bar-height` (or bump of `--app-header-height`) applied only when the bar is shown.

## Behavior

- Collapsed bar always shows a typeable search input; typing updates `q` as today.
- Focus / tap field / filter button sets `is-open` and shows the existing popover (filters, results, “show all”, close).
- Close / Escape / dismiss returns to the under-header field (not an icon) on tiers/catalog.
- Catalog route keeps filters-only popover mode.
- On settings/game/new, icon tap opens the same full-screen mobile overlay as current.

## Approach

CSS + shell placement swap (single `GlobalGameSearch` instance). No domain/state changes. Avoid dual search instances.

## Touch map

| File | Change |
|---|---|
| `src/components/AppShell.tsx` | Route flag for bar vs header placement; render search under header on tiers/catalog (mobile), in header otherwise. |
| `src/components/GlobalGameSearch.tsx` | Optional layout variant/class (`bar` vs `icon`) for collapsed chrome; open/filter logic unchanged. |
| `src/styles.css` | Sticky under-header bar; disable ≤500px icon-collapse in bar mode; height vars; open overlay positioning relative to bar. |
| `tests/mobile-nav-css.test.ts` (and/or dedicated search CSS test) | Assert bar rules, height vars, icon-collapse only outside bar mode. |

## Out of scope

- Desktop layout changes
- Domain/catalog search scoring or URL serialization changes
- Inline (non-overlay) filter expansion
- Removing search access on settings/game/new
