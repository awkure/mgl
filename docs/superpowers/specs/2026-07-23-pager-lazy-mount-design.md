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

Two UI-only pieces in one ship:

1. Mount policy in `SwipePager` (active ±1 + overlay-aware unmount).
2. Note-drag hot-path in `ShelfGrid` (skip useless remeasure while packing frozen).

No domain / patch / `library.json` changes.

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

## Note-drag hot path

[`ShelfGrid`](../../../src/components/ShelfGrid.tsx) already gets `packingFrozen` while a note is dragged / edited, but its `MutationObserver` still schedules layout on class / attribute churn (`is-dragging`, `is-drop-target`). That remeasures natural heights even when packing stays frozen — costly on Safari during drag.

Rules:

1. While `packingFrozen`, do **not** schedule layout for mutations that only flip drag/drop classes (or equivalent attribute noise that does not change card order, children, or size-relevant content).
2. Still layout when: child list / order changes, size-relevant content changes, column count / resize, or `packingFrozen` clears (then honor any pending repack).
3. Do **not** rewrite DragOverlay markdown or collision detection in this change unless measure-skip alone is clearly insufficient after implement — prefer the observer gate first.

## Touch map

| Path | Change |
|---|---|
| `src/components/SwipePager.tsx` | Gate children by near + overlay |
| `src/components/ShelfGrid.tsx` | Skip drag-class remeasure while `packingFrozen` |
| Tests (pager / tab-stack UI) | Assert mount / unmount rules |
| `tests/shelf-grid.test.tsx` | Assert frozen + class flip does not remeasure / repack |

## Verification

**Automated**

- Far panel: no root content in DOM when `|i - active| > 1`.
- Near ±1: root present when that tab has no overlay.
- Active tab with overlay: overlay mounted, root island absent.
- Become near again / return to tab: content remounts; stack still restores game hash/route.
- ShelfGrid: with `packingFrozen`, toggling drag classes does not trigger a full natural-height remeasure / repack; unfreeze still applies pending layout.

**Manual (iPad Safari PWA)**

- Swipe tabs: neighbor peek works; no multi-second hitch.
- Open game → drag notes: smoother than before.
- Pop game → list remounts acceptably.

## Out of scope

- Virtualizing note cards
- Changing tab-stack data model or keep-alive semantics beyond UI remount
- Desktop-only alternate navigation
- DragOverlay / collision rewrite unless measure-skip proves insufficient (separate follow-up)
