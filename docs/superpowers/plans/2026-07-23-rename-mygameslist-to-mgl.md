# Rename mygameslist → mgl Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every `mygameslist` string with `mgl`, rename local Cursor agent paths, and align the `awkure` GitHub publish repo name when possible.

**Architecture:** Mechanical string replace in app/tests/env/docs; filesystem rename of gitignored `.cursor/` skill/rule paths; optional `gh repo rename` on `awkure` remote. No domain/schema changes. No `my-game-library` storage-key rewrite.

**Tech Stack:** Vite/React app strings, Vitest, `gh`, local `.cursor/` skills (gitignored).

## Global Constraints

- Replace literal `mygameslist` → `mgl` only (case-sensitive as found).
- Do not touch `my-game-library` package/storage keys or RU product titles.
- Do not commit unrelated dirty files (mobile nav work already in tree).
- `.cursor/` is gitignored — rename locally; never force-add skills to git.
- `origin` is already `awkure/mgl` — do not rename it.
- Commit only when user asks (user rule overrides frequent-commit plan habit).

---

### Task 1: App, tests, env, justfile, historical docs

**Files:**
- Modify: `.env.example`
- Modify: `src/state/randomGamePrefs.ts`
- Modify: `src/components/DiffSyncPanel.tsx`
- Modify: `tests/library-context.test.tsx`
- Modify: `tests/pending-publication.test.ts`
- Modify: `justfile`
- Modify: `docs/superpowers/specs/2026-07-22-steam-achievements-design.md`
- Modify: `docs/superpowers/plans/2026-07-22-steam-achievements.md`

**Interfaces:**
- Consumes: none
- Produces: `RANDOM_GAME_STATUSES_CHANGED_EVENT = "mgl:random-game-statuses"`; GitHub fixtures use `repo: "mgl"` and `/repos/awkure/mgl`

- [ ] **Step 1: Update `.env.example`**

```
VITE_GITHUB_REPOSITORY_NAME=mgl
VITE_GITHUB_PAT_NAME="Publish mgl"
VITE_GITHUB_PAT_DESCRIPTION="Publish library changes to awkure/mgl from My Game Library"
```

- [ ] **Step 2: Update event + UI copy**

In `src/state/randomGamePrefs.ts`:
`export const RANDOM_GAME_STATUSES_CHANGED_EVENT = "mgl:random-game-statuses";`

In `src/components/DiffSyncPanel.tsx` RU string: `репозиторий mgl`.

- [ ] **Step 3: Update tests + justfile + steam docs skill refs**

Replace `mygameslist` → `mgl` in the listed test/justfile/docs files (including `mygameslist-ui` → `mgl-ui`).

- [ ] **Step 4: Verify tests**

Run: `npx vitest run tests/library-context.test.tsx tests/pending-publication.test.ts`
Expected: PASS

---

### Task 2: Rename Cursor agent skills/rules (local)

**Files:**
- Rename: `.cursor/skills/mygameslist-feature` → `.cursor/skills/mgl-feature`
- Rename: `.cursor/skills/mygameslist-ui` → `.cursor/skills/mgl-ui`
- Rename: `.cursor/rules/mygameslist-architecture.mdc` → `.cursor/rules/mgl-architecture.mdc`
- Rename: `.cursor/rules/mygameslist-ui.mdc` → `.cursor/rules/mgl-ui.mdc`
- Modify: contents of those files + any cross-refs (`mygameslist-feature` → `mgl-feature`, etc.)

**Interfaces:**
- Consumes: Task 1 docs already say `mgl-ui`
- Produces: local agent paths under `mgl-*`

- [ ] **Step 1: `mv` directories/files**

```bash
mv .cursor/skills/mygameslist-feature .cursor/skills/mgl-feature
mv .cursor/skills/mygameslist-ui .cursor/skills/mgl-ui
mv .cursor/rules/mygameslist-architecture.mdc .cursor/rules/mgl-architecture.mdc
mv .cursor/rules/mygameslist-ui.mdc .cursor/rules/mgl-ui.mdc
```

- [ ] **Step 2: Replace text inside renamed files**

`rg -l mygameslist .cursor | xargs` replace → `mgl` / skill names → `mgl-feature`, `mgl-ui`.

- [ ] **Step 3: Confirm no `.cursor` hits**

Run: `rg mygameslist .cursor`
Expected: no matches

---

### Task 3: Align `awkure` GitHub repo + remote

**Files:** none in tree (remote + GitHub)

- [ ] **Step 1: Attempt rename**

```bash
gh repo rename mgl --repo awkure/mygameslist --yes
```

If permission denied: stop that step, leave remote URL, report blocker; local strings still `mgl` (owner must rename or override env).

- [ ] **Step 2: Update git remote if rename succeeded**

```bash
git remote set-url awkure https://github.com/awkure/mgl.git
```

---

### Task 4: Final verification

- [ ] **Step 1: Grep**

```bash
rg mygameslist --glob '!docs/superpowers/specs/2026-07-23-rename*' --glob '!docs/superpowers/plans/2026-07-23-rename*'
```

Expected: no matches (rename design/plan may keep historical slug in title only).

- [ ] **Step 2: Re-run focused tests** (same as Task 1 Step 4)

Expected: PASS
