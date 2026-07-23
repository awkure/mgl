# Pager lazy mount — design

Date: 2026-07-23

## Goal

Cut iPad Safari (PWA / web-app wrapper) main-thread and DOM cost so tab swipe and in-game note-card drag feel usable. Today [`SwipePager`](../../../src/components/SwipePager.tsx) keeps all four root panels mounted at once; game overlays sit on top of still-live catalog/tier roots.

## Problem

- Mobile chrome mounts tiers, catalog, history, and settings together. Inactive panels only get `inert` / `aria-hidden`.
- Opening a game keeps the tab root island under the overlay.
- Tab stacks can keep a game on more than one tab; those overlays stay in the React tree even when off-screen.
- Symptom: janky horizontal swipe between tabs and janky note-box drag on M1 iPad Safari.

Acceptable trade-off: remounting a panel resets in-panel UI state (scroll, filters, tier drag mode). Tab stack route data stays; game route still restores when the tab becomes near again.

## Approach

Mount policy in `SwipePager` (active ±1 + overlay-aware unmount). Deferred note-drag hot-path (ShelfGrid) only if needed after this lands.

## Mount policy

Panel **shells** always exist (track geometry / swipe transforms). **Children** follow:

1. **Near:** mount panel content only when `|panelIndex - activeIndex| <= 1` (keeps swipe peek).
2. **Overlay wins:** if that tab has a game overlay, mount the overlay and **do not** mount the catalog/tier root under it.
3. **Far:** empty shell only (`inert`); no History / Settings / Catalog / Tier trees.
4. Apply in React for mobile chrome **and** desktop (desktop CSS already hides inactive panels).
5. Tab-stack keep-alive stays at the data layer; UI remounts when a panel becomes near again.

```text
panel i
  → |i - active| > 1  → empty shell
  → |i - active| ≤ 1
       → has overlay → overlay only (no root)
       → no overlay  → root island only
```

Example: catalog game active → live trees ≈ GamePage + neighbor roots (tiers + history), not four roots plus a buried list.

## Deferred (not v1)

If note drag stays bad after mount policy:

- While `packingFrozen`, skip ShelfGrid remeasure for drag-only class flips (`is-dragging` / `is-drop-target`).
- Only then consider lighter DragOverlay / collision tweaks.

No domain / patch / `library.json` changes in either phase.

## Touch map

| Path | Change |
|---|---|
| `src/components/SwipePager.tsx` | Gate children by near + overlay |
| Tests (pager / tab-stack UI) | Assert mount / unmount rules |
| `src/components/ShelfGrid.tsx` | Deferred follow-up only |

## Verification

**Automated**

- Far panel: no root content in DOM when `|i - active| > 1`.
- Near ±1: root present when that tab has no overlay.
- Active tab with overlay: overlay mounted, root island absent.
- Become near again / return to tab: content remounts; stack still restores game hash/route.

**Manual (iPad Safari PWA)**

- Swipe tabs: neighbor peek works; no multi-second hitch.
- Open game → drag notes: smoother than before.
- Pop game → list remounts acceptably.

## Out of scope (v1)

- ShelfGrid class-mutation skip / DragOverlay rewrite
- Virtualizing note cards
- Changing tab-stack data model or keep-alive semantics beyond UI remount
- Desktop-only alternate navigation
