# Tab Bar Press Glass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Block Safari link previews on mobile footer tabs/add, and on press move/scale the sliding blob under the pressed tab with liquid-glass + chromatic fringe and a mild icon/label lens.

**Architecture:** `AppShell` owns press state (`data-tab-press`, `--press-tab`, per-link `data-pressed`) via pointer events on tab links. CSS drives blob translate override + glass/fringe/scale and mild lens. Callout blocked with CSS + `contextmenu` preventDefault (GameCard pattern). Swipe drag clears/ignores press so `--pager-progress` keeps ownership.

**Tech Stack:** React 19, Vitest + Testing Library, existing mobile chrome (`data-mobile-chrome`), CSS custom properties (`--pager-progress` / `--press-tab`).

**Spec:** `docs/superpowers/specs/2026-07-22-tab-bar-press-glass-design.md`

## Global Constraints

- Press only — no hover lens
- Blob follows **pressed** tab index while down; after release follows `--pager-progress`
- Fidelity: surface glass + mild content lens — no SVG displacement
- Add FAB: callout block only, no blob lens
- While `data-pager-dragging="true"`, no press lens (clear press in JS)
- Motion ≤280ms; `prefers-reduced-motion: reduce` disables grow/fringe
- RU chrome unchanged; UI-only — no domain/schema/patch
- Extend existing tab bar — do not fork nav

## File map

| File | Responsibility |
|---|---|
| `src/components/AppShell.tsx` | Press pointer handlers, callout guards, attrs on shell/links/add |
| `src/styles.css` | Callout CSS, press blob glass/scale/fringe, mild lens, reduced-motion |
| `tests/mobile-nav-css.test.ts` | CSS contract for callout + press glass |
| `tests/tab-bar-press-glass.test.tsx` | DOM: press attrs, contextmenu blocked, drag clears press |

---

### Task 1: Block link previews (CSS + handlers)

**Files:**
- Modify: `tests/mobile-nav-css.test.ts`
- Create: `tests/tab-bar-press-glass.test.tsx`
- Modify: `src/styles.css` (tab bar link + add callout rules)
- Modify: `src/components/AppShell.tsx` (`draggable={false}`, `onContextMenu`)

**Interfaces:**
- Produces: callout-safe tab links + add anchor (no press glass yet)

- [ ] **Step 1: Write failing CSS assertions**

Append to `tests/mobile-nav-css.test.ts`:

```ts
  it("disables Safari touch callout on tab bar links and add button", () => {
    const link = declarationsIn(styles, '.app-shell[data-mobile-chrome="true"] .app-tab-bar__link');
    const add = declarationsIn(styles, '.app-shell[data-mobile-chrome="true"] .app-tab-add');
    expect(link).toContain("-webkit-touch-callout: none");
    expect(link).toContain("user-select: none");
    expect(add).toContain("-webkit-touch-callout: none");
    expect(add).toContain("user-select: none");
  });
```

- [ ] **Step 2: Write failing UI test for contextmenu**

Create `tests/tab-bar-press-glass.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../src/components/AppShell";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
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
});

describe("tab bar press glass — callout", () => {
  it("prevents context menu on tab links and add button", () => {
    const { container } = render(
      <AppShell onOpenDiff={vi.fn()} route="tiers" storage={{ bytes: 0, operationCount: 0 }}>
        <div>body</div>
      </AppShell>,
    );
    const tabBar = screen.getByRole("navigation", { name: "Мобильная навигация" });
    const catalog = within(tabBar).getByRole("link", { name: "Каталог" });
    const add = screen.getByRole("link", { name: "Добавить игру" });

    expect(catalog).toHaveAttribute("draggable", "false");
    expect(add).toHaveAttribute("draggable", "false");

    const catalogMenu = fireEvent.contextMenu(catalog);
    const addMenu = fireEvent.contextMenu(add);
    expect(catalogMenu).toBe(false);
    expect(addMenu).toBe(false);
    expect(container.querySelector(".app-shell")).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run tests — expect fail**

Run: `npx vitest run tests/mobile-nav-css.test.ts tests/tab-bar-press-glass.test.tsx`

Expected: CSS test fails (no callout declarations); UI test fails (no `draggable` / contextmenu not cancelled).

- [ ] **Step 4: Implement callout CSS**

In `src/styles.css`, inside the existing `.app-tab-bar__link` and `.app-tab-add` mobile-chrome blocks (or immediately after them), add:

```css
.app-shell[data-mobile-chrome="true"] .app-tab-bar__link,
.app-shell[data-mobile-chrome="true"] .app-tab-add {
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}
```

If `user-select` is already on those selectors via a shared rule, fold into the existing declaration blocks instead of duplicating selectors — keep one clear rule set.

- [ ] **Step 5: Implement callout handlers in AppShell**

In `NavLink`, add:

```tsx
const blockSafariCallout = (event: MouseEvent<HTMLAnchorElement>) => {
  event.preventDefault();
};
```

On the `<a>`:

```tsx
draggable={false}
onContextMenu={blockSafariCallout}
```

On the add `<a>` (`app-tab-add`), same `draggable={false}` and `onContextMenu` that calls `preventDefault`.

Import type stays `MouseEvent` from React (already imported).

- [ ] **Step 6: Run tests — expect pass**

Run: `npx vitest run tests/mobile-nav-css.test.ts tests/tab-bar-press-glass.test.tsx`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add tests/mobile-nav-css.test.ts tests/tab-bar-press-glass.test.tsx src/styles.css src/components/AppShell.tsx
git commit -m "$(cat <<'EOF'
fix(ui): block Safari callout on tab bar links

EOF
)"
```

---

### Task 2: Press-glass CSS contract

**Files:**
- Modify: `tests/mobile-nav-css.test.ts`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: shell attrs `data-tab-press="true"`, `--press-tab` (number 0|1|2), link `data-pressed="true"`
- Produces: CSS that styles blob + pressed link when those attrs are present (JS wiring in Task 3)

- [ ] **Step 1: Write failing CSS tests**

Append to `tests/mobile-nav-css.test.ts`:

```ts
  it("defines press-glass blob override driven by data-tab-press and --press-tab", () => {
    expect(styles).toContain('@property --press-tab');
    const pressBlob = declarationsIn(
      styles,
      '.app-shell[data-mobile-chrome="true"][data-tab-press="true"] .app-tab-bar__blob',
    );
    expect(pressBlob).toContain("translateX(calc(var(--press-tab, 0) * (100% + 2px)))");
    expect(pressBlob).toMatch(/scale\(/);
    expect(pressBlob).toContain("backdrop-filter:");
    expect(pressBlob).toMatch(/box-shadow:/);
  });

  it("defines mild lens on pressed tab link", () => {
    const pressed = declarationsIn(
      styles,
      '.app-shell[data-mobile-chrome="true"][data-tab-press="true"] .app-tab-bar__link[data-pressed="true"]',
    );
    expect(pressed).toMatch(/scale\(/);
    expect(pressed).toContain("filter:");
  });

  it("disables press-glass flourish under reduced motion", () => {
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?\[data-tab-press="true"\][\s\S]*?\.app-tab-bar__blob/,
    );
  });

  it("keeps pager-dragging blob free of press transform ownership", () => {
    const dragging = declarationsIn(
      styles,
      '.app-shell[data-mobile-chrome="true"][data-pager-dragging="true"] .app-tab-bar__blob',
    );
    expect(dragging).toContain("transition: none");
    // Press styles must not win while dragging — either higher-specificity
    // dragging rule resets transform to pager-progress, or JS clears data-tab-press.
    expect(styles).toContain(
      '.app-shell[data-mobile-chrome="true"][data-pager-dragging="true"] .app-tab-bar__blob',
    );
  });
```

- [ ] **Step 2: Run CSS test — expect fail**

Run: `npx vitest run tests/mobile-nav-css.test.ts`

Expected: FAIL on new press-glass assertions.

- [ ] **Step 3: Implement CSS**

Near top of `src/styles.css` (beside `--pager-progress`):

```css
@property --press-tab {
  syntax: "<number>";
  inherits: true;
  initial-value: 0;
}
```

After the idle `.app-tab-bar__blob` rules, add:

```css
.app-shell[data-mobile-chrome="true"][data-tab-press="true"] .app-tab-bar__blob {
  top: 0;
  bottom: 0;
  background: color-mix(in srgb, var(--glass-fill) 55%, var(--accent-wash));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, .35),
    inset 0 -1px 0 rgba(255, 255, 255, .12),
    0 0 0 1px rgba(255, 80, 80, .35),
    0 0 0 2px rgba(80, 255, 220, .25),
    0 0 0 3px rgba(120, 160, 255, .18);
  -webkit-backdrop-filter: blur(18px) saturate(1.6);
  backdrop-filter: blur(18px) saturate(1.6);
  transform: translateX(calc(var(--press-tab, 0) * (100% + 2px))) scale(1.1);
  transition:
    transform 220ms cubic-bezier(.22, 1, .36, 1),
    box-shadow 220ms ease-out,
    background 220ms ease-out;
}

.app-shell[data-mobile-chrome="true"][data-tab-press="true"] .app-tab-bar__blob::before,
.app-shell[data-mobile-chrome="true"][data-tab-press="true"] .app-tab-bar__blob::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
}

.app-shell[data-mobile-chrome="true"][data-tab-press="true"] .app-tab-bar__blob::before {
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .55);
  mix-blend-mode: screen;
  opacity: .55;
}

.app-shell[data-mobile-chrome="true"][data-tab-press="true"] .app-tab-bar__blob::after {
  box-shadow:
    inset 1px 0 0 rgba(255, 64, 96, .45),
    inset -1px 0 0 rgba(64, 220, 255, .4);
  opacity: .7;
}

.app-shell[data-mobile-chrome="true"][data-tab-press="true"] .app-tab-bar__link[data-pressed="true"] {
  color: var(--text);
  transform: scale(1.06);
  filter: blur(0.4px);
  transition: transform 180ms ease-out, filter 180ms ease-out;
}

.app-shell[data-mobile-chrome="true"][data-pager-dragging="true"] .app-tab-bar__blob {
  transform: translateX(calc(var(--pager-progress, 0) * (100% + 2px)));
}

@media (prefers-reduced-motion: reduce) {
  .app-shell[data-mobile-chrome="true"][data-tab-press="true"] .app-tab-bar__blob {
    transform: translateX(calc(var(--press-tab, 0) * (100% + 2px)));
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, .18);
    transition: none;
  }

  .app-shell[data-mobile-chrome="true"][data-tab-press="true"] .app-tab-bar__blob::before,
  .app-shell[data-mobile-chrome="true"][data-tab-press="true"] .app-tab-bar__blob::after {
    content: none;
  }

  .app-shell[data-mobile-chrome="true"][data-tab-press="true"] .app-tab-bar__link[data-pressed="true"] {
    transform: none;
    filter: none;
    transition: none;
  }
}
```

Notes:
- Reuse tokens (`--glass-fill`, `--accent-wash`, `--text`) — no new one-off palette without light/dark pairs.
- Existing `[data-pager-dragging="true"]` rule already sets `transition: none`; extend that block with the pager `transform` reset above (merge, don’t duplicate the whole selector thrice).
- Tune fringe colors if washed out on light theme — still use alpha overlays on neutrals, not new brand hex.

- [ ] **Step 4: Run CSS tests — expect pass**

Run: `npx vitest run tests/mobile-nav-css.test.ts`

Expected: PASS (adjust assertions if selector formatting differs; keep intent).

- [ ] **Step 5: Commit**

```bash
git add tests/mobile-nav-css.test.ts src/styles.css
git commit -m "$(cat <<'EOF'
feat(ui): add tab bar press-glass CSS

EOF
)"
```

---

### Task 3: Wire press state in AppShell

**Files:**
- Modify: `tests/tab-bar-press-glass.test.tsx`
- Modify: `src/components/AppShell.tsx`

**Interfaces:**
- Consumes: CSS from Task 2
- Produces:
  - Shell: `data-tab-press="true"` while pressed; style `--press-tab: 0|1|2`
  - Pressed link: `data-pressed="true"`
  - Clear on `pointerup` / `pointercancel` / `pointerleave` (from the pressed target) / when shell gains `data-pager-dragging`

Tab index map (must match `tabProgressFromTabId`):

| tab | index |
|---|---|
| `tiers` | 0 |
| `catalog` | 1 |
| `settings` | 2 |

- [ ] **Step 1: Write failing UI tests for press attrs**

Append to `tests/tab-bar-press-glass.test.tsx`:

```tsx
describe("tab bar press glass — press state", () => {
  it("sets data-tab-press and --press-tab while a tab is pressed, then clears on pointerup", () => {
    const { container } = render(
      <AppShell onOpenDiff={vi.fn()} route="tiers" storage={{ bytes: 0, operationCount: 0 }}>
        <div>body</div>
      </AppShell>,
    );
    const shell = container.querySelector(".app-shell") as HTMLElement;
    const tabBar = screen.getByRole("navigation", { name: "Мобильная навигация" });
    const catalog = within(tabBar).getByRole("link", { name: "Каталог" });

    fireEvent.pointerDown(catalog, { pointerId: 1, button: 0 });
    expect(shell).toHaveAttribute("data-tab-press", "true");
    expect(shell.style.getPropertyValue("--press-tab").trim()).toBe("1");
    expect(catalog).toHaveAttribute("data-pressed", "true");

    fireEvent.pointerUp(catalog, { pointerId: 1, button: 0 });
    expect(shell).not.toHaveAttribute("data-tab-press");
    expect(catalog).not.toHaveAttribute("data-pressed");
  });

  it("ignores press lens while pager is dragging", () => {
    const { container } = render(
      <AppShell onOpenDiff={vi.fn()} route="tiers" storage={{ bytes: 0, operationCount: 0 }}>
        <div>body</div>
      </AppShell>,
    );
    const shell = container.querySelector(".app-shell") as HTMLElement;
    const tabBar = screen.getByRole("navigation", { name: "Мобильная навигация" });
    const catalog = within(tabBar).getByRole("link", { name: "Каталог" });

    shell.setAttribute("data-pager-dragging", "true");
    fireEvent.pointerDown(catalog, { pointerId: 1, button: 0 });
    expect(shell).not.toHaveAttribute("data-tab-press");
    expect(catalog).not.toHaveAttribute("data-pressed");
  });

  it("clears press when pager-dragging becomes true mid-press", () => {
    const { container } = render(
      <AppShell onOpenDiff={vi.fn()} route="tiers" storage={{ bytes: 0, operationCount: 0 }}>
        <div>body</div>
      </AppShell>,
    );
    const shell = container.querySelector(".app-shell") as HTMLElement;
    const tabBar = screen.getByRole("navigation", { name: "Мобильная навигация" });
    const settings = within(tabBar).getByRole("link", { name: "Настройки" });

    fireEvent.pointerDown(settings, { pointerId: 1, button: 0 });
    expect(shell).toHaveAttribute("data-tab-press", "true");
    expect(shell.style.getPropertyValue("--press-tab").trim()).toBe("2");

    // Simulate App.tsx swipe drag attribute; shell must observe and clear.
    shell.setAttribute("data-pager-dragging", "true");
    // Force a microtask/observer tick if MutationObserver used:
    // await waitFor(() => expect(shell).not.toHaveAttribute("data-tab-press"));
  });
});
```

For the mid-press drag clear: prefer a `MutationObserver` on the shell for `data-pager-dragging`, **or** clearer alternative — clear press inside `pointercancel` only and rely on CSS dragging transform reset from Task 2. Spec allows either. Prefer:

1. On `pointerdown`, if `shell.getAttribute("data-pager-dragging") === "true"` → no-op.
2. `useEffect` + `MutationObserver` on shell watching `data-pager-dragging` → `clearPress()`.

If observer feels heavy, drop the third test and document that CSS dragging transform reset + pointercancel is enough — but implement observer if the third test stays.

- [ ] **Step 2: Run UI tests — expect fail**

Run: `npx vitest run tests/tab-bar-press-glass.test.tsx`

Expected: FAIL — attrs not set.

- [ ] **Step 3: Implement press state in AppShell**

Use `useState` for pressed tab id (`TabId | null`). Derive attrs:

```tsx
import { forwardRef, useEffect, useState, type ReactNode, type MouseEvent, type PointerEvent } from "react";

// inside AppShell:
const [pressedTab, setPressedTab] = useState<TabId | null>(null);

const clearTabPress = () => setPressedTab(null);

const beginTabPress = (tab: TabId, event: PointerEvent<HTMLAnchorElement>) => {
  if (event.button !== 0) return;
  const shell = (event.currentTarget.closest(".app-shell") as HTMLElement | null);
  if (shell?.getAttribute("data-pager-dragging") === "true") return;
  setPressedTab(tab);
};

useEffect(() => {
  if (!pressedTab) return;
  const shell = /* need shell element — use ref callback or merge with forwardRef */;
  // Prefer: attach observer via the forwarded ref + local callback ref
}, [pressedTab]);
```

**Ref pattern** (keep `forwardRef` working for App.tsx pager progress):

```tsx
const localRef = useRef<HTMLDivElement | null>(null);
const setRefs = (node: HTMLDivElement | null) => {
  localRef.current = node;
  if (typeof ref === "function") ref(node);
  else if (ref) ref.current = node;
};

useEffect(() => {
  const shell = localRef.current;
  if (!shell || !pressedTab) return;
  const sync = () => {
    if (shell.getAttribute("data-pager-dragging") === "true") clearTabPress();
  };
  const observer = new MutationObserver(sync);
  observer.observe(shell, { attributes: true, attributeFilter: ["data-pager-dragging"] });
  sync();
  return () => observer.disconnect();
}, [pressedTab]);
```

On shell `<div>`:

```tsx
data-tab-press={pressedTab ? "true" : undefined}
style={pressedTab ? { ["--press-tab" as string]: String(tabProgressFromTabId(pressedTab)) } : undefined}
ref={setRefs}
```

Extend `NavLink` props:

```tsx
pressEnabled?: boolean;
pressed?: boolean;
onPressStart?: (tab: TabId, event: PointerEvent<HTMLAnchorElement>) => void;
onPressEnd?: () => void;
```

Wire only on mobile tab-bar `NavLink`s:

```tsx
pressEnabled
pressed={pressedTab === "catalog"}
onPressStart={beginTabPress}
onPressEnd={clearTabPress}
data-pressed={pressedTab === "catalog" ? "true" : undefined}
```

Inside `NavLink` when `pressEnabled`:

```tsx
onPointerDown={(e) => onPressStart?.(tab, e)}
onPointerUp={() => onPressEnd?.()}
onPointerCancel={() => onPressEnd?.()}
onPointerLeave={(e) => {
  // Only clear if this pointer left while pressed (primary button / captured)
  if (e.buttons === 0) onPressEnd?.();
}}
```

Pass `data-pressed={pressed ? "true" : undefined}` onto the `<a>`.

Desktop header `NavLink`s: do **not** pass `pressEnabled` (no press glass on desktop nav).

- [ ] **Step 4: Run UI + CSS tests — expect pass**

Run: `npx vitest run tests/tab-bar-press-glass.test.tsx tests/mobile-nav-css.test.ts`

Expected: PASS

- [ ] **Step 5: Smoke related shell tests**

Run: `npx vitest run tests/ui-acceptance.test.tsx tests/tab-stack-ui.test.tsx tests/app-shell-filter-chrome.test.tsx`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/AppShell.tsx tests/tab-bar-press-glass.test.tsx
git commit -m "$(cat <<'EOF'
feat(ui): press lens on mobile tab bar blob

EOF
)"
```

---

### Task 4: Verify + polish

**Files:**
- Possibly tweak: `src/styles.css` (fringe strength / scale after visual check)
- No schema files

- [ ] **Step 1: Full test run**

Run: `npm test`

Expected: all green.

- [ ] **Step 2: Manual checklist** (if browser available)

1. Mobile chrome: long-press Каталог / Тирлист / Настройки — no Safari link preview
2. Press tab — blob slides under finger, grows, glass + RGB fringe, mild icon blur/scale
3. Release / navigate — blob settles to active tab via pager progress
4. Swipe between tabs — blob tracks finger; no stuck `data-tab-press`
5. Add (+) long-press — no preview; no blob steal
6. `prefers-reduced-motion` — no scale/fringe flourish

- [ ] **Step 3: Commit only if polish CSS changed**

```bash
git add src/styles.css
git commit -m "$(cat <<'EOF'
style(ui): tune tab press glass fringe

EOF
)"
```

---

## Spec coverage check

| Spec requirement | Task |
|---|---|
| Block link previews on tabs + add | Task 1 |
| Press moves blob under pressed tab | Tasks 2–3 |
| Scale + liquid glass + chromatic fringe | Task 2 |
| Mild lens on pressed icon/label | Task 2 |
| Press only (no hover) | Task 3 (pointer only) |
| Add = callout only | Task 1 |
| Drag owns blob / clear press | Tasks 2–3 |
| Reduced motion | Task 2 |
| CSS + shell press state approach | Tasks 2–3 |
| Tests mobile-nav-css + UI | Tasks 1–3 |

## Placeholder / consistency scan

- Attr names locked: `data-tab-press`, `--press-tab`, `data-pressed`
- Index source: `tabProgressFromTabId` only
- No SVG / no domain changes
