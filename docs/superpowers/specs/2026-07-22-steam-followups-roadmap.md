# Steam integration follow-ups — brainstorm roadmap

Date: 2026-07-22

## Purpose

Decompose remaining Steam work into **independent specs**. Each row below gets its own brainstorm → `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` → plan → implementation cycle. Do not fold these into one mega-PR.

**Done:** subsystem A — reimport, snapshot, field locks  
Spec: `2026-07-22-steam-reimport-locks-design.md`  
Plan: `2026-07-22-steam-reimport-locks.md`

## Global invariants (all follow-ups)

These bind every future Steam spec unless a later brainstorm **explicitly** revises them with user approval:

1. **`placement` (tier + rank) is never written by Steam import / reimport / sync** — including `--force`.
2. **`reviewMarkdown` is never written by Steam import / reimport / sync** — including `--force`.
3. Schema v2 exact key sets; published assets SHA-256; browser patches metadata-only (`blobs: {}`).
4. Steam Web API key stays Node/CI secret by default; any SPA path needs a safe proxy story (see E).

Cancelled as a feature: “`--force` rewrites placement / review” — **not planned**. A’s Out list mentioned it only as excluded behavior, not as backlog.

## Spec queue

Suggested order. Adjust before starting a cycle.

| ID | Spec title (working) | Depends on | Primary README anchors |
|---|---|---|---|
| **B** | Steam achievements | A (platinum skip hook, merge allowlist) | «Достижения» |
| **C** | Per-game Steam media fill | A assets path; optional B independent | «Заполнение одной игры» screenshots/trailers |
| **D** | Steam ops: GHA + 429/pagination (+ optional key UX) | A CLI/snapshot | «Синхронизация» GHA / rate limit |
| **E** | SPA-triggered reimport | D or explicit proxy decision | README: live sync blocked until proxy |

Related but **not** in the Out list from A — schedule only if requested as separate specs:

| ID | Topic | Notes |
|---|---|---|
| **C2** | Editor Steam URL/appid prefill + Steam store link field | Same README section as C; can merge into C or own spec |
| **R** | `GetRecentlyPlayedGames` rotation widget | «Статус и playtime» leftover |
| **A✓** | Checklist cleanup: mark sync «снимок» bullets done (A already shipped) | Docs-only |

---

### Spec B — Steam achievements

**Status:** design drafted — `2026-07-22-steam-achievements-design.md`; plan — `../plans/2026-07-22-steam-achievements.md` (awaiting execution)

**Goal:** Pull achievement progress for catalog games with `steamAppId`; surface progress in UI; auto-`platinum` at 100% when soft.

**In (draft):**

- CLI/API: `GetPlayerAchievements` + `GetSchemaForGame` (or equivalent schema source)
- Game fields for unlocked/total (or progress ratio) + schema revision as needed
- Wire `canWriteAchievementProgress` / platinum lock into merge (already stubbed in A)
- Catalog card progress bar + count; GamePage read-only summary
- Soft prompt: 100% unlock → suggest `platinum` / `completed` (user confirms; no silent tier touch)

**Out (draft):** Friend achievements; rare% scraping; forcing status without confirm.

**Open questions for B brainstorm:** store progress on Game vs sidecar; whether import is batch-only or per-game; UI density on catalog cards.

---

### Spec C — Per-game screenshots / videos (+ C2 prefill)

**Status:** design drafted — `2026-07-22-steam-media-prefill-design.md`; plan — `../plans/2026-07-22-steam-media-prefill.md` (awaiting execution)

**Goal:** For a chosen Steam game, download **profile** screenshots as WebP note images; trailers as store links (+ thumbs); CLI media import + GamePage store link.

---

### Spec D — Ops: GHA Import Steam + rate limits (+ key UX)

**Goal:** Repeatable CI import and hardening of Storefront enrichment.

**In (draft):**

- GitHub Action «Import Steam» with `STEAM_WEB_API_KEY` secret → PR with `library.json` + media + snapshot
- `appdetails` 429 / retry / pagination or backoff (beyond today’s ≥1.5s throttle)
- Optional: settings UX to store Steam-related config for **triggering** the Action (not embedding the key in SPA if avoidable) — design must pick PAT-like pattern vs Actions-only dispatch

**Out (draft):** Client-side Web API calls with a browser-stored Web API key (CORS + key leak) unless E’s proxy lands first.

**Open questions:** workflow_dispatch vs schedule; how media size limits interact with PR; whether Steam key ever enters `localStorage` (README historically said no for SPA).

---

### Spec E — SPA-triggered reimport

**Goal:** Re-run incremental Steam sync from the app UI.

**Constraint:** README currently: *Live sync from SPA — do not, until a safe server-side proxy exists.* E’s brainstorm **must** choose one:

1. **Proxy/Action dispatch only** (SPA button → GitHub workflow_dispatch / tiny proxy; no key in browser), or  
2. **Revise README** and accept a constrained SPA key model (explicit threat model).

**In (draft):** Button in settings; uses A’s merge/snapshot semantics; never touches tier/review.

**Out (draft):** Blind full library wipe; forcing placement/review.

---

## Process per spec

1. Brainstorm (questions → approaches → section approvals)  
2. Write `docs/superpowers/specs/YYYY-MM-DD-<id>-design.md` + self-review  
3. User approves written spec  
4. `writing-plans` → `docs/superpowers/plans/YYYY-MM-DD-<id>.md`  
5. Subagent-driven or inline execution  
6. Check off matching README bullets  

## Immediate next step

After this roadmap is accepted: start **Spec B** brainstorm (achievements) unless you reorder the queue.
