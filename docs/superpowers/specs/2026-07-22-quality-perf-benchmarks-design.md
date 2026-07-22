# Quality, performance, UI guidelines, and benchmarks

Date: 2026-07-22  
Status: approved

## Problem

mygameslist is a static React/Vite personal game library (RU UI, HashRouter, patch-based local edits). It already has solid domain tests and some UI/CSS tests, but:

1. **No project-specific UI design skill/rule** — agents fall back to generic `using-ui-stack` / `frontend-design`, which conflict with the real dark-first token system in `src/styles.css`.
2. **No coverage gate** — Vitest runs without `coverage` config/script; lockfile has coverage packages unused.
3. **No benchmark suite** — no Vitest benches, bundle size tracking, Playwright FPS, or Lighthouse audits.
4. **Architecture hotspots hurt performance and maintainability** — `LibraryContext.tsx` (~1145 lines), `GamePage.tsx` (~1272), `App.tsx` (~703), `styles.css` (~5328). `useLibrary()` is consumed only in `App.tsx`, so library state updates re-render the whole app tree.
5. **Catalog lists mount every filtered `GameCard`** — fine for small libs, costly for large fixtures (~16k-line `library.json`, hundreds of media files).

## Goals

1. Land a **project UI skill + thin Cursor rule** that encode real tokens/patterns.
2. Enable **Vitest coverage** with a hard gate: **≥ 70% lines** on `src/**`.
3. Ship a **comprehensive benchmark suite**:
   - Vitest `bench` for domain + catalog filter pipeline
   - Bundle/build size script after `vite build`
   - Playwright scroll **FPS** on catalog (and optionally tier)
   - **Lighthouse full audit** on key HashRouter routes
4. **Improve architecture with performance priority**:
   - Extract pure modules from megas (behavior-identical)
   - Render isolation via memoized route islands + `useLibrarySelector` (or equivalent store subscription)
   - **Catalog list virtualization** with `@tanstack/react-virtual`
5. Write a **descriptive implementation plan** for a smaller LLM (bite-sized TDD tasks).
6. Document **further perf ideas** (implement only if cheap after main work).

## Non-goals

- Tier board virtualization (conflicts with `@dnd-kit`; defer).
- Notes list virtualization.
- Schema v2 / patch semantics / publish allowlist changes.
- Visual redesign or new marketing surfaces.
- Hard CI fail gates on FPS or Lighthouse scores in v1 (report-only).
- Splitting `styles.css` by route (plan-only unless trivial).

## Decisions (from brainstorming)

| Topic | Choice |
|---|---|
| Session scope | Full stack: skill/rule + benchmarks + coverage + selected perf + plan |
| Arch depth | Aggressive: module splits + render isolation + virtualization where allowed |
| Virtualization targets | Catalog yes; tier deferred; notes no |
| Tier + DnD | Keep full DnD; no tier virtualization this cycle |
| Coverage | Hard floor 70% lines on `src/**` |
| Benches | Vitest + filter micro-bench + bundle sizes + Playwright FPS + Lighthouse |
| Approach order | Tooling-first vertical slices (safety net before risky moves) |

## Architecture

### Layering (unchanged)

`src/domain` → `src/state` → `src/pages` / `src/components` → `tests/` + `scripts/` + `benchmarks/`

Invariants must not break: schema v2 exact keys, SHA-256 assets, metadata-only browser patch (`blobs: {}`), published assets immutable, RU product strings, HashRouter routes, tier/notes DnD.

### Implementation order

```
UI skill/rule
  → coverage tooling + vitest benches + bundle script
    → extract pure modules (LibraryContext / GamePage / App helpers)
      → App render islands + useLibrarySelector
        → catalog virtualization
          → Playwright FPS + Lighthouse
            → fill tests to ≥70% lines
              → write small-LLM implementation plan (if not already drafted alongside)
```

### Render isolation

Today `useLibrary()` is only used in `App.tsx` (provider + app shell). Any `LibraryState` / storage / local-asset tick re-renders the entire route tree.

**Design:**

1. Keep a single `LibraryProvider` (do not invent multiple React contexts).
2. Introduce library state as an external store read via `useSyncExternalStore`, with:
   - `useLibrary()` — full snapshot (compat for shell/boot)
   - `useLibrarySelector<T>(selector, isEqual = Object.is)` — selected slice only  
   Provider continues to own boot/persist/sync side effects; it publishes snapshots into the store. Avoid “context value object identity” as the re-render signal.
3. Split App consumers into memoized route islands, e.g. `CatalogRoute`, `TierRoute`, `GameRoute`, shell chrome — each selects only the slices it needs (`games`, `assets`, `resolveAssetUrl`, `moveGame`, …).
4. Audit action identities (`saveGame`, `moveGame`, `refreshFromPublished`, …) so they stay stable across unrelated state updates (actions live on a stable API object or ref).

### Module splits (behavior-identical)

| From | Extract toward |
|---|---|
| `src/state/LibraryContext.tsx` | Pure helpers: patch usage, local-asset verify/GC, prepared assets — e.g. `src/state/libraryAssets.ts`, `src/state/libraryPatchHelpers.ts` |
| `src/pages/GamePage.tsx` | Note grouping, DnD collision/sensors, draft helpers — e.g. `src/pages/gameNotes.ts` + small presentational components under `src/components/` or `src/pages/game/` |
| `src/App.tsx` | `fieldLabels`, diff grouping helpers — e.g. `src/components/libraryUi.ts` extensions or `src/App/diffModel.ts` |

No behavior changes in these extractions; move tests with the symbols.

### Catalog virtualization

- **Target:** `.catalog-list` in `src/pages/CatalogPage.tsx` (flat `GameCard` `variant="list"`). Note: `ShelfGrid` is notes masonry on `GamePage`, **not** the catalog.
- **Library:** `@tanstack/react-virtual` (new dependency).
- **Scroll root:** the catalog page / `PullToRefresh` scroll container; must respect `scrollSelf`.
- **Chrome outside the virtual window:** active filter chips, empty state.
- **Heights:** estimate + measure; variable card height supported.
- **Fallback:** if scroll root cannot be resolved, render full list (dev warning once).
- **Tests:** filtered count, only a subset of cards mounted while “scrolled”, open-game callback still works, empty/filter-zero unchanged.

### Tier this cycle

- No list virtualization.
- Still eligible for module extracts and selector-based isolation so tier does not re-render on unrelated patch/sync UI state.
- Existing `memo` on tier rows / `useDeferredValue` for filters stays.

## UI skill and rule

### Deliverables

1. **Skill:** `.cursor/skills/mygameslist-ui/SKILL.md` + `tokens.md`  
   - Trigger: pages, components, CSS, RU chrome, CSS regression tests.  
   - Prefer this skill over `using-ui-stack` **in this repo**.  
   - Keep generic `frontend-design` only for net-new marketing surfaces (none today).
2. **Rule:** `.cursor/rules/mygameslist-ui.mdc`  
   - `globs`: `src/pages/**/*`, `src/components/**/*`, `src/styles.css`, `tests/*-css.test.ts`  
   - Thin pointer to tokens + “no new raw hex without light/dark pair”.

Note: `.cursor/` is often gitignored (user and/or repo). Always write skill/rule to `.cursor/` for local agents, **and** mirror the same content into `docs/agent/mygameslist-ui/` (SKILL.md + tokens.md + rule.md) so the smaller LLM and git history have a tracked copy. Agents: prefer `.cursor/` if present, else `docs/agent/mygameslist-ui/`.

### Token canon (from `:root` / `data-theme="light"`)

- Surfaces: `--bg`, `--surface`, `--surface-2`, `--surface-3`, `--field`
- Text: `--text`, `--muted`, `--muted-2`
- Accent: `--accent`, `--accent-strong`, `--accent-wash`
- Semantic: `--danger`, `--warning`, `--success`
- Chrome: `--line`, `--line-soft`, `--header-bg`, `--overlay-bg`, `--elevated-bg`, `--glass-fill`, `--glass-stroke`, `--hover-wash`, `--hover-wash-strong`, `--press-wash`
- Controls: `--control-height` (30px), `--control-pad-x`, `--control-radius` (5px), `--touch-target` (44px), `--radius` (6px)
- Buttons: `--btn-primary-*`, `--btn-secondary-*`, `--btn-danger-*`
- Typography: system SF / Helvetica Neue / Segoe UI stack; body ~13px / 1.4 — dense, not marketing

### UI patterns to enforce

- Reuse existing BEM-ish classes (`button button--primary`, `catalog-list`, `app-shell`, …).
- Density over large marketing whitespace.
- Cards only when interaction needs a container.
- Motion ≤ ~300ms; honor `prefers-reduced-motion` (already used in CSS/components).
- Extend existing mobile chrome (tab bar, swipe pager, filter bar) — do not fork parallel nav.
- Layout/CSS changes still require `tests/*-css.test.ts` assertions when that is the project norm.

## Coverage

- Provider: Vitest coverage **v8**.
- Script: `npm run test:coverage`.
- Config in `vite.config.ts` `test.coverage`: include `src/**/*.{ts,tsx}`, exclude test setup / type-only files as needed.
- **Gate:** fail if lines coverage **&lt; 70%** for included `src/**`.
- Prefer unit tests on extracted pure functions over brittle full-App mounts.
- Expected gap fills: library helpers, game-note helpers, App diff helpers, `useLibrarySelector`, catalog virtual list.

## Benchmark suite

Layout:

```
benchmarks/
  vitest/           # imported by vitest bench config or tests/*.bench.ts
  fps/              # Playwright scroll FPS runner
  lighthouse/       # Lighthouse route audits
  fixtures/         # optional synthetic large-library generator
  results/          # gitignored artifacts
  README.md         # how to run, what numbers mean
```

Add `benchmarks/results/` to `.gitignore`.

### Commands

| Script | Purpose | Gate v1 |
|---|---|---|
| `npm run bench` | Vitest benches (domain + filter pipeline) | report only |
| `npm run bench:bundle` | Record `dist/` asset sizes post-build | fail if `dist/` missing |
| `npm run bench:fps` | Playwright catalog (optional tier) scroll FPS | fail only on runner crash |
| `npm run bench:lighthouse` | Lighthouse full categories on key routes | fail only on runner crash |
| `just bench` | Runs the above (build first as needed) | local / manual CI |

`just check` stays `validate + test + build` (no forced FPS/Lighthouse).

### Vitest benches

Hot paths at minimum:

- Patch apply / reconcile helpers (representative ops)
- `gameMatchesFilters` / catalog filter+sort over fixture-sized game arrays
- Rank / catalogue helpers if they show up in profiles
- Validation of a representative database slice

Use deterministic fixtures (seeded generator or checked-in compact JSON under `benchmarks/fixtures/`).

### Bundle size

After `npm run build`, record sizes of main JS/CSS chunks and total `dist/` (or `dist/assets/*`). Write JSON to `benchmarks/results/bundle.json`.

### Playwright FPS

- DevDeps: `playwright` (browsers installed via documented `npx playwright install` / just recipe).
- Flow: build or preview server → open `#/games` with a large library seed → programmatic scroll → sample `requestAnimationFrame` / Chrome metrics → median FPS + p95 frame time.
- Optionally repeat for `#/` tier scroll (no virtualization expected; baseline only).
- Output: console summary + `benchmarks/results/fps.json`.

### Lighthouse full audit

- DevDeps: `lighthouse` (+ Chrome via playwright chromium or `chrome-launcher`).
- Flow: `vite build` → `vite preview` → audit:
  - `#/` tiers
  - `#/games` catalog
  - one `#/games/:id` game page (stable fixture id)
- Categories: Performance, Accessibility, Best Practices, SEO.
- Note: HashRouter SPA may score poorly on SEO — still report honestly; do not fake meta for the score.
- Output: HTML + JSON under `benchmarks/results/lighthouse/`.

## Error handling

- Extractions must keep existing tests green before the next task starts.
- Catalog virtualization: empty and “no matches” paths unchanged; missing scroll root → full list + one dev warning.
- `useLibrarySelector` / `useLibrary`: throw if used outside `LibraryProvider`.
- Coverage: print % and top uncovered files on failure.
- FPS/Lighthouse: non-zero exit only when the harness cannot run (server/browser missing), not when scores/FPS are low.
- Bundle bench: non-zero if `dist/` absent.

## Testing strategy

Per code task:

1. Write/adjust failing test (TDD where pure logic).
2. Implement minimal change.
3. Run targeted vitest file(s), then `npm test`.
4. If published shape touched: `npm run data:validate`.
5. Before declaring the program done: `npm run test:coverage` (≥70%), `npm run build`, and a manual/local `just bench` smoke.

CSS/layout changes continue to use `tests/*-css.test.ts` patterns.

## Further performance suggestions (document; implement only if cheap)

Already partly present (do not re-do blindly):

- `GameCard` / note images use `loading="lazy"`.
- Some CSS already uses `content-visibility: auto` (e.g. catalog-related rules around ~2416 in `styles.css`).
- Tier already uses `memo` / `useDeferredValue` in places.

Additional ideas for the plan’s “optional stretch” section:

1. `React.lazy` for heavy surfaces (`GamePage`, markdown stack, `@jsquash/webp` encode path).
2. Deduplicate catalog filter work (hash sync vs deferred filter pipeline).
3. Avoid rebuilding tier `gameById` maps when inputs unchanged (audit current `useMemo` deps).
4. Confirm `content-visibility` applies to the list path used after virtualization (complement, not replace).
5. Audit local-asset object URL revoke batching for leaks under rapid edits.
6. Ensure GitHub sync stage updates do not remount the swipe pager.
7. Later: route-split CSS (high cascade risk) — plan-only.

## Success criteria

- [ ] `mygameslist-ui` skill + rule on disk and usable by agents
- [ ] `npm run test:coverage` passes with ≥70% lines on `src/**`
- [ ] `npm run bench`, `bench:bundle`, `bench:fps`, `bench:lighthouse` documented and runnable; `just bench` wired
- [ ] Catalog list virtualized; tier DnD behavior unchanged
- [ ] Selector/islands reduce unrelated re-renders (test and/or documented bench delta)
- [ ] Pure-module extractions landed without behavior drift
- [ ] Design spec approved; implementation plan written under `docs/superpowers/plans/` for a smaller LLM

## Risks

| Risk | Mitigation |
|---|---|
| Virtual list + `PullToRefresh` scroll root bugs | Explicit scroll-parent resolution tests; fallback to full list |
| Selector hook subtle stale props | Shared equality helper; regression tests on island memo |
| Coverage 70% hard on huge UI files | Extract pure logic first; test extracts; avoid snapshot spam |
| Playwright/Lighthouse flaky locally | Report-only; pin browser install steps; seed deterministic fixture |
| `.cursor/` not committed | Mirror to `docs/agent/mygameslist-ui/`; agents read `.cursor/` first |

## References

- Architecture rule: `.cursor/rules/mygameslist-architecture.mdc`
- Feature skill: `.cursor/skills/mygameslist-feature/SKILL.md`
- Tokens source of truth: `src/styles.css` `:root` / `[data-theme="light"]`
- Existing filter design: `docs/superpowers/specs/2026-07-22-screen-filter-bar-design.md`
