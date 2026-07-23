# Pager lazy mount + ShelfGrid drag skip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mount only near pager panels (active ±1), drop tab roots under game overlays, and skip ShelfGrid remeasure on drag-class mutations while packing is frozen — so iPad Safari tab swipe and note drag stay usable.

**Architecture:** Pure helpers decide what each `SwipePager` panel mounts; `SwipePager` keeps four shells but gates children. `ShelfGrid` MutationObserver ignores class flips that only add/remove drag/drop markers while `packingFrozen`. No domain/patch changes.

**Tech Stack:** React 19, Vitest + Testing Library, existing `SwipePager` / `ShelfGrid` / App tab stacks.

**Spec:** `docs/superpowers/specs/2026-07-23-pager-lazy-mount-design.md`

## Global Constraints

- UI-only: no `library.json` / domain / patch / validation changes
- Remount OK (scroll/filters/tier drag mode reset); tab-stack route data unchanged
- Near window: `|panelIndex - activeIndex| <= 1`
- Overlay present → overlay only, no root island
- Drag-class skip only while `packingFrozen`; still layout on childList / size-relevant class / unfreeze
- RU copy unchanged; do not commit agent skills
- VCS: `git` — commit each task

## File map

| Path | Role |
|---|---|
| `src/components/pagerMount.ts` | Pure near/slot helpers |
| `src/components/SwipePager.tsx` | Gate panel children via helpers |
| `src/components/ShelfGrid.tsx` | Ignore drag-only class mutations while frozen |
| `tests/pager-mount.test.ts` | Helper unit tests |
| `tests/pager-lazy-mount.test.tsx` | App-level mount assertions |
| `tests/shelf-grid.test.tsx` | Frozen + drag-class no remeasure |
| `tests/tab-stack-ui.test.tsx` | Keep-alive still green (touch if needed) |

---

### Task 1: Pager mount helpers

**Files:**
- Create: `src/components/pagerMount.ts`
- Create: `tests/pager-mount.test.ts`
- Modify: `src/components/index.ts` — re-export if other components are exported from there (optional; prefer importing from `./pagerMount` in SwipePager)

**Interfaces:**
- Produces:
  - `pagerPanelNear(panelIndex: number, activeIndex: number): boolean`
  - `pagerPanelSlots(near: boolean, hasOverlay: boolean): { root: boolean; overlay: boolean }`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { pagerPanelNear, pagerPanelSlots } from "../src/components/pagerMount";

describe("pagerPanelNear", () => {
  it("is true for active and immediate neighbors only", () => {
    expect(pagerPanelNear(0, 0)).toBe(true);
    expect(pagerPanelNear(1, 0)).toBe(true);
    expect(pagerPanelNear(2, 0)).toBe(false);
    expect(pagerPanelNear(3, 0)).toBe(false);

    expect(pagerPanelNear(0, 1)).toBe(true);
    expect(pagerPanelNear(1, 1)).toBe(true);
    expect(pagerPanelNear(2, 1)).toBe(true);
    expect(pagerPanelNear(3, 1)).toBe(false);

    expect(pagerPanelNear(2, 3)).toBe(true);
    expect(pagerPanelNear(3, 3)).toBe(true);
    expect(pagerPanelNear(1, 3)).toBe(false);
  });
});

describe("pagerPanelSlots", () => {
  it("mounts nothing when far", () => {
    expect(pagerPanelSlots(false, false)).toEqual({ root: false, overlay: false });
    expect(pagerPanelSlots(false, true)).toEqual({ root: false, overlay: false });
  });

  it("mounts root only when near without overlay", () => {
    expect(pagerPanelSlots(true, false)).toEqual({ root: true, overlay: false });
  });

  it("mounts overlay only when near with overlay", () => {
    expect(pagerPanelSlots(true, true)).toEqual({ root: false, overlay: true });
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (module missing)**

Run: `npx vitest run tests/pager-mount.test.ts`

Expected: FAIL resolving `../src/components/pagerMount`

- [ ] **Step 3: Implement helpers**

```ts
// src/components/pagerMount.ts
export function pagerPanelNear(panelIndex: number, activeIndex: number): boolean {
  return Math.abs(panelIndex - activeIndex) <= 1;
}

export function pagerPanelSlots(near: boolean, hasOverlay: boolean): { root: boolean; overlay: boolean } {
  if (!near) return { root: false, overlay: false };
  if (hasOverlay) return { root: false, overlay: true };
  return { root: true, overlay: false };
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `npx vitest run tests/pager-mount.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/components/pagerMount.ts tests/pager-mount.test.ts
git commit -m "$(cat <<'EOF'
feat(pager): add near/overlay mount helpers

Decide which SwipePager panel children mount for
active±1 and game-overlay stacks.
EOF
)"
```

---

### Task 2: Wire `SwipePager` + App mount tests

**Files:**
- Modify: `src/components/SwipePager.tsx`
- Create: `tests/pager-lazy-mount.test.tsx`
- Verify: `tests/tab-stack-ui.test.tsx` still passes

**Interfaces:**
- Consumes: `pagerPanelNear`, `pagerPanelSlots` from Task 1
- Uses existing `pagerIndexFromTab(activeTab)` for `activeIndex`

- [ ] **Step 1: Write failing App mount tests**

Mirror mobile chrome stubs from `tests/tab-stack-ui.test.tsx` (matchMedia coarse/narrow, fetch library fixture with one game).

```ts
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { withComputedRevision, type Game, type LibraryDatabase } from "../src/domain";

const GAME_ID = "11111111-1111-4111-8111-111111111111";
const NOW = "2026-07-16T10:00:00.000Z";

function game(title: string): Game {
  return {
    id: GAME_ID,
    title,
    coverAssetId: null,
    steamAppId: null,
    importedVia: "manually",
    hoursPlayed: null,
    lastPlayedAt: null,
    achievementsUnlocked: null,
    achievementsTotal: null,
    steamOverrides: {},
    platforms: ["NES"],
    tags: [],
    status: "playing",
    placement: { tierId: "a", rank: 1024 },
    reviewMarkdown: "",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function database(): LibraryDatabase {
  return withComputedRevision({
    schemaVersion: 2,
    revision: "",
    publicationId: null,
    games: { [GAME_ID]: game("DuckTales") },
    notes: {},
    assets: {},
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = "";
  localStorage.clear();
});

beforeEach(() => {
  window.location.hash = "#/";
  localStorage.clear();
  vi.stubGlobal("matchMedia", vi.fn().mockImplementation((query: string) => ({
    matches: String(query).includes("max-width") || String(query).includes("pointer: coarse"),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => structuredClone(database()),
  }));
});

async function boot() {
  render(<App />);
  await waitFor(() => expect(screen.queryByText("Открываем библиотеку…")).not.toBeInTheDocument());
}

describe("pager lazy mount", () => {
  it("keeps far panel roots unmounted on catalog", async () => {
    window.location.hash = "#/games";
    await boot();
    expect(document.querySelector(".catalog-page")).toBeTruthy();
    expect(document.querySelector(".tier-page")).toBeTruthy();
    expect(document.querySelector(".history-page")).toBeTruthy();
    expect(document.querySelector(".settings-page")).toBeNull();
  });

  it("keeps far panel roots unmounted on settings", async () => {
    window.location.hash = "#/settings";
    await boot();
    expect(document.querySelector(".settings-page")).toBeTruthy();
    expect(document.querySelector(".history-page")).toBeTruthy();
    expect(document.querySelector(".catalog-page")).toBeNull();
    expect(document.querySelector(".tier-page")).toBeNull();
  });

  it("drops catalog root under an open game overlay", async () => {
    window.location.hash = "#/games";
    await boot();
    fireEvent.click(screen.getByRole("link", { name: "DuckTales" }));
    await waitFor(() => expect(window.location.hash).toBe(`#/games/${GAME_ID}`));
    expect(document.querySelector(".game-view-page")).toBeTruthy();
    expect(document.querySelector(".catalog-page")).toBeNull();
    // neighbors still near
    expect(document.querySelector(".tier-page")).toBeTruthy();
    expect(document.querySelector(".history-page")).toBeTruthy();
  });

  it("remounts catalog list after popping the game", async () => {
    window.location.hash = `#/games/${GAME_ID}`;
    await boot();
    await waitFor(() => expect(document.querySelector(".game-view-page")).toBeTruthy());
    const tabBar = screen.getByRole("navigation", { name: "Мобильная навигация" });
    fireEvent.click(within(tabBar).getByRole("link", { name: "Каталог" }));
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/games\/?(\?|$)/));
    expect(document.querySelector(".catalog-page")).toBeTruthy();
    expect(document.querySelector(".game-view-page")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL (all four roots still mounted / catalog under game)**

Run: `npx vitest run tests/pager-lazy-mount.test.tsx`

Expected: FAIL — `.settings-page` present on catalog, and/or `.catalog-page` present under game

- [ ] **Step 3: Wire `SwipePager`**

In `src/components/SwipePager.tsx`:

```ts
import { pagerPanelNear, pagerPanelSlots } from "./pagerMount";
```

Inside `SwipePager`, after `const index = pagerIndexFromTab(activeTab);`:

```ts
const tiersSlots = pagerPanelSlots(pagerPanelNear(0, index), Boolean(tiersOverlay));
const catalogSlots = pagerPanelSlots(pagerPanelNear(1, index), Boolean(catalogOverlay));
const historySlots = pagerPanelSlots(pagerPanelNear(2, index), false);
const settingsSlots = pagerPanelSlots(pagerPanelNear(3, index), Boolean(settingsOverlay));
```

Gate each panel body (keep shells + labels as today):

```tsx
<SwipePanel active={index === 0} labelledBy="tier-panel-label">
  <span className="visually-hidden" id="tier-panel-label">Тирлист</span>
  {tiersSlots.root || tiersSlots.overlay ? (
    <div className="swipe-pager__stack">
      {tiersSlots.root ? (
        <TierRouteIsland
          draggingRef={draggingRef}
          onMoveGame={onMoveGame}
          onOpenGame={(id) => onOpenGame("tiers", id)}
        />
      ) : null}
      {tiersSlots.overlay && tiersOverlay ? (
        <div className="swipe-pager__overlay">{tiersOverlay}</div>
      ) : null}
    </div>
  ) : null}
</SwipePanel>
```

Repeat the same pattern for catalog (`CatalogRouteIsland` + `catalogOverlay`, keep `active={index === 1 && catalogHashSync}` and `scrollSelf` on the island), history (`HistoryPage` only when `historySlots.root`, spread `history` props — if `history` is undefined, render nothing), settings (`SettingsPage` + `settingsOverlay`).

Do **not** change swipe gesture / track transform code.

- [ ] **Step 4: Run mount + keep-alive tests — expect PASS**

Run:

```bash
npx vitest run tests/pager-lazy-mount.test.tsx tests/tab-stack-ui.test.tsx tests/pager-mount.test.ts
```

Expected: PASS

If `tab-stack-ui` fails because a far panel query assumed always-mounted chrome, fix assertions to match near-window (do not weaken keep-alive behavior).

- [ ] **Step 5: Commit**

```bash
git add src/components/SwipePager.tsx tests/pager-lazy-mount.test.tsx tests/tab-stack-ui.test.tsx
git commit -m "$(cat <<'EOF'
perf(pager): mount active±1 panels only

Drop far tab trees and roots under game overlays
to cut iPad Safari DOM / main-thread cost.
EOF
)"
```

---

### Task 3: ShelfGrid skip drag-class remeasure while frozen

**Files:**
- Modify: `src/components/ShelfGrid.tsx`
- Modify: `tests/shelf-grid.test.tsx`

**Interfaces:**
- Internal: export `isDragOnlyClassMutation(record: MutationRecord): boolean` from `ShelfGrid.tsx` **or** a tiny sibling `shelfGridMutations.ts` if keeping the component file smaller — prefer exporting a named helper from `ShelfGrid.tsx` for unit coverage, or test only via DOM behavior (behavior test required either way).

Drag/drop class tokens to ignore (exact set):

```ts
const DRAG_LAYOUT_IGNORE_CLASSES = new Set([
  "is-dragging",
  "is-drop-target",
  "is-file-dragging",
]);
```

- [ ] **Step 1: Write failing ShelfGrid tests**

Append to `tests/shelf-grid.test.tsx`:

```ts
it("does not remeasure when only drag classes flip while packing is frozen", async () => {
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  const measure = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
    if ((this as HTMLElement).classList.contains("notes-list")) return { width: 1100, height: 300 } as DOMRect;
    return { width: 360, height: Number((this as HTMLElement).dataset.height ?? 0) } as DOMRect;
  });

  const { container, rerender } = render(
    <ShelfGrid className="notes-list" layoutKey="drag-class">
      <article className="note-card" data-height="100" data-note-id="first" key="first" />
      <article className="note-card" data-height="120" data-note-id="second" key="second" />
    </ShelfGrid>,
  );

  await waitFor(() => {
    expect(container.querySelector<HTMLElement>("article")?.style.gridColumnStart).toBe("1");
  });

  rerender(
    <ShelfGrid className="notes-list" layoutKey="drag-class" packingFrozen>
      <article className="note-card" data-height="100" data-note-id="first" key="first" />
      <article className="note-card" data-height="120" data-note-id="second" key="second" />
    </ShelfGrid>,
  );

  const callsAfterFreeze = measure.mock.calls.length;
  const first = container.querySelector<HTMLElement>("article")!;
  first.classList.add("is-dragging");
  first.classList.add("is-drop-target");

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

  expect(measure.mock.calls.length).toBe(callsAfterFreeze);
  expect(first.style.gridColumnStart).toBe("1");
});

it("still lays out on childList while packing is frozen", async () => {
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
    if ((this as HTMLElement).classList.contains("notes-list")) return { width: 1100, height: 300 } as DOMRect;
    return { width: 360, height: Number((this as HTMLElement).dataset.height ?? 0) } as DOMRect;
  });

  const { container, rerender } = render(
    <ShelfGrid className="notes-list" layoutKey="child-list" packingFrozen>
      <article data-height="100" data-note-id="first" key="first" />
    </ShelfGrid>,
  );

  await waitFor(() => {
    expect(container.querySelectorAll("article")).toHaveLength(1);
  });

  rerender(
    <ShelfGrid className="notes-list" layoutKey="child-list-2" packingFrozen>
      <article data-height="100" data-note-id="first" key="first" />
      <article data-height="120" data-note-id="second" key="second" />
    </ShelfGrid>,
  );

  await waitFor(() => {
    expect(container.querySelectorAll("article")).toHaveLength(2);
    expect(Array.from(container.querySelectorAll<HTMLElement>("article")).map((c) => c.style.gridColumnStart)).toEqual(["1", "2"]);
  });
});
```

- [ ] **Step 2: Run shelf-grid tests — expect FAIL on drag-class case**

Run: `npx vitest run tests/shelf-grid.test.tsx`

Expected: FAIL — `getBoundingClientRect` call count grows after classList toggles (today MutationObserver always `scheduleLayout`)

- [ ] **Step 3: Implement MutationObserver filter**

In `ShelfGrid.tsx`:

1. Add helper (same file or top of file):

```ts
const DRAG_LAYOUT_IGNORE_CLASSES = new Set([
  "is-dragging",
  "is-drop-target",
  "is-file-dragging",
]);

function tokenizeClass(value: string): string[] {
  return value.split(/\s+/).filter(Boolean);
}

/** True when a class attribute mutation only adds/removes drag/drop markers. */
export function isDragOnlyClassMutation(record: MutationRecord): boolean {
  if (record.type !== "attributes" || record.attributeName !== "class") return false;
  const target = record.target;
  if (!(target instanceof Element)) return false;
  const before = new Set(tokenizeClass(record.oldValue ?? ""));
  const after = new Set(tokenizeClass(target.getAttribute("class") ?? ""));
  for (const token of before) {
    if (after.has(token)) continue;
    if (!DRAG_LAYOUT_IGNORE_CLASSES.has(token)) return false;
  }
  for (const token of after) {
    if (before.has(token)) continue;
    if (!DRAG_LAYOUT_IGNORE_CLASSES.has(token)) return false;
  }
  return true;
}

function mutationsNeedLayout(records: MutationRecord[], packingFrozen: boolean): boolean {
  if (!packingFrozen) return records.length > 0;
  return records.some((record) => !isDragOnlyClassMutation(record));
}
```

2. Change MutationObserver setup to pass `attributeOldValue: true` and filter:

```ts
const mutationObserver = typeof MutationObserver === "undefined"
  ? null
  : new MutationObserver((records) => {
      if (!mutationsNeedLayout(records, frozenRef.current)) return;
      scheduleLayout(false);
    });
mutationObserver?.observe(grid, {
  attributeFilter: ["aria-expanded", "class"],
  attributeOldValue: true,
  attributes: true,
  characterData: true,
  childList: true,
  subtree: true,
});
```

Keep existing ResizeObserver / window resize / `packingFrozen` effect deps unchanged. Existing frozen composition tests must stay green.

- [ ] **Step 4: Run shelf-grid tests — expect PASS**

Run: `npx vitest run tests/shelf-grid.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add src/components/ShelfGrid.tsx tests/shelf-grid.test.tsx
git commit -m "$(cat <<'EOF'
perf(notes): skip shelf remeasure on drag classes

While packingFrozen, ignore is-dragging / drop-target
class flips that force Safari layout thrash.
EOF
)"
```

---

### Task 4: Full verification

**Files:** none (run only)

- [ ] **Step 1: Run focused suite**

```bash
npx vitest run tests/pager-mount.test.ts tests/pager-lazy-mount.test.tsx tests/tab-stack-ui.test.tsx tests/shelf-grid.test.tsx tests/swipe-pager-settle.test.tsx tests/swipe-navigation.test.ts
```

Expected: PASS

- [ ] **Step 2: Run full unit tests**

```bash
npm test
```

Expected: PASS

- [ ] **Step 3: Manual checklist (human on iPad Safari PWA)**

- Swipe tabs: neighbor peek works; settings not built until near
- Open game → drag notes: smoother than before
- Pop game → catalog remounts

No code commit required unless Step 1–2 reveal fixes (then fix + commit with a focused message).

---

## Spec coverage self-check

| Spec requirement | Task |
|---|---|
| Near ±1 mount | 1, 2 |
| Overlay ⇒ no root | 2 |
| Far empty shell | 2 |
| Desktop + mobile same React policy | 2 |
| Tab-stack data keep-alive | 2 (tab-stack-ui) |
| ShelfGrid drag-class skip while frozen | 3 |
| Still layout childList / unfreeze | 3 |
| Automated + manual verification | 2, 3, 4 |
| No DragOverlay rewrite | omitted (out of scope) |
