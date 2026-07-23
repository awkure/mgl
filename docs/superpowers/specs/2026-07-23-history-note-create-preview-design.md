# History note body preview — design

Date: 2026-07-23

## Goal

On the history timeline, note body create/edit deltas show a short plain-text preview so events are distinguishable without opening the game. Edits also show a simple before/after visual diff.

## Approach

Reuse `HistoryEvent.before` / `after` for note body previews only — no schema version bump.

| Event | `before` | `after` |
|---|---|---|
| note `create` | `null` | preview or `null` |
| note `set` `bodyMarkdown` | preview or `null` | preview or `null` |
| `set` `reviewMarkdown` | `null` | `null` (unchanged) |
| other create/delete / non-markdown sets | unchanged | unchanged |

## Preview rules

Domain helper (e.g. `historyNotePreview(bodyMarkdown: string): string | null`):

1. Light markdown strip to plain text (heading markers, emphasis, link syntax → readable text; no full MD AST).
2. Keep newlines; drop blank lines.
3. Take at most **3** non-empty lines.
4. Hard cap ~**200** characters total; append `…` when truncated.
5. Empty / whitespace-only after strip → `null`.

Same helper for create and edit.

## Diff / publish

- Note create: `after = historyNotePreview(note.bodyMarkdown)`.
- Note `bodyMarkdown` set: `before` / `after` = previews of the field values (stop returning `null` via `historyValue` for this field only; keep `reviewMarkdown` redacted).
- Seed + normal publish pick this up for new events.
- Existing published events with null bodies remain valid; no forced history rebuild.
- Event `id` hashes include before/after, so preview-bearing events ≠ old null events (dedupe by id still fine).

## UI

### Create

- Label: `Заметка · добавлена`
- If `after` non-empty string: show preview under the label (`white-space: pre-line`).

### Edit (`bodyMarkdown`)

- Label: `Заметка · обновлён текст`
- Below: two-column **block** diff (not word-level):
  - Left: old preview — strikethrough + `var(--danger)` tint
  - Right: new preview — `var(--success)` tint
- Null/empty side: show `—` (or equivalent muted placeholder).
- `white-space: pre-line` on both sides.
- Structure: React markup inside the delta `<li>` (not a single plain string for this case). Small BEM under `.history-timeline__delta` (e.g. `__note-diff`, `__note-diff-old`, `__note-diff-new`).

### Shared

- No markdown rendering in history.
- Dense muted chrome; 11px base type as today.

## Tests

- Unit: preview helper — 3-line cut, char cap, empty → null, basic MD strip.
- `historyDiff`: note create stores preview in `after`; note body set stores previews in `before`/`after`; review markdown still null.
- HistoryPage: create label + preview; edit renders two-column struck/red vs green; empty sides use placeholder.

## Out of scope

- Word-/char-level inline diff.
- Preview on note delete, game create, or game review edits.
- Attachment titles in the delta.
- Backfilling previews into already-published history events.
