# Published library history screen — design

Date: 2026-07-22

## Goal

Separate screen **История** (before Настройки in footer / tab bar) showing a durable, committed changelog of the **deployed** library. Events link to game pages. Local pending patch is out of scope for the feed.

## Decisions

| Topic | Choice |
|---|---|
| Source of truth | Committed `public/data/history.json` (not inside `library.json`) |
| When written | Publish / apply-patch path: diff old→new library, append events |
| Local pending | Not shown until published |
| Event grain | Field-level for **games** + **notes** only |
| Feed shape | Flat chronological events; UI clusters consecutive same-`gameId` runs |
| Sort key | `changedAt` from local patch ops (carried through publish); seed uses `createdAt` |
| Seed | One-shot from current `library.json` (create events per game/note) |
| UI | Soft timeline (accent rail + dots); nest field deltas under game node |
| Nesting rule | Consecutive run: adjacent same `gameId` in time-sorted feed |
| Game navigation | Links push onto **catalog** stack (`#/games/:id`) |
| Ranks / assets as primary events | Out of v1 |
| Filters / search | Out of v1 |

## Architecture

```
local patch (changedAt)
        ↓ publish / apply-patch
old library ──diff──► history events ──append──► public/data/history.json
new library ──────────────────────────────write──► public/data/library.json
        ↓ static fetch
HistoryPage (cluster consecutive gameId) → #/games/:id (catalog stack)
```

`library.json` revision / entity schema unchanged. History is a sibling static artifact validated separately.

## Data: `public/data/history.json`

```json
{
  "schemaVersion": 1,
  "events": [
    {
      "id": "stable-id",
      "changedAt": "2026-07-01T12:00:00.000Z",
      "entity": "game",
      "entityId": "…",
      "gameId": "…",
      "field": "status",
      "op": "set",
      "before": "backlog",
      "after": "playing",
      "title": "Hades",
      "coverAssetId": "…"
    }
  ]
}
```

### Rules

- **Append-only** — never rewrite past events.
- **`id`** — stable (e.g. hash of `entity|entityId|field|op|changedAt|before|after`); dedupe on re-run.
- **`changedAt`** — prefer matching patch operation; else entity `updatedAt` / `createdAt` / publish clock (rare fallback).
- **`gameId`** — always set for game and note events (parent game for notes).
- **Denormalized `title` + optional `coverAssetId`** — deleted games stay readable in the feed.
- **Create / delete** — `op: "create" | "delete"` (field may be null); still carry snapshots where useful.
- **Long / markdown fields** — store before/after hashes or omit bodies; UI shows short verbs («обновлён текст»), not full markdown.
- **Ignore** pure rank/asset map churn as primary events (cover field on game still counts as a game field change).

### Seed

One-shot (script or first publish with empty history):

- Every current game → create event at `createdAt` (title/cover snapshot).
- Every current note → create event at `createdAt` with parent `gameId`.

## Publish / append flow

1. Load old library, new library (post-apply), existing `history.json` (or empty).
2. Diff games + notes field-level.
3. Map each create / field change / delete → event with `changedAt` from patch when possible.
4. Append; dedupe by `id`.
5. Write `history.json` alongside `library.json` in the same publish unit.
6. `validate-data` validates history schema (well-formed events); does **not** require every `gameId` to still exist in the library.

## Navigation

| Surface | Behavior |
|---|---|
| Route | `#/history` → `HistoryPage` |
| Tab id | `history` inserted **before** `settings` |
| Mobile tab bar | Тирлист · Каталог · **История** · Настройки |
| Desktop | «История» in primary nav with tiers/catalog; settings icon remains last |
| Pager / blob | Four tabs — update `TAB_ORDER`, progress, swipe indices |
| Game links | Activate catalog stack at `#/games/:id` (same pattern as search/random) |

Copy: title **История**; subtitle **Изменения опубликованной библиотеки.**

## UI

### Layout — soft timeline + nest

- Page heading matches Settings density (tokens only; no marketing chrome).
- Vertical accent rail + node dots.
- **Node:** cover thumb + game title (link) + cluster time (newest `changedAt` in run).
- **Nested lines:** field deltas when consecutive same-`gameId` events collapse into one node.
- Single-event games: one delta line under the node (no heavy chrome).
- Empty: `empty-state` — «Пока нет опубликованных изменений.»
- Deleted game: denormalized title/cover; link disabled or muted «удалена».
- Cover resolve: event snapshot → live library → placeholder.
- Load failure: error strip + retry; rest of app unaffected.
- Virtualization: defer until measured; plain list OK for v1.

### Nesting algorithm (UI-only)

1. Sort events by `changedAt` descending (newest first).
2. Scan into runs: adjacent events with equal `gameId` form one cluster.
3. Render one timeline node per cluster; list field lines newest-first inside.

Storage stays flat; clustering is presentational.

## Components / layers

| Layer | Pieces |
|---|---|
| Domain | History types, validation, `diffLibraryToHistoryEvents`, consecutive-cluster helper |
| Scripts | Append hook in publish/apply-patch; seed script; `validate-data` history checks |
| State / load | Static fetch of `/data/history.json` (page-local or thin context) |
| UI | `HistoryPage`, tab wiring, `.history-timeline*` styles |
| Tests | Diff/seed/validate; cluster helper; route/tab before settings; page nest/link/empty/deleted |

## Out of scope (v1)

- Showing unpublished local patch ops on this screen
- Embedding history inside `library.json`
- Filters, search, per-revision shard files
- Rank / asset primary audit events
- Pushing game links onto the history tab stack

## Testing

- Diff produces create / field / note / delete events; `changedAt` from patch
- Cluster helper: consecutive runs only (interleaved games stay separate nodes)
- Seed from fixture library
- `validate-data` accepts good history; rejects malformed
- Nav: history tab before settings (desktop + mobile); blob/pager 4-way
- `HistoryPage`: nested cluster, game link target, empty state, deleted muted

## Open implementation notes (non-blocking)

- Exact `id` hash recipe and whether note body stores truncated preview vs verb-only
- Icon name for tab (`clock` / new outline) — pick from existing `Icon` set or add one match
