# Rename mygameslist → mgl — design

Date: 2026-07-23

## Goal

Replace every occurrence of the string `mygameslist` with `mgl` in the project, including GitHub repo config used for publish/sync, and rename local Cursor agent skill/rule paths that still say `mygameslist`.

## Decisions

- **GitHub config (A):** update repo name strings to `mgl` (`.env.example`, tests, DiffSyncPanel copy).
- **Agent assets (A):** rename `.cursor/skills/mygameslist-*` and `.cursor/rules/mygameslist-*` (dirs + text) to `mgl-*`. Note: `.cursor/` is gitignored — local only, not committed.
- **Remote rename (A):** `origin` is already `awkure/mgl` — skip. If `awkure/mygameslist` is still the publish target and owned, rename that repo to `mgl` and point the `awkure` remote at the new URL.
- **Approach (1):** one mechanical pass — string replace + path renames. No storage-key / package-name brand sweep.

## In scope

| Location | Change |
|---|---|
| `.env.example` | `VITE_GITHUB_REPOSITORY_NAME`, PAT name/description → `mgl` |
| `tests/library-context.test.tsx`, `tests/pending-publication.test.ts` | repo paths / `repo: "mgl"` |
| `src/components/DiffSyncPanel.tsx` | RU copy mentioning repo name |
| `src/state/randomGamePrefs.ts` | event `mygameslist:…` → `mgl:…` |
| `justfile` | comment |
| `docs/superpowers/**` | skill name refs `mygameslist-ui` → `mgl-ui` |
| `.cursor/skills/mygameslist-feature`, `mygameslist-ui` | rename dirs + internal text → `mgl-feature`, `mgl-ui` |
| `.cursor/rules/mygameslist-*.mdc` | rename files + text → `mgl-*.mdc` |
| git remote `awkure` (if renamed on GitHub) | URL → `…/mgl.git` |

## Out of scope

- Local filesystem folder `…/trash/mygameslist` (workspace path).
- npm package name `my-game-library`.
- `localStorage` keys prefixed `my-game-library.*`.
- UI product title (“Моя игровая библиотека” / “Игры”).
- Renaming `origin` (already `awkure/mgl`).

## Verification

1. `rg mygameslist` → zero hits under repo (except this spec’s historical title if kept; prefer zero by using past tense only in Goal).
2. Relevant unit tests: `library-context`, `pending-publication`, random-game prefs if covered.
3. Confirm `VITE_GITHUB_REPOSITORY_NAME` / remotes match the real publish repo after any `gh` rename.

## Risk

Publish/sync breaks if config says `mgl` but the GitHub repo that holds `library.json` is still named `mygameslist`. Mitigate by renaming that remote repo (or leaving env override) before deploying the string change.
