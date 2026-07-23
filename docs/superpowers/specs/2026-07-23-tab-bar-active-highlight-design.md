# Tab bar active highlight (no blob) — design

Date: 2026-07-23

Supersedes the **visual** parts of `2026-07-22-tab-bar-press-glass-design.md` (glass blob, fringe, scale, content lens). Callout blocking and swipe-vs-press precedence from that spec remain in force.

## Goal

1. Remove the liquid-glass footer “bubble” (`.app-tab-bar__blob` press-glass treatment).
2. Keep a **quiet active-tab highlight** that slides continuously under the tab links — idle via pager, press-drag via finger — so the highlight itself moves between tabs, not a separate glass droplet.

## Decisions

- **Indicator (A):** one absolute sliding pill under the four tab links (same layout math as today’s blob). Rename `app-tab-bar__blob` → `app-tab-bar__highlight`.
- **Look:** flat `var(--accent-wash)` + subtle inset edge only. **No** backdrop blur, chromatic fringe, press scale, or icon/label blur lens.
- **Motion:** idle follows `--pager-progress` (existing settle transition OK ≤280ms). While `data-tab-press="true"`, follow continuous `--press-tab` from finger X with **no** transform transition (1:1 track).
- **Press JS:** keep current continuous press tracking (`tabBarPress.ts` + `AppShell` pointer capture/move). Nearest tab still gets `data-pressed` for text color only (`var(--text)`), not scale/blur.
- **Active idle text:** unchanged — `aria-current="page"` → `color: var(--text)`.
- **Add FAB:** callout block only; never owns the highlight.
- **Swipe conflict:** while `data-pager-dragging="true"`, clear/ignore press so `--pager-progress` owns the highlight (`transition: none` while dragging).
- **Reduced motion:** no press flourish (already none after glass removal); position may jump; honor existing `prefers-reduced-motion` hooks if any remain after cleanup.
- **Out of scope:** domain/schema/patch; desktop header nav; SVG filters; changing swipe pager math beyond press-vs-drag precedence.

## Behavior

### Idle

1. Highlight sits under the active tab via `--pager-progress` (0…3).
2. Active link text uses `aria-current`; inactive links stay muted.

### Press / drag

1. `pointerdown` on a tab → `data-tab-press="true"`, set `--press-tab` from finger X (continuous).
2. `pointermove` while held → update `--press-tab` continuously across the bar; update `data-pressed` to nearest tab for text emphasis.
3. `pointerup` / `pointercancel` / end-of-press → clear press attrs and `--press-tab`; highlight returns to pager-driven position.
4. If click navigates, highlight settles via existing pager progress animation.

### Link preview block (unchanged)

Tab links + add: `-webkit-touch-callout: none`, `user-select: none`, `draggable={false}`, `contextmenu` → `preventDefault`.

## Implementation touch map

| Area | Change |
|---|---|
| `src/components/AppShell.tsx` | Rename blob span class; drop any glass-only attrs if unused |
| `src/styles.css` | Delete press-glass blob rules; add quiet `.app-tab-bar__highlight` idle + press transform ownership; `data-pressed` = text only |
| `tests/mobile-nav-css.test.ts` | Assert highlight selectors; remove glass/fringe/scale assertions |
| `tests/tab-bar-press-glass.test.tsx` | Keep press/drag/`--press-tab` behavior tests; rename file optional |
| `e2e/tab-bar-blob-drag.spec.ts` | Retarget to highlight; keep continuous `--press-tab` tracking assertion |
| `benchmarks/fps/runTabBlobFps.mjs` (+ package/just/README) | Rename to tab-highlight bench (or keep path, update labels/docs) |

## Success criteria

- No glass bubble / fringe / press scale on the indicator
- Continuous finger tracking of highlight position while held (same tracking error budget as current e2e)
- Idle highlight follows pager; swipe-drag still owns highlight
- Callout block still works on tabs + add
- CSS + unit + e2e updated; bench still report-only

## Non-goals

- Painting wash only on discrete link backgrounds (no continuous float)
- Pure CSS `::before` slider (acceptable later refactor; not required now)
