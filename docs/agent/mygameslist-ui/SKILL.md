---
name: mygameslist-ui
description: >-
  Project UI guidelines for mygameslist — dark-first CSS tokens, dense RU library
  chrome, BEM-ish classes, button/control patterns. Use when editing pages,
  components, styles.css, or CSS regression tests. Prefer over using-ui-stack
  in this repo.
---

# mygameslist UI

Read [tokens.md](tokens.md) before adding colors or control sizes.

## Do

- Use CSS variables from tokens.md — never invent one-off hex for new UI without light/dark pairs.
- Reuse classes: `button button--primary|secondary|danger`, `app-shell`, `catalog-list`, `empty-state`, `form-card`, `filter-menu`.
- Keep density; RU product strings consistent with existing copy.
- Motion ≤300ms; wrap/honor `prefers-reduced-motion`.
- Touch targets ≥ `--touch-target` (44px) for primary mobile hit areas.
- Extend existing mobile chrome (tab bar, swipe pager, screen filter bar) — do not fork nav.
- CSS/layout changes: add/extend `tests/*-css.test.ts` when that is the local norm.

## Do not

- Apply generic `using-ui-stack` 8px/Tailwind/purple defaults here.
- Build marketing heroes, stat strips, or decorative cards.
- Put business rules only in components (domain → state → UI).
- Change schema/patch/publish paths for cosmetic work.

## frontend-design skill

Only for net-new marketing surfaces (none in-app today). In-app chrome → this skill.
