# Site Favicon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the locked game-diary favicon (solid accent tile, paper notebook, upright full gamepad) and wire it in `index.html`.

**Architecture:** Single SVG source of truth in `public/`; derive ICO + apple-touch PNG from that SVG; link all three from `index.html`. No domain or CSS token changes.

**Tech Stack:** Static SVG; one-shot Node rasterize (`sharp` / `png-to-ico` via npx); Vite `public/` serving.

## Global Constraints

- Motif: closed diary + horizontal full gamepad; no cover bookmark-dot; pad not rotated.
- Colors: tile `#416d8f`, paper `#f7fbff`, spine `#83b4dc`.
- Files: `public/favicon.svg`, `public/favicon.ico`, `public/apple-touch-icon.png`.
- No library.json / patch / schema changes.

---

## File map

| File | Responsibility |
|---|---|
| `public/favicon.svg` | Canonical mark (64×64 viewBox) |
| `public/favicon.ico` | Legacy tab/fallback |
| `public/apple-touch-icon.png` | 180×180 iOS |
| `index.html` | `<link rel="icon">` + apple-touch |

---

### Task 1: SVG source

- [x] Write `public/favicon.svg` matching locked C1 upright mockup.
- [x] Spot-check geometry (spine, grips, D-pad, 4 buttons).

### Task 2: Raster derivatives

- [x] Render 32/48 PNG → pack `favicon.ico`.
- [x] Render 180×180 → `apple-touch-icon.png`.

### Task 3: HTML wiring

- [x] Add link tags in `index.html` for svg, ico, apple-touch.

### Task 4: Verify

- [x] Confirm files exist under `public/` and links present in `index.html`.
