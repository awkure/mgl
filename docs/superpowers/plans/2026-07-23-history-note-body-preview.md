# History note body preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store stripped note-body previews on note create / bodyMarkdown set history events, and render create preview + two-column edit diff in the History tab.

**Architecture:** New domain helper `historyNotePreview` (≤3 lines, ~200 chars, light MD strip). `historyDiff` writes previews into `after` (create) and `before`/`after` (bodyMarkdown set); `reviewMarkdown` stays null. HistoryPage renders React markup for note create/edit deltas; CSS uses `--danger` / `--success`.

**Tech Stack:** TypeScript domain + Vitest, React HistoryPage, CSS tokens in `src/styles.css`. Publish already imports `src/domain/historyDiff.ts` via `scripts/lib/history.mjs`.

**Spec:** `docs/superpowers/specs/2026-07-23-history-note-create-preview-design.md`

## Global Constraints

- No history schema version bump; reuse `before` / `after`
- Preview only for note create + note `bodyMarkdown` set
- `reviewMarkdown` before/after remain `null`
- Max 3 non-empty lines; ~200 char hard cap + `…`
- Edit UI = block two-column (old struck+danger | new success), not word-level
- No backfill of existing `history.json` events
- RU copy; existing tokens; do not commit agent skills
- VCS: `git` — commit each task

## File map

| Path | Role |
|---|---|
| `src/domain/historyNotePreview.ts` | Strip + truncate helper |
| `src/domain/historyDiff.ts` | Persist previews on note create / bodyMarkdown set |
| `src/domain/index.ts` | Re-export helper |
| `src/pages/HistoryPage.tsx` | Create preview + edit note-diff markup |
| `src/styles.css` | `pre-line` + note-diff columns |
| `tests/history-note-preview.test.ts` | Helper unit tests |
| `tests/history-diff.test.ts` | Diff assertions for previews |
| `tests/history-page.test.tsx` | UI create + edit rendering |
| `tests/history-note-preview-css.test.ts` | CSS class presence |

---

### Task 1: `historyNotePreview` helper

**Files:**
- Create: `src/domain/historyNotePreview.ts`
- Create: `tests/history-note-preview.test.ts`
- Modify: `src/domain/index.ts` — re-export

**Interfaces:**
- Produces: `historyNotePreview(bodyMarkdown: string): string | null`
- Constants (export if useful for tests): `HISTORY_NOTE_PREVIEW_MAX_LINES = 3`, `HISTORY_NOTE_PREVIEW_MAX_CHARS = 200`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { historyNotePreview } from "../src/domain/historyNotePreview";

describe("historyNotePreview", () => {
  it("returns null for empty / whitespace", () => {
    expect(historyNotePreview("")).toBeNull();
    expect(historyNotePreview("  \n\t")).toBeNull();
  });

  it("strips light markdown and keeps plain text", () => {
    expect(historyNotePreview("## Hello **world**")).toBe("Hello world");
    expect(historyNotePreview("[link](https://example.com)")).toBe("link");
  });

  it("keeps at most 3 non-empty lines", () => {
    const input = "a\n\nb\nc\nd\ne";
    expect(historyNotePreview(input)).toBe("a\nb\nc");
  });

  it("caps at 200 chars with ellipsis", () => {
    const long = "x".repeat(250);
    const out = historyNotePreview(long)!;
    expect(out.length).toBe(201); // 200 + …
    expect(out.endsWith("…")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (module missing)**

Run: `npx vitest run tests/history-note-preview.test.ts`

- [ ] **Step 3: Implement helper**

```ts
// src/domain/historyNotePreview.ts
export const HISTORY_NOTE_PREVIEW_MAX_LINES = 3;
export const HISTORY_NOTE_PREVIEW_MAX_CHARS = 200;

export function historyNotePreview(bodyMarkdown: string): string | null {
  let text = bodyMarkdown.replace(/\r\n/g, "\n");
  text = text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "");
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, HISTORY_NOTE_PREVIEW_MAX_LINES);
  if (!lines.length) return null;
  let joined = lines.join("\n");
  if (joined.length > HISTORY_NOTE_PREVIEW_MAX_CHARS) {
    joined = `${joined.slice(0, HISTORY_NOTE_PREVIEW_MAX_CHARS)}…`;
  }
  return joined;
}
```

Re-export from `src/domain/index.ts`.

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run tests/history-note-preview.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/domain/historyNotePreview.ts src/domain/index.ts tests/history-note-preview.test.ts
git commit -m "feat(history): add note body preview helper"
```

---

### Task 2: Persist previews in `historyDiff`

**Files:**
- Modify: `src/domain/historyDiff.ts`
- Modify: `tests/history-diff.test.ts`

**Interfaces:**
- Consumes: `historyNotePreview`
- Produces: note create `after: string | null`; note bodyMarkdown set `before`/`after` as preview strings; `reviewMarkdown` still null via `historyValue`

- [ ] **Step 1: Update failing assertions in `history-diff.test.ts`**

Add / change:

```ts
it("emits note create with body preview in after", () => {
  const g1 = baseGame({ id: "g1" });
  const n1 = baseNote({ id: "n1", gameId: "g1", bodyMarkdown: "## Route **A**" });
  const before = emptyLibrary();
  before.games.g1 = g1;
  const after = emptyLibrary();
  after.games.g1 = g1;
  after.notes.n1 = n1;
  const events = diffLibraryToHistoryEvents({ before, after });
  const noteEvent = events.find((e) => e.entity === "note")!;
  expect(noteEvent).toMatchObject({
    op: "create",
    after: "Route A",
    before: null,
  });
});

// Change existing body update test:
expect(events[0]).toMatchObject({
  field: "bodyMarkdown",
  op: "set",
  before: "old",
  after: "new",
});

it("still redacts reviewMarkdown bodies", () => {
  // game reviewMarkdown change → before/after null
});
```

Also update seed test if it asserts `after: null` for notes with body.

- [ ] **Step 2: Run — expect FAIL on after/before**

Run: `npx vitest run tests/history-diff.test.ts`

- [ ] **Step 3: Wire `historyDiff.ts`**

- Import `historyNotePreview`
- On note create (`!beforeEntity && afterEntity` && `entity === "note"`):  
  `after: historyNotePreview((afterEntity as Note).bodyMarkdown)`
- Change `historyValue`:

```ts
function historyValue(field: string, value: unknown): unknown {
  if (field === "reviewMarkdown") return null;
  if (field === "bodyMarkdown") {
    return typeof value === "string" ? historyNotePreview(value) : null;
  }
  return value;
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run tests/history-diff.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/domain/historyDiff.ts tests/history-diff.test.ts
git commit -m "feat(history): store note body previews on create/set"
```

---

### Task 3: HistoryPage create preview + edit block diff

**Files:**
- Modify: `src/pages/HistoryPage.tsx`
- Modify: `src/styles.css` (near `.history-timeline__delta`)
- Modify: `tests/history-page.test.tsx`
- Create: `tests/history-note-preview-css.test.ts`

**Interfaces:**
- Replace plain-string-only delta render with `HistoryDelta` component (keep `formatHistoryDelta` for simple string cases / tests if useful, or migrate callers)
- Produces markup:
  - create: label + optional `.history-timeline__note-preview`
  - bodyMarkdown set: label + `.history-timeline__note-diff` with `__old` / `__new`

- [ ] **Step 1: Failing UI + CSS tests**

```tsx
it("shows note create preview under label", () => {
  render(
    <HistoryPage
      events={[event({
        id: "n-create",
        gameId: "g1",
        entity: "note",
        entityId: "n1",
        field: null,
        op: "create",
        before: null,
        after: "Секретный маршрут",
        title: "Hades",
      })]}
      liveGameIds={new Set(["g1"])}
    />,
  );
  expect(screen.getByText("Заметка · добавлена")).toBeInTheDocument();
  expect(screen.getByText("Секретный маршрут")).toBeInTheDocument();
});

it("renders note body edit as two-column block diff", () => {
  // old struck, new present; classes history-timeline__note-diff-old / -new
});
```

CSS test: assert `.history-timeline__delta { white-space: pre-line }` (or on preview/diff), `.history-timeline__note-diff`, old uses `text-decoration: line-through` + `var(--danger)`, new uses `var(--success)`.

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run tests/history-page.test.tsx tests/history-note-preview-css.test.ts`

- [ ] **Step 3: Implement UI + CSS**

`HistoryPage.tsx` sketch:

```tsx
function notePreviewText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function HistoryDelta({ event }: { event: HistoryEvent }) {
  if (event.op === "create" && event.entity === "note") {
    const preview = notePreviewText(event.after);
    return (
      <>
        <span className="history-timeline__delta-label">Заметка · добавлена</span>
        {preview ? <span className="history-timeline__note-preview">{preview}</span> : null}
      </>
    );
  }
  if (event.op === "set" && event.entity === "note" && event.field === "bodyMarkdown") {
    return (
      <>
        <span className="history-timeline__delta-label">Заметка · обновлён текст</span>
        <span className="history-timeline__note-diff">
          <span className="history-timeline__note-diff-old">{notePreviewText(event.before) ?? "—"}</span>
          <span className="history-timeline__note-diff-new">{notePreviewText(event.after) ?? "—"}</span>
        </span>
      </>
    );
  }
  return <>{formatHistoryDelta(event)}</>;
}
```

CSS:

```css
.history-timeline__delta {
  white-space: pre-line;
  /* existing rules */
}
.history-timeline__note-preview {
  display: block;
  margin-top: 2px;
}
.history-timeline__note-diff {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-top: 2px;
}
.history-timeline__note-diff-old {
  color: var(--danger);
  text-decoration: line-through;
  white-space: pre-line;
}
.history-timeline__note-diff-new {
  color: var(--success);
  white-space: pre-line;
}
```

Keep game review markdown label path as today (`Обзор · обновлён текст` via `formatHistoryDelta`).

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run tests/history-page.test.tsx tests/history-note-preview-css.test.ts tests/history-diff.test.ts tests/history-note-preview.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/pages/HistoryPage.tsx src/styles.css tests/history-page.test.tsx tests/history-note-preview-css.test.ts
git commit -m "feat(history): show note create preview and edit diff"
```

---

### Task 4: Verify

- [ ] **Step 1: Full test + build**

Run: `npm test && npm run build`  
Expected: all green.

- [ ] **Step 2: Finish** — report done; no push unless asked.

---

## Spec coverage

| Spec item | Task |
|---|---|
| Preview helper rules | 1 |
| Note create `after` preview | 2 |
| Note bodyMarkdown set before/after | 2 |
| reviewMarkdown stays null | 2 |
| Create UI preview | 3 |
| Edit two-column danger/success | 3 |
| No backfill / no schema bump | implicit |
