# Site favicon — design

Date: 2026-07-23

## Goal

Add a favicon (and related icon links) for the static personal game library so browser tabs / bookmarks / PWA-ish chrome show a distinct mark instead of the default empty document icon.

## Motif

**Game diary:** closed notebook with a clear gamepad on the cover.

Locked visual (companion C1 upright):

- Rounded square tile, fill `#416d8f` (site `--btn-primary-bg`)
- Paper diary cover `#f7fbff`, spine stripe `#83b4dc`
- No cover bookmark-dot
- Horizontal full gamepad (grips + D-pad + 4 face buttons) in primary blue on the cover
- Pad not rotated

## Deliverables

| Asset | Role |
|---|---|
| `public/favicon.svg` | Source of truth; modern browsers |
| `public/favicon.ico` | Legacy / fallback (derived from SVG) |
| `public/apple-touch-icon.png` | 180×180 for iOS home-screen |
| `index.html` `<link>` tags | `icon` (svg + ico), `apple-touch-icon` |

## Implementation notes

- Author as SVG matching the locked mockup geometry (64×64 viewBox, `rx="14"` tile).
- Rasterize ICO/PNG from that SVG (script or one-shot tool); do not hand-draw a second mark.
- Keep colors on the token hexes above; no new CSS variables required (static asset).
- No domain / library.json / patch changes.

## Out of scope

- Light-theme alternate favicon
- Maskable Android adaptive icon set beyond apple-touch
- Branding copy / title changes
- In-app UI chrome using the mark

## Verification

1. Open site → tab shows diary+pad mark at 16px.
2. View source / network: `favicon.svg` (and ico) 200.
3. Optional: add to home screen on iOS → apple-touch icon, not blank.
