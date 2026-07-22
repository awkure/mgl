# Steam Import Continue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist Steam import details/achievements API results to `steam-import-progress.json` so `--continue` skips already-fetched appids; without the flag, overwrite the progress file.

**Architecture:** Small Node helper module owns progress file load/validate/create/upsert/atomic-write/remove. `import-steam.mjs` parses `--continue`, seeds or loads progress before fetch phases, skips storefront/achievement calls when an appid key exists, flushes after each fetch, deletes the file after successful `--apply`. Covers stay uncached.

**Tech Stack:** Node ESM (`.mjs`), Vitest, existing `import-steam.mjs` / `steamApi.mjs`, no new deps.

**Spec:** `docs/superpowers/specs/2026-07-22-steam-import-continue-design.md`

## Global Constraints

- Cache **details + achievements only** — never cover blobs
- Path: repo-root `steam-import-progress.json`; **gitignore** it
- Incremental flush after each details / achievements appid write
- No `--continue` → overwrite empty progress at start of fetch work
- `--continue` → require valid file; abort on missing / bad version / profileKey / flags mismatch
- Failed fetch → `{ ok: false }`; resume does **not** retry that appid
- `--dry-run` → no progress read/write
- Successful `--apply` → delete progress; `--out` only → keep progress
- Snapshot skip logic unchanged
- Node-strip-safe helpers (plain `.mjs`, no TS parameter properties)
- Do not commit `.cursor/` skills or the progress JSON itself

## File map

| Path | Responsibility |
|---|---|
| `scripts/lib/steamImportProgress.mjs` | createEmpty, validate, loadForContinue, writeAtomic, upsertDetail, upsertAchievement, removeProgress |
| `scripts/import-steam.mjs` | `--continue` flag; wire skip/flush/delete |
| `.gitignore` | `steam-import-progress.json` |
| `README.md` | document `--continue` |
| `tests/steam-import-progress.test.ts` | unit tests for progress module |

Default progress path: `path.join(repoRoot, "steam-import-progress.json")`. Tests pass an explicit temp path.

---

### Task 1: Progress module + gitignore

**Files:**
- Create: `scripts/lib/steamImportProgress.mjs`
- Create: `tests/steam-import-progress.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Produces:
```js
export const PROGRESS_VERSION = 1;
export const DEFAULT_PROGRESS_FILENAME = "steam-import-progress.json";

/** @typedef {{
 *   noCovers: boolean;
 *   noAchievements: boolean;
 *   skipDetails: boolean;
 *   force: boolean;
 *   playedOnly: boolean;
 * }} SteamImportProgressFlags */

/** @typedef {{
 *   version: 1;
 *   profileKey: string;
 *   startedAt: string;
 *   updatedAt: string;
 *   flags: SteamImportProgressFlags;
 *   details: Record<string, { ok: true; value: unknown; name?: string } | { ok: false; error?: string }>;
 *   achievements: Record<string, { ok: true; unlocked: number | null; total: number | null } | { ok: false; error?: string }>;
 * }} SteamImportProgressV1 */

export function createEmptyProgress(profileKey, flags, nowIso);
export function validateProgress(raw); // → { ok: true, value } | { ok: false, reason: string }
export function assertProgressCompatible(progress, profileKey, flags); // throws Error
export function loadProgressFile(filePath); // → raw JSON or null if missing
export function loadForContinue(filePath, profileKey, flags); // throws if missing/invalid/mismatch
export function writeAtomic(filePath, progress);
export function upsertDetail(progress, appid, entry, nowIso); // mutates + returns progress
export function upsertAchievement(progress, appid, entry, nowIso);
export function removeProgress(filePath); // no-op if missing
```

- [ ] **Step 1: Write failing tests**

In `tests/steam-import-progress.test.ts`:

```ts
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertProgressCompatible,
  createEmptyProgress,
  loadForContinue,
  removeProgress,
  upsertAchievement,
  upsertDetail,
  validateProgress,
  writeAtomic,
} from "../scripts/lib/steamImportProgress.mjs";

const FLAGS = {
  noCovers: true,
  noAchievements: false,
  skipDetails: false,
  force: false,
  playedOnly: false,
};

describe("steamImportProgress", () => {
  const dirs: string[] = [];
  afterEach(() => {
    // leave temps; OS cleans — or rmSync if preferred
  });

  it("createEmptyProgress has v1 empty maps", () => {
    const p = createEmptyProgress("7656119", FLAGS, "2026-07-22T12:00:00.000Z");
    expect(p).toMatchObject({
      version: 1,
      profileKey: "7656119",
      flags: FLAGS,
      details: {},
      achievements: {},
    });
  });

  it("validateProgress rejects bad version", () => {
    expect(validateProgress({ version: 2, profileKey: "x", flags: FLAGS, details: {}, achievements: {} }).ok).toBe(false);
  });

  it("assertProgressCompatible rejects flag mismatch", () => {
    const p = createEmptyProgress("7656119", FLAGS, "2026-07-22T12:00:00.000Z");
    expect(() =>
      assertProgressCompatible(p, "7656119", { ...FLAGS, force: true }),
    ).toThrow(/flags/i);
  });

  it("loadForContinue requires existing file", () => {
    const dir = mkdtempSync(join(tmpdir(), "steam-progress-"));
    dirs.push(dir);
    expect(() => loadForContinue(join(dir, "missing.json"), "7656119", FLAGS)).toThrow(/--continue|missing/i);
  });

  it("upsert + writeAtomic round-trip", () => {
    const dir = mkdtempSync(join(tmpdir(), "steam-progress-"));
    const file = join(dir, "steam-import-progress.json");
    let p = createEmptyProgress("7656119", FLAGS, "2026-07-22T12:00:00.000Z");
    p = upsertDetail(p, 220, { ok: true, value: { name: "HL2" }, name: "Half-Life 2" }, "2026-07-22T12:01:00.000Z");
    p = upsertAchievement(p, 220, { ok: true, unlocked: 1, total: 10 }, "2026-07-22T12:02:00.000Z");
    writeAtomic(file, p);
    const loaded = loadForContinue(file, "7656119", FLAGS);
    expect(loaded.details["220"]).toEqual({
      ok: true,
      value: { name: "HL2" },
      name: "Half-Life 2",
    });
    expect(loaded.achievements["220"]).toEqual({ ok: true, unlocked: 1, total: 10 });
    removeProgress(file);
    expect(existsSync(file)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL (module missing)**

```bash
npx vitest run tests/steam-import-progress.test.ts
```

Expected: FAIL cannot find module / export

- [ ] **Step 3: Implement `scripts/lib/steamImportProgress.mjs`**

```js
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";

export const PROGRESS_VERSION = 1;
export const DEFAULT_PROGRESS_FILENAME = "steam-import-progress.json";

const FLAG_KEYS = ["noCovers", "noAchievements", "skipDetails", "force", "playedOnly"];

export function createEmptyProgress(profileKey, flags, nowIso) {
  return {
    version: PROGRESS_VERSION,
    profileKey: String(profileKey),
    startedAt: nowIso,
    updatedAt: nowIso,
    flags: { ...flags },
    details: {},
    achievements: {},
  };
}

export function validateProgress(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "progress root must be an object" };
  }
  if (raw.version !== PROGRESS_VERSION) {
    return { ok: false, reason: `unsupported progress version ${JSON.stringify(raw.version)}` };
  }
  if (typeof raw.profileKey !== "string" || !raw.profileKey) {
    return { ok: false, reason: "progress.profileKey missing" };
  }
  if (typeof raw.startedAt !== "string" || typeof raw.updatedAt !== "string") {
    return { ok: false, reason: "progress timestamps missing" };
  }
  if (!raw.flags || typeof raw.flags !== "object") {
    return { ok: false, reason: "progress.flags missing" };
  }
  for (const key of FLAG_KEYS) {
    if (typeof raw.flags[key] !== "boolean") {
      return { ok: false, reason: `progress.flags.${key} must be boolean` };
    }
  }
  if (!isPlainMap(raw.details) || !isPlainMap(raw.achievements)) {
    return { ok: false, reason: "progress details/achievements must be object maps" };
  }
  return { ok: true, value: raw };
}

function isPlainMap(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function assertProgressCompatible(progress, profileKey, flags) {
  if (progress.profileKey !== profileKey) {
    throw new Error(
      `Progress profileKey ${progress.profileKey} !== ${profileKey}. Drop --continue or delete steam-import-progress.json.`,
    );
  }
  for (const key of FLAG_KEYS) {
    if (progress.flags[key] !== flags[key]) {
      throw new Error(
        `Progress flags.${key}=${progress.flags[key]} !== ${flags[key]}. Drop --continue or delete steam-import-progress.json.`,
      );
    }
  }
}

export function loadProgressFile(filePath) {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function loadForContinue(filePath, profileKey, flags) {
  if (!existsSync(filePath)) {
    throw new Error(
      `Missing ${filePath} for --continue. Omit --continue to start a fresh progress file.`,
    );
  }
  const raw = loadProgressFile(filePath);
  const validated = validateProgress(raw);
  if (!validated.ok) throw new Error(`Invalid progress file: ${validated.reason}`);
  assertProgressCompatible(validated.value, profileKey, flags);
  return validated.value;
}

export function writeAtomic(filePath, progress) {
  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(progress, null, 2)}\n`, "utf8");
  renameSync(tmp, filePath);
}

export function upsertDetail(progress, appid, entry, nowIso) {
  progress.details[String(appid)] = entry;
  progress.updatedAt = nowIso;
  return progress;
}

export function upsertAchievement(progress, appid, entry, nowIso) {
  progress.achievements[String(appid)] = entry;
  progress.updatedAt = nowIso;
  return progress;
}

export function removeProgress(filePath) {
  if (existsSync(filePath)) unlinkSync(filePath);
}
```

- [ ] **Step 4: Add gitignore line**

Append under existing Steam import artifacts:

```
steam-import-progress.json
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
npx vitest run tests/steam-import-progress.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/steamImportProgress.mjs tests/steam-import-progress.test.ts .gitignore
git commit -m "$(cat <<'EOF'
feat(steam): add import progress file helpers

EOF
)"
```

---

### Task 2: Wire `--continue` into details + achievements fetch

**Files:**
- Modify: `scripts/import-steam.mjs`
- Modify: `README.md` (Steam import flags paragraph)
- Test: extend `tests/steam-import-progress.test.ts` if needed; manual smoke via `--help`

**Interfaces:**
- Consumes: Task 1 exports; `PROGRESS_PATH = path.join(root, DEFAULT_PROGRESS_FILENAME)`
- Produces: CLI flag `continue: boolean`; progress flush during fetch loops

- [ ] **Step 1: Parse `--continue`**

In `parseArgs` defaults add `continue: false`. On `arg === "--continue"` set `flags.continue = true`. Document in `usage()`:

```
  --continue                  resume from steam-import-progress.json (skip cached appids)
```

Reject `--continue` with `--dry-run`:

```js
if (flags.continue && flags.dryRun) throw new Error("Do not combine --continue with --dry-run");
```

- [ ] **Step 2: After steamid resolve, build progressFlags + load/create**

```js
const progressPath = path.join(root, DEFAULT_PROGRESS_FILENAME);
const progressFlags = {
  noCovers: flags.noCovers,
  noAchievements: flags.noAchievements,
  skipDetails: flags.skipDetails,
  force: flags.force,
  playedOnly: flags.playedOnly,
};

let progress = null;
const progressEnabled = !flags.dryRun && (!flags.skipDetails || !flags.noAchievements);
// actually: enable whenever we might write details or achievements
const willFetchDetails = !flags.skipDetails && !flags.dryRun;
const willFetchAchievements = !flags.noAchievements && !flags.dryRun;
const progressEnabled = willFetchDetails || willFetchAchievements;

if (progressEnabled) {
  if (flags.continue) {
    progress = loadForContinue(progressPath, steamid, progressFlags);
    console.log(`continue: loaded ${progressPath} (details ${Object.keys(progress.details).length}, achievements ${Object.keys(progress.achievements).length})`);
  } else {
    progress = createEmptyProgress(steamid, progressFlags, now);
    writeAtomic(progressPath, progress);
    console.log(`progress: wrote fresh ${progressPath}`);
  }
}
```

Define `now` early (same ISO used for patch) before this block.

Helper:

```js
function flushProgress() {
  if (progress) writeAtomic(progressPath, progress);
}
```

- [ ] **Step 3: Details loop — skip cache hits**

Inside `fetchDetailsFor`, before network:

```js
const cached = progress?.details?.[String(candidate.appid)];
if (cached) {
  if (cached.ok) {
    candidate.details = cached.value;
    if (cached.name) candidate.name = cached.name;
    else if (cached.value?.name) candidate.name = cached.value.name;
  } else {
    candidate.details = null;
  }
  return;
}
```

After successful/failed fetch, upsert + flush:

```js
try {
  const details = await withRetry(() => getAppDetails(...));
  candidate.details = details;
  if (details?.name) candidate.name = details.name;
  if (progress) {
    upsertDetail(progress, candidate.appid, {
      ok: true,
      value: details,
      ...(details?.name ? { name: details.name } : {}),
    }, new Date().toISOString());
    flushProgress();
  }
} catch (reason) {
  candidate.details = null;
  if (progress) {
    upsertDetail(progress, candidate.appid, {
      ok: false,
      error: reason instanceof Error ? reason.message : String(reason),
    }, new Date().toISOString());
    flushProgress();
  }
  console.warn(...);
}
```

- [ ] **Step 4: Achievements loop — skip cache hits**

At start of each achievement target iteration:

```js
const key = String(candidate.appid);
const cached = progress?.achievements?.[key];
if (cached) {
  if (cached.ok) {
    achievementByAppid.set(candidate.appid, {
      unlocked: cached.unlocked,
      total: cached.total,
    });
    if (cached.unlocked != null && cached.total != null) achievementsUpdated += 1;
  } else {
    achievementByAppid.set(candidate.appid, {
      unlocked: existing?.achievementsUnlocked ?? null,
      total: existing?.achievementsTotal ?? null,
    });
    achievementsFailed += 1; // or skipped — prefer not inflating failed; use achievementsSkipped += 1
  }
  continue;
}
```

Prefer `achievementsSkipped += 1` for cached `ok: false` and for cache hits that restore nulls; for cached successful counts use `achievementsUpdated += 1` only if both numbers non-null (match existing success path).

After live fetch success/fail, upsertAchievement + flushProgress (mirror details).

On soft unavailable (`parsed` null / player unavailable), still record:

```js
{ ok: true, unlocked: null, total: null }
```

so resume does not re-hit Steam for “no stats” games. On thrown errors:

```js
{ ok: false, error: message }
```

- [ ] **Step 5: Delete progress after successful `--apply`**

After snapshot write succeeds inside `if (flags.apply) { ... }`:

```js
removeProgress(progressPath);
console.log(`removed ${progressPath}`);
```

Only after library + media + snapshot writes succeed (end of apply block).

- [ ] **Step 6: README**

In the `import:steam` flags sentence, add `--continue` (resume from `steam-import-progress.json`; omit to overwrite; deleted after successful `--apply`).

- [ ] **Step 7: Verify**

```bash
npx vitest run tests/steam-import-progress.test.ts tests/steam-import.test.ts tests/steam-reimport.test.ts
npm run import:steam -- --help
```

Expected: tests PASS; usage lists `--continue`.

- [ ] **Step 8: Commit**

```bash
git add scripts/import-steam.mjs README.md tests/steam-import-progress.test.ts
git commit -m "$(cat <<'EOF'
feat(steam): resume import via --continue progress file

EOF
)"
```

---

## Plan self-review

| Spec requirement | Task |
|---|---|
| Details + achievements cache only | Task 1 shape + Task 2 loops |
| Incremental flush | Task 2 upsert + writeAtomic per appid |
| Repo-root path + gitignore | Task 1 |
| Delete on successful apply | Task 2 Step 5 |
| Overwrite without `--continue` | Task 2 Step 2 |
| `--continue` validate profile/flags | Task 1 `loadForContinue` |
| Failed → ok:false, no retry | Task 2 Steps 3–4 |
| Dry-run no progress | Task 2 `progressEnabled` |
| Covers uncached | Task 2 (no cover progress keys) |
| README | Task 2 Step 6 |

No placeholders. Types/names consistent: `createEmptyProgress`, `loadForContinue`, `upsertDetail`, `upsertAchievement`, `writeAtomic`, `removeProgress`.
