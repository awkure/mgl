# History note-create preview — design

Date: 2026-07-23

## Goal

On the history timeline, the note create delta («Заметка · добавлена») also shows a short plain-text preview of the note body so adjacent create events are distinguishable without opening the game.

## Approach

Reuse `HistoryEvent.after` on note `create` only: store a stripped preview string (or `null` when empty). No schema version bump. Game create, note/game delete, and markdown `set` events keep omitting bodies (`after`/`before` null for markdown fields).

## Preview rules

Domain helper (e.g. `historyNotePreview(bodyMarkdown: string): string | null`):

1. Light markdown strip to plain text (headings markers, emphasis, link syntax → readable text; no full MD AST).
2. Keep newlines; drop blank lines.
3. Take at most **3** non-empty lines.
4. Hard cap ~**200** characters total; append `…` when truncated.
5. Empty / whitespace-only after strip → `null`.

## Diff / publish

In `diffLibraryToHistoryEvents` / note create path: set `after` to `historyNotePreview(note.bodyMarkdown)` instead of always `null`.

- Seed and normal publish both pick this up for new events.
- Existing published events with `after: null` remain valid; no forced history rebuild.
- Event `id` hashes include `after`, so recreate-with-preview ≠ old null create (dedupe by id still fine).

## UI

- `formatHistoryDelta`: note create → `Заметка · добавлена`; if `after` is a non-empty string, append `\n` + that preview.
- Delta stays a single `<li>`; enable `white-space: pre-line` on `.history-timeline__delta` (or a modifier) so newlines render.
- No markdown rendering in history; muted 11px copy unchanged otherwise.

## Tests

- Unit: preview helper — 3-line cut, char cap, empty → null, basic MD strip.
- `historyDiff`: note create stores preview in `after`.
- `formatHistoryDelta` / HistoryPage: label + preview; empty body → label only.

## Out of scope

- Preview on note edit, note delete, or game create.
- Full markdown render or attachment titles in the delta.
- Backfilling previews into already-published history events.
