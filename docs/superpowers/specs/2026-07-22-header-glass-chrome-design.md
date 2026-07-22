# Header glass chrome — design

Date: 2026-07-22

## Goal

Transparent app header. Frosted glass only on interactive chrome (filter field, search field, header action controls). Open search popover sits flush under the field with tighter padding.

## Decisions

- **Search stack (B):** Keep field + popover stacked. Remove the 5px air gap (`top: 100%`). Tighten filters padding. Keep the filters `border-bottom` hairline. Do not merge into one panel.
- **Desktop nav (C):** Leave `.app-nav__link` unchanged (plain text / underline active).
- **Approach:** Per-control glass (reuse `--glass-fill` / `--glass-stroke` + existing blur recipe). No shared utility class. Do not change global `--field`.

## Visual rules

1. `.app-header` stays `background: transparent` with `isolation: isolate`. No full-bleed glass strip (remove `.app-header::before` frost).
2. Apply glass recipe to:
   - `.screen-filter-bar__field`
   - `.global-game-search__field` (base and mobile `.is-open` override; no opaque `--field` / `--surface`)
   - `.app-header .button--ghost.button--icon`, `.app-header .random-game-button`, `.app-header .patch-pill` (own `backdrop-filter` so frost works without strip)
3. Glass recipe:

```css
background: var(--glass-fill);
border-color: var(--glass-stroke);
-webkit-backdrop-filter: blur(22px) saturate(1.35);
backdrop-filter: blur(22px) saturate(1.35);
```

4. `.global-game-search__popover { top: 100%; }` (was `calc(100% + 5px)`).

## Out of scope

- Nav / tab-bar redesign
- Merging search into one continuous panel
- Form inputs / global `--field`
- Markup changes in `AppShell` / `GlobalGameSearch`
- Domain / patch / publish paths

## Files

- `src/styles.css` — chrome CSS only
- `tests/mobile-nav-css.test.ts` — assert strip gone; glass on controls; popover flush
- Related CSS tests only if they pin `--field` on these controls

## Verification

```bash
npx vitest run tests/mobile-nav-css.test.ts tests/catalog-density-css.test.ts tests/button-system-css.test.ts
```

Manual: transparent header over covers; frosted filter + actions; open search flush under field.
