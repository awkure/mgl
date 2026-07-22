# Tab bar press glass — design

Date: 2026-07-22

## Goal

1. Block mobile Safari / long-press link previews on footer tab buttons (and the add FAB).
2. On press (hold) of a tab, move the existing sliding active blob under that tab, slightly enlarge it, and show a Slack-like liquid-glass surface with chromatic fringe plus a mild lens on that tab’s icon/label.

## Decisions

- **Press target (C):** blob follows the **pressed** tab index while pointer is down; after release/navigate it returns to pager-driven `--pager-progress`
- **Trigger (A):** press only — no idle hover lens
- **Fidelity (B):** surface glass + mild content lens (slight scale/blur on pressed tab icon+label). No SVG displacement warp
- **Approach (1):** CSS + shell press state via pointer events; not pure `:has(:active)` and not SVG filters
- **Add button:** callout block only — no blob lens (blob is three-tab only)
- **Swipe conflict:** while `data-pager-dragging="true"`, ignore/clear press lens so drag progress owns the blob

## Behavior

### Press lens

1. `pointerdown` on a tab `NavLink` → set shell press state: tab index `0|1|2` and `data-tab-press="true"` (exact attribute/CSS var names may be `--press-tab` + data attr).
2. Blob `translateX` uses press index while pressed (same column width math as today’s `--pager-progress` path).
3. Blob scales ~1.08–1.12 from center; glass + chromatic fringe activate.
4. Pressed tab’s icon + label get mild `scale(~1.06)` + light blur (~0.3–0.5px).
5. `pointerup` / `pointercancel` / pointer leave that ends the press → clear press state.
6. If the click navigates, blob settles via existing pager progress animation afterward.
7. Desktop and touch share the same press path; no hover-only glass.

### Link preview block

On tab links and the add (`app-tab-add`) anchor:

- CSS: `-webkit-touch-callout: none`, `user-select: none` (and webkit user-select)
- JS: `onContextMenu` → `preventDefault` (same idea as `GameCard` Safari callout guard)
- `draggable={false}` on those anchors

## Visuals

### Blob under press

- Slight overflow past bar height OK (Slack-like droplet)
- Stronger translucent glass: fill + `backdrop-filter` blur/saturate + inset gloss highlights
- Chromatic fringe via thin RGB edge rings (`box-shadow` and/or `::before`/`::after`), ~1px channel offset — not full RGB content split
- Motion ≤280ms, matching existing blob easing where practical
- `prefers-reduced-motion: reduce`: no scale grow, no fringe animation; position may jump

### Idle / active (unchanged)

- Idle blob remains accent-wash sliding indicator driven by `--pager-progress`
- Active tab link stays color-only (no fill on the link itself)

## Implementation

### Files

| File | Change |
|---|---|
| `src/components/AppShell.tsx` | Press pointer handlers on tab links; press attrs/vars on shell or tab bar; contextmenu + `draggable={false}` on tab + add links |
| `src/styles.css` | Press glass/scale/fringe on `.app-tab-bar__blob`; mild lens on pressed link; callout CSS; reduced-motion |
| `tests/mobile-nav-css.test.ts` | Assert new selectors / properties |
| Optional UI test | DOM assert for press attrs if CSS-only coverage is too weak |

### Out of scope

- Desktop header nav (`.app-nav`) press glass
- Domain / schema / patch / `library.json`
- Full SVG `feDisplacementMap` refraction
- Changing swipe pager math beyond press-vs-drag precedence

## Testing

- Extend `tests/mobile-nav-css.test.ts` for press-glass selectors, callout CSS, reduced-motion hooks
- Run `npm test` (at least mobile-nav + any new shell UI test)
- Manual: long-press tab on iOS/Safari — no link preview; blob moves under finger with glass; release/navigate settles

## Success criteria

- Long-press footer tab/add does not show system link preview
- Pressing any tab moves/scales the blob under that tab with liquid-glass + chromatic fringe
- Pressed tab icon/label shows mild lens; other tabs unchanged
- Release + navigation restores pager-driven blob position
- Swipe-drag still owns blob (no press fight)
- `prefers-reduced-motion` disables grow/fringe flourish
`}