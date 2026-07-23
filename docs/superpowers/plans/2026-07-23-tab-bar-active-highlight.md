# Tab Bar Active Highlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the liquid-glass tab-bar blob with a quiet sliding active-tab highlight that still tracks pager progress and continuous finger press-drag.

**Architecture:** Keep one absolute sliding pill under the four mobile tab links. Rename `.app-tab-bar__blob` → `.app-tab-bar__highlight`. Idle transform uses `--pager-progress`; press uses continuous `--press-tab` with no transform transition. Delete press-glass visuals (backdrop blur, fringe, scale, content lens). Press JS in `AppShell` + `tabBarPress.ts` stays.

**Tech Stack:** React 19, CSS custom properties, Vitest + Testing Library, Playwright e2e, existing FPS bench harness.

**Spec:** `docs/superpowers/specs/2026-07-23-tab-bar-active-highlight-design.md`

## Global Constraints

- Flat `var(--accent-wash)` + subtle inset edge only on the highlight
- No backdrop blur, chromatic fringe, press scale, or icon/label blur lens
- Idle settle transition ≤280ms; press tracking has no transform transition
- Callout block on tabs + add unchanged
- While `data-pager-dragging="true"`, clear/ignore press; highlight follows `--pager-progress` with `transition: none`
- UI-only — no domain/schema/patch
- DO NOT COMMIT AGENT SKILLS
- VCS: `git`; commit after each task with HEREDOC message
- TDD: failing tests before production edits in each task

## File map

| File | Responsibility |
|---|---|
| `src/styles.css` | Quiet highlight rules; delete press-glass blob rules |
| `src/components/AppShell.tsx` | Rename DOM class `app-tab-bar__blob` → `app-tab-bar__highlight` |
| `tests/mobile-nav-css.test.ts` | CSS contract for highlight (not blob/glass) |
| `tests/tab-bar-press-glass.test.tsx` | Keep press/drag behavior (attrs unchanged) |
| `e2e/tab-bar-blob-drag.spec.ts` → `e2e/tab-bar-highlight-drag.spec.ts` | Continuous `--press-tab` e2e; rename describe/copy |
| `benchmarks/fps/runTabBlobFps.mjs` → `runTabHighlightFps.mjs` | Rename bench + result file + npm/just/README |

---

### Task 1: CSS contract — highlight replaces blob/glass

**Files:**
- Modify: `tests/mobile-nav-css.test.ts`
- Modify: `src/styles.css`
- Test: `tests/mobile-nav-css.test.ts`

**Interfaces:**
- Consumes: existing `--pager-progress`, `--press-tab`, `data-tab-press`, `data-pager-dragging`
- Produces: selectors `.app-tab-bar__highlight` (idle + press + dragging); pressed link text-only rule

- [ ] **Step 1: Rewrite failing CSS assertions**

Replace the sliding-blob test and the press-glass block (from `defines a sliding tab blob…` through `keeps pager-dragging blob…`) with:

```ts
  it("defines a sliding tab highlight driven by --pager-progress", () => {
    expect(styles).toContain("@property --pager-progress");
    expect(styles).toContain(".app-tab-bar__highlight");
    expect(styles).not.toContain(".app-tab-bar__blob");
    const highlight = declarationsIn(styles, '.app-shell[data-mobile-chrome="true"] .app-tab-bar__highlight');
    expect(highlight).toContain("position: absolute");
    expect(highlight).toContain("width: calc((100% - 12px) / 4)");
    expect(highlight).toContain("background: var(--accent-wash)");
    expect(highlight).toContain("transform: translateX(calc(var(--pager-progress, 0) * (100% + 2px)))");
    expect(highlight).toContain("--pager-progress 280ms cubic-bezier(.22, 1, .36, 1)");
    expect(highlight).not.toContain("backdrop-filter:");
    expect(styles).toContain('.app-shell[data-mobile-chrome="true"][data-pager-dragging="true"] .app-tab-bar__highlight');
    expect(declarationsIn(
      styles,
      '.app-shell[data-mobile-chrome="true"][data-pager-dragging="true"] .app-tab-bar__highlight',
    )).toContain("transition: none");
  });

  it("press highlight follows --press-tab without glass flourish", () => {
    expect(styles).toContain("@property --press-tab");
    const press = declarationsIn(
      styles,
      '.app-shell[data-mobile-chrome="true"][data-tab-press="true"] .app-tab-bar__highlight',
    );
    expect(press).toContain("translateX(calc(var(--press-tab, 0) * (100% + 2px)))");
    expect(press).not.toMatch(/scale\(/);
    expect(press).not.toContain("backdrop-filter:");
    expect(press).not.toMatch(/transition:\s*[^;]*transform/);
    expect(press).toMatch(/transition:\s*none/);
  });

  it("pressed tab link is text emphasis only", () => {
    const pressed = declarationsIn(
      styles,
      '.app-shell[data-mobile-chrome="true"][data-tab-press="true"] .app-tab-bar__link[data-pressed="true"]',
    );
    expect(pressed).toContain("color: var(--text)");
    expect(pressed).not.toMatch(/scale\(/);
    expect(pressed).not.toContain("filter:");
  });

  it("keeps pager-dragging highlight on --pager-progress", () => {
    const dragging = declarationsIn(
      styles,
      '.app-shell[data-mobile-chrome="true"][data-pager-dragging="true"] .app-tab-bar__highlight',
    );
    expect(dragging).toContain("transition: none");
    expect(dragging).toContain("translateX(calc(var(--pager-progress, 0) * (100% + 2px)))");
  });
```

Delete obsolete tests that asserted glass lens / reduced-motion blob fringe (they are replaced above). Keep `keeps active tab link color-only without fill background`.

- [ ] **Step 2: Run CSS tests — expect fail**

Run: `npx vitest run tests/mobile-nav-css.test.ts`

Expected: FAIL — `.app-tab-bar__highlight` missing; glass/blob still present.

- [ ] **Step 3: Replace blob CSS with quiet highlight**

In `src/styles.css`, replace the block from `.app-shell[data-mobile-chrome="true"] .app-tab-bar__blob` through the press-glass `@media (prefers-reduced-motion: reduce)` tab-bar section with:

```css
.app-shell[data-mobile-chrome="true"] .app-tab-bar__highlight {
  position: absolute;
  z-index: 0;
  top: 4px;
  bottom: 4px;
  left: 4px;
  width: calc((100% - 12px) / 4);
  border-radius: 22px;
  background: var(--accent-wash);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .08);
  transform: translateX(calc(var(--pager-progress, 0) * (100% + 2px)));
  transition: transform 280ms cubic-bezier(.22, 1, .36, 1), --pager-progress 280ms cubic-bezier(.22, 1, .36, 1);
  pointer-events: none;
}

.app-shell[data-mobile-chrome="true"][data-tab-press="true"] .app-tab-bar__highlight {
  transform: translateX(calc(var(--press-tab, 0) * (100% + 2px)));
  transition: none;
}

.app-shell[data-mobile-chrome="true"][data-tab-press="true"] .app-tab-bar__link[data-pressed="true"] {
  color: var(--text);
}

.app-shell[data-mobile-chrome="true"][data-pager-dragging="true"] .app-tab-bar__highlight {
  transition: none;
  transform: translateX(calc(var(--pager-progress, 0) * (100% + 2px)));
}
```

Ensure no remaining `.app-tab-bar__blob` selectors and no press-glass `::before`/`::after` fringe rules.

- [ ] **Step 4: Run CSS tests — expect pass**

Run: `npx vitest run tests/mobile-nav-css.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/mobile-nav-css.test.ts src/styles.css
git commit -m "$(cat <<'EOF'
style(ui): quiet tab highlight replaces glass blob

EOF
)"
```

---

### Task 2: Rename highlight DOM node in AppShell

**Files:**
- Modify: `src/components/AppShell.tsx`
- Test: smoke via existing press tests (DOM still works; class rename only)

**Interfaces:**
- Consumes: Task 1 CSS
- Produces: `<span className="app-tab-bar__highlight" aria-hidden="true" />`

- [ ] **Step 1: Write failing assertion for highlight class**

Append to `tests/tab-bar-press-glass.test.tsx`:

```tsx
  it("renders sliding highlight, not glass blob", () => {
    const { container } = render(
      <AppShell onOpenDiff={vi.fn()} route="tiers" storage={{ bytes: 0, operationCount: 0 }}>
        <div>body</div>
      </AppShell>,
    );
    const tabBar = screen.getByRole("navigation", { name: "Мобильная навигация" });
    expect(tabBar.querySelector(".app-tab-bar__highlight")).toBeTruthy();
    expect(tabBar.querySelector(".app-tab-bar__blob")).toBeNull();
    expect(container.querySelector(".app-tab-bar__blob")).toBeNull();
  });
```

- [ ] **Step 2: Run test — expect fail**

Run: `npx vitest run tests/tab-bar-press-glass.test.tsx`

Expected: FAIL — highlight missing, blob still present.

- [ ] **Step 3: Rename class in AppShell**

Change:

```tsx
<span aria-hidden="true" className="app-tab-bar__blob" />
```

to:

```tsx
<span aria-hidden="true" className="app-tab-bar__highlight" />
```

Do not change press handlers / `--press-tab` logic.

- [ ] **Step 4: Run press + CSS tests — expect pass**

Run: `npx vitest run tests/tab-bar-press-glass.test.tsx tests/mobile-nav-css.test.ts tests/tab-bar-press-progress.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/AppShell.tsx tests/tab-bar-press-glass.test.tsx
git commit -m "$(cat <<'EOF'
refactor(ui): rename tab bar blob to highlight

EOF
)"
```

---

### Task 3: Rename e2e + bench to highlight

**Files:**
- Create: `e2e/tab-bar-highlight-drag.spec.ts` (content from blob e2e; update describe/test titles only — selectors stay shell/`--press-tab`)
- Delete: `e2e/tab-bar-blob-drag.spec.ts`
- Create: `benchmarks/fps/runTabHighlightFps.mjs` (copy from `runTabBlobFps.mjs`; update gesture label, result file `tab-highlight-fps.json`, console prefix `tab-highlight`)
- Delete: `benchmarks/fps/runTabBlobFps.mjs`
- Modify: `package.json` — `"bench:tab-highlight": "node benchmarks/fps/runTabHighlightFps.mjs"`; remove `bench:tab-blob`
- Modify: `justfile` — `npm run bench:tab-highlight` instead of `bench:tab-blob`
- Modify: `benchmarks/README.md` — document `bench:tab-highlight` / `tab-highlight-fps.json`

**Interfaces:**
- Consumes: Tasks 1–2 highlight behavior
- Produces: renamed e2e + report-only bench entrypoint

- [ ] **Step 1: Add e2e file with highlight naming**

Copy `e2e/tab-bar-blob-drag.spec.ts` to `e2e/tab-bar-highlight-drag.spec.ts`. Change:

- `test.describe("tab bar highlight drag", …)`
- test title: `"highlight --press-tab tracks finger across tab bar while held"`

Keep the same evaluate/`--press-tab` tracking assertions (error &lt; 0.08, travel &gt; 2).

Delete `e2e/tab-bar-blob-drag.spec.ts`.

- [ ] **Step 2: Rename bench runner + wire scripts**

Copy `benchmarks/fps/runTabBlobFps.mjs` → `runTabHighlightFps.mjs` with:

- `gesture: "tab-bar-highlight-drag"`
- result file `tab-highlight-fps.json`
- log prefix `tab-highlight`

Delete `runTabBlobFps.mjs`.

In `package.json`:

```json
"bench:tab-highlight": "node benchmarks/fps/runTabHighlightFps.mjs",
```

Remove `bench:tab-blob`.

In `justfile` `bench` recipe, replace `npm run bench:tab-blob` with `npm run bench:tab-highlight`.

Update `benchmarks/README.md` report-only list and the Tab-bar section to `bench:tab-highlight` / `tab-highlight-fps.json`.

- [ ] **Step 3: Build + run e2e highlight drag**

Run:

```bash
npm run build
npx playwright test -c e2e/playwright.config.ts e2e/tab-bar-highlight-drag.spec.ts
```

Expected: mobile project PASS; desktop skipped.

- [ ] **Step 4: Run highlight bench**

Run: `npm run bench:tab-highlight`

Expected: exit 0; prints `tab-highlight … maxTrackingError=…`; writes `benchmarks/results/tab-highlight-fps.json`.

- [ ] **Step 5: Commit**

```bash
git add e2e/tab-bar-highlight-drag.spec.ts e2e/tab-bar-blob-drag.spec.ts \
  benchmarks/fps/runTabHighlightFps.mjs benchmarks/fps/runTabBlobFps.mjs \
  package.json justfile benchmarks/README.md
git commit -m "$(cat <<'EOF'
chore: rename tab highlight e2e and bench

EOF
)"
```

---

### Task 4: Verify

**Files:** none (verification only)

- [ ] **Step 1: Unit/CSS suite**

Run: `npx vitest run tests/mobile-nav-css.test.ts tests/tab-bar-press-glass.test.tsx tests/tab-bar-press-progress.test.ts`

Expected: all PASS

- [ ] **Step 2: Grep for leftovers**

Run: `rg 'app-tab-bar__blob|bench:tab-blob|runTabBlob|tab-blob-fps' --glob '!docs/superpowers/**' --glob '!**/node_modules/**'`

Expected: no matches outside historical docs (plans/specs that mention old blob by name are OK under `docs/superpowers/`).

- [ ] **Step 3: Full test if time**

Run: `npm test`

Expected: PASS

- [ ] **Step 4: Commit only if Step 2–3 forced doc/test fixes**

Otherwise no commit.

---

## Spec coverage check

| Spec requirement | Task |
|---|---|
| Remove glass blob / fringe / scale / lens | Task 1 |
| Quiet accent-wash highlight | Task 1 |
| Rename class to `__highlight` | Tasks 1–2 |
| Continuous `--press-tab` press-drag | unchanged JS; Tasks 1–3 verify |
| Pager idle + drag ownership | Task 1 |
| Callout unchanged | no change (existing tests) |
| E2e + bench rename | Task 3 |
| No discrete-only wash / no ::before refactor | Non-goals honored |

## Placeholder / consistency scan

- Class name locked: `app-tab-bar__highlight`
- Vars locked: `--pager-progress`, `--press-tab`
- Bench script: `bench:tab-highlight` → `runTabHighlightFps.mjs` → `tab-highlight-fps.json`
- No TBD / “implement later” steps
