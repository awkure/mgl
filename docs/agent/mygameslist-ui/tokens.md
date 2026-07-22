# mygameslist design tokens

Source of truth: `src/styles.css` `:root` and `:root[data-theme="light"]`.

## Surfaces
`--bg`, `--surface`, `--surface-2`, `--surface-3`, `--field`

## Text
`--text`, `--muted`, `--muted-2`

## Accent / semantic
`--accent`, `--accent-strong`, `--accent-wash`
`--danger`, `--warning`, `--success`

## Chrome
`--line`, `--line-soft`, `--header-bg`, `--overlay-bg`, `--elevated-bg`
`--glass-fill`, `--glass-stroke`
`--hover-wash`, `--hover-wash-strong`, `--press-wash`
`--shadow`

## Controls
`--control-height: 30px`
`--control-pad-x: 10px`
`--control-radius: 5px`
`--touch-target: 44px`
`--radius: 6px`

## Buttons
`--btn-primary-*`, `--btn-secondary-*`, `--btn-danger-*` (fg/bg/border + hover/active)

## Typography
System stack: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", "Segoe UI", sans-serif`
Body ~13px / line-height 1.4. Dense personal-library UI — not marketing landing.

## Themes
Default dark. Light via `data-theme="light"`. Every new color needs both themes.
