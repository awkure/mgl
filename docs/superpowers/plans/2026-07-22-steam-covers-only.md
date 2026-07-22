# Steam Covers-Only Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standalone CLI/just tactic that re-fetches and replaces Steam covers for existing library games with `steamAppId`, without full reimport.

**Architecture:** Pure selection/decision helpers in `src/domain/steamCovers.ts`; CLI `scripts/import-steam-covers.mjs` loads library, fetches via `fetchAndEncodeSteamCover`, builds updates with existing `buildSteamUpsertPatch`, writes patch or `--apply` into `public/`. No owned-games API, snapshot, or SPA changes.

**Tech Stack:** TypeScript domain + Vitest, Node CLI (`--experimental-strip-types`), existing `steamCover.mjs` + `buildSteamUpsertPatch` / `applyPatch`.

**Spec:** `docs/superpowers/specs/2026-07-22-steam-covers-only-design.md`

## Global Constraints

- Cover field only: `coverAssetId` + `updatedAt` on game; never title/tags/status/placement/review/hours/achievements
- Respect `steamOverrides.coverAssetId` unless `--force`
- Do **not** write `steamOverrides.coverAssetId` from this CLI
- Always re-fetch for eligible games; skip write when new asset id equals current (`unchanged`)
- CDN-only encode (`fetchAndEncodeSteamCover` without `headerImage`); no Web API key
- No creates; no snapshot/progress/media-note touches
- `--game-id` mutually exclusive with `--appids`
- Exit `0` when run finishes; non-zero only on fatal (bad flags / missing library / missing `--game-id`)
- VCS: `git`; do not commit `.cursor/` skills

## File map

| Path | Responsibility |
|---|---|
| `src/domain/steamCovers.ts` | Select targets; lock/unchanged/update decision; apply cover to game copy |
| `tests/steam-covers.test.ts` | Domain matrix + patch-op shape via `buildSteamUpsertPatch` |
| `scripts/import-steam-covers.mjs` | CLI flags, fetch loop, patch/apply I/O |
| `package.json` | `import:steam-covers` script |
| `justfile` | `steam-import-covers` / `steam-import-covers-via-patch` |
| `README.md` | Document recipes + flags |

---

### Task 1: Domain helpers + tests

**Files:**
- Create: `src/domain/steamCovers.ts`
- Create: `tests/steam-covers.test.ts`
- Consumes: `Game` from `src/domain/types.ts`; `buildSteamUpsertPatch` from `src/domain/steamReimport.ts`
- Produces:
  - `selectSteamCoverTargets(games, options): Game[]`
  - `steamCoverRefreshAction(game, proposedCoverAssetId, options): "locked" | "unchanged" | "update"`
  - `withSteamCover(game, coverAssetId, now): Game`

- [ ] **Step 1: Write failing tests**

Create `tests/steam-covers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  selectSteamCoverTargets,
  steamCoverRefreshAction,
  withSteamCover,
} from "../src/domain/steamCovers";
import { buildSteamUpsertPatch } from "../src/domain/steamReimport";
import type { Game } from "../src/domain/types";

const NOW = "2026-07-22T12:00:00.000Z";
const COVER_A = "a".repeat(64);
const COVER_B = "b".repeat(64);

function game(overrides: Partial<Game> & Pick<Game, "id" | "title">): Game {
  return {
    coverAssetId: null,
    steamAppId: null,
    importedVia: "steam",
    hoursPlayed: null,
    lastPlayedAt: null,
    achievementsUnlocked: null,
    achievementsTotal: null,
    steamOverrides: {},
    platforms: ["Steam"],
    tags: [],
    status: "played",
    placement: { tierId: "unranked", rank: 1024 },
    reviewMarkdown: "",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("selectSteamCoverTargets", () => {
  const games = {
    g1: game({ id: "g1", title: "A", steamAppId: 10 }),
    g2: game({ id: "g2", title: "B", steamAppId: 20 }),
    g3: game({ id: "g3", title: "Manual", steamAppId: null }),
    g4: game({ id: "g4", title: "Zero", steamAppId: 0 }),
  };

  it("keeps only positive steamAppId", () => {
    const ids = selectSteamCoverTargets(games, {}).map((g) => g.id).sort();
    expect(ids).toEqual(["g1", "g2"]);
  });

  it("filters by appids", () => {
    expect(selectSteamCoverTargets(games, { appids: [20] }).map((g) => g.id)).toEqual(["g2"]);
  });

  it("filters by gameId", () => {
    expect(selectSteamCoverTargets(games, { gameId: "g1" }).map((g) => g.id)).toEqual(["g1"]);
  });

  it("applies limit after filter", () => {
    expect(selectSteamCoverTargets(games, { limit: 1 })).toHaveLength(1);
  });
});

describe("steamCoverRefreshAction", () => {
  it("skips locked without force", () => {
    const g = game({
      id: "g1",
      title: "A",
      steamAppId: 10,
      coverAssetId: COVER_A,
      steamOverrides: { coverAssetId: true },
    });
    expect(steamCoverRefreshAction(g, COVER_B, { force: false })).toBe("locked");
  });

  it("updates locked with force", () => {
    const g = game({
      id: "g1",
      title: "A",
      steamAppId: 10,
      coverAssetId: COVER_A,
      steamOverrides: { coverAssetId: true },
    });
    expect(steamCoverRefreshAction(g, COVER_B, { force: true })).toBe("update");
  });

  it("unchanged when same id", () => {
    const g = game({ id: "g1", title: "A", steamAppId: 10, coverAssetId: COVER_A });
    expect(steamCoverRefreshAction(g, COVER_A, { force: false })).toBe("unchanged");
  });

  it("update when different id", () => {
    const g = game({ id: "g1", title: "A", steamAppId: 10, coverAssetId: COVER_A });
    expect(steamCoverRefreshAction(g, COVER_B, { force: false })).toBe("update");
  });

  it("locked wins over same-id check without force", () => {
    const g = game({
      id: "g1",
      title: "A",
      steamAppId: 10,
      coverAssetId: COVER_A,
      steamOverrides: { coverAssetId: true },
    });
    expect(steamCoverRefreshAction(g, COVER_A, { force: false })).toBe("locked");
  });
});

describe("withSteamCover + patch shape", () => {
  it("emits only coverAssetId and updatedAt field ops", () => {
    const previous = game({ id: "g1", title: "A", steamAppId: 10, coverAssetId: COVER_A });
    const next = withSteamCover(previous, COVER_B, NOW);
    expect(next.steamOverrides).toEqual({});
    const cover = {
      asset: {
        id: COVER_B,
        kind: "image" as const,
        mime: "image/webp",
        width: 512,
        height: 512,
        byteLength: 10,
        alt: "A",
        originalName: "steam-10.webp",
      },
      base64: "QQ==",
    };
    const patch = buildSteamUpsertPatch("rev", [
      { kind: "update", game: next, previousGame: previous, cover },
    ], { now: NOW, transactionId: "t" });
    const paths = Object.keys(patch.operations).sort();
    expect(paths).toEqual([
      `/assets/${COVER_B}`,
      `/games/g1/coverAssetId`,
      `/games/g1/updatedAt`,
    ]);
  });
});
```

- [ ] **Step 2: Run tests — expect fail**

Run: `npx vitest run tests/steam-covers.test.ts`

Expected: FAIL — cannot resolve `../src/domain/steamCovers`

- [ ] **Step 3: Implement domain module**

Create `src/domain/steamCovers.ts`:

```ts
import type { Game } from "./types";

export type SteamCoverRefreshAction = "locked" | "unchanged" | "update";

export type SelectSteamCoverTargetsOptions = {
  appids?: readonly number[];
  gameId?: string;
  limit?: number;
};

/** Library games with positive steamAppId, optional filters. Stable order by title then id. */
export function selectSteamCoverTargets(
  games: Record<string, Game>,
  options: SelectSteamCoverTargetsOptions = {},
): Game[] {
  const appidSet = options.appids?.length
    ? new Set(options.appids)
    : null;
  let list = Object.values(games).filter((game) => {
    if (typeof game.steamAppId !== "number" || !Number.isSafeInteger(game.steamAppId) || game.steamAppId <= 0) {
      return false;
    }
    if (options.gameId != null && game.id !== options.gameId) return false;
    if (appidSet && !appidSet.has(game.steamAppId)) return false;
    return true;
  });
  list.sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  if (options.limit != null && Number.isSafeInteger(options.limit) && options.limit >= 0) {
    list = list.slice(0, options.limit);
  }
  return list;
}

export function steamCoverRefreshAction(
  game: Game,
  proposedCoverAssetId: string | null,
  options: { force?: boolean } = {},
): SteamCoverRefreshAction {
  const locked = Boolean(game.steamOverrides?.coverAssetId);
  if (locked && !options.force) return "locked";
  if (proposedCoverAssetId == null) return "unchanged";
  if (game.coverAssetId === proposedCoverAssetId) return "unchanged";
  return "update";
}

export function withSteamCover(game: Game, coverAssetId: string, now: string): Game {
  return {
    ...game,
    coverAssetId,
    updatedAt: now,
  };
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run tests/steam-covers.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/steamCovers.ts tests/steam-covers.test.ts
git commit -m "$(cat <<'EOF'
feat(steam): domain helpers for covers-only refresh

Select steamAppId targets and decide lock/unchanged/update without full reimport merge.
EOF
)"
```

---

### Task 2: CLI + npm + just recipes

**Files:**
- Create: `scripts/import-steam-covers.mjs`
- Modify: `package.json` (add `"import:steam-covers"`)
- Modify: `justfile` (add recipes after `steam-import-media`)
- Consumes: `selectSteamCoverTargets`, `steamCoverRefreshAction`, `withSteamCover`; `fetchAndEncodeSteamCover`; `buildSteamUpsertPatch`, `applyPatch`, `computeRevision`, `externalAssetPath` (same imports pattern as `scripts/import-steam-media.mjs`)
- Produces: working `npm run import:steam-covers` / just recipes

- [ ] **Step 1: Add package script**

In `package.json` `scripts`, add next to `import:steam-media`:

```json
"import:steam-covers": "node --experimental-strip-types scripts/import-steam-covers.mjs",
```

- [ ] **Step 2: Add justfile recipes**

After the `steam-import-media` block:

```just
# Steam covers only → patch file
steam-import-covers-via-patch *ARGS:
    npm run import:steam-covers -- {{ARGS}}

# Steam covers only → apply into public/data + public/media
steam-import-covers *ARGS:
    npm run import:steam-covers -- --apply {{ARGS}}
```

- [ ] **Step 3: Implement CLI**

Create `scripts/import-steam-covers.mjs` modeled on `scripts/import-steam-media.mjs` apply/out I/O, but library-wide:

```js
#!/usr/bin/env node

/**
 * Refresh Steam covers for existing library games (coverAssetId only).
 *
 * Usage:
 *   npm run import:steam-covers -- [flags]
 *   just steam-import-covers-via-patch --limit 5
 *   just steam-import-covers --limit 5
 *
 * Flags:
 *   --out <path>       patch JSON (default steam-covers.patch.json unless --apply)
 *   --apply            write public/data/library.json + public/media
 *   --dry-run          counts only; no fetch / no write
 *   --force            ignore steamOverrides.coverAssetId
 *   --limit <n>
 *   --appids <a,b,c>
 *   --game-id <uuid>
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fetchAndEncodeSteamCover } from "./lib/steamCover.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const libraryPath = path.join(root, "public", "data", "library.json");

function loadEnvLocal() {
  const envPath = path.join(root, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = value;
  }
}

function parseArgs(argv) {
  const flags = {
    apply: false,
    dryRun: false,
    force: false,
    out: null,
    outExplicit: false,
    limit: null,
    appids: null,
    gameId: null,
    help: false,
  };
  const args = [...argv];
  const next = () => {
    if (!args.length) throw new Error("Missing value for flag");
    return args.shift();
  };
  while (args.length) {
    const arg = args.shift();
    if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--apply") flags.apply = true;
    else if (arg === "--force") flags.force = true;
    else if (arg === "--out") {
      flags.out = next();
      flags.outExplicit = true;
    } else if (arg === "--limit") flags.limit = Number(next());
    else if (arg === "--appids") {
      flags.appids = next().split(",").map((part) => Number(part.trim())).filter((n) => Number.isSafeInteger(n) && n > 0);
    } else if (arg === "--game-id") flags.gameId = next();
    else if (arg === "--help" || arg === "-h") flags.help = true;
    else throw new Error(`Unknown flag: ${arg}`);
  }
  if (flags.limit != null && (!Number.isSafeInteger(flags.limit) || flags.limit < 0)) {
    throw new Error("--limit must be a non-negative integer");
  }
  if (flags.apply && flags.dryRun) throw new Error("Use either --apply or --dry-run, not both");
  if (flags.gameId && flags.appids) throw new Error("Use either --game-id or --appids, not both");
  if (!flags.outExplicit) {
    flags.out = flags.apply ? null : "steam-covers.patch.json";
  }
  return flags;
}

function printHelp() {
  console.log(`Usage: npm run import:steam-covers -- [flags]

Flags:
  --out <path>       write patch JSON (default steam-covers.patch.json unless --apply)
  --apply            write covers into public/data + public/media
  --dry-run          counts only; no fetch / no write
  --force            ignore steamOverrides.coverAssetId
  --limit <n>
  --appids <a,b,c>
  --game-id <uuid>`);
}

loadEnvLocal();
const flags = parseArgs(process.argv.slice(2));
if (flags.help) {
  printHelp();
  process.exit(0);
}

const {
  applyPatch,
  computeRevision,
  externalAssetPath,
} = await import(pathToFileURL(path.join(root, "src/domain/patch.ts")).href);
const { buildSteamUpsertPatch } = await import(pathToFileURL(path.join(root, "src/domain/steamReimport.ts")).href);
const {
  selectSteamCoverTargets,
  steamCoverRefreshAction,
  withSteamCover,
} = await import(pathToFileURL(path.join(root, "src/domain/steamCovers.ts")).href);

try {
  if (!existsSync(libraryPath)) throw new Error(`Missing library at ${libraryPath}`);
  const library = JSON.parse(readFileSync(libraryPath, "utf8"));
  if (flags.gameId && !library.games?.[flags.gameId]) {
    throw new Error(`Game not found: ${flags.gameId}`);
  }

  const targets = selectSteamCoverTargets(library.games ?? {}, {
    appids: flags.appids ?? undefined,
    gameId: flags.gameId ?? undefined,
    limit: flags.limit ?? undefined,
  });

  if (flags.dryRun) {
    console.log(JSON.stringify({
      targets: targets.length,
      dryRun: true,
    }));
    process.exit(0);
  }

  const now = new Date().toISOString();
  let skippedLocked = 0;
  let unchanged = 0;
  let coversFailed = 0;
  const patchItems = [];

  for (let index = 0; index < targets.length; index += 1) {
    const game = targets[index];
    const appid = game.steamAppId;
    process.stdout.write(`covers ${index + 1}/${targets.length} appid=${appid}\r`);

    if (!flags.force && game.steamOverrides?.coverAssetId) {
      skippedLocked += 1;
      continue;
    }

    let cover = null;
    try {
      cover = await fetchAndEncodeSteamCover(appid, { alt: game.title });
    } catch (reason) {
      coversFailed += 1;
      console.warn(`\ncover failed for ${appid}: ${reason instanceof Error ? reason.message : reason}`);
      continue;
    }
    if (!cover) {
      coversFailed += 1;
      continue;
    }

    const action = steamCoverRefreshAction(game, cover.asset.id, { force: flags.force });
    if (action === "locked") {
      skippedLocked += 1;
      continue;
    }
    if (action === "unchanged") {
      unchanged += 1;
      continue;
    }

    const nextGame = withSteamCover(game, cover.asset.id, now);
    patchItems.push({
      kind: "update",
      game: nextGame,
      previousGame: game,
      cover,
    });
  }
  if (targets.length) process.stdout.write("\n");

  const updated = patchItems.length;
  const baseRevision = library.revision || computeRevision(library);
  const patch = buildSteamUpsertPatch(baseRevision, patchItems, {
    now,
    transactionId: `steam-covers-${now}`,
  });

  for (const [id, base64] of Object.entries(patch.blobs)) {
    if (!patch.operations[`/assets/${id}`]) throw new Error(`Orphan blob ${id}`);
    if (typeof base64 !== "string" || !base64) throw new Error(`Empty blob ${id}`);
  }

  if (flags.out) {
    const outPath = path.resolve(root, flags.out);
    writeFileSync(outPath, `${JSON.stringify(patch, null, 2)}\n`);
    console.log(`wrote patch ${outPath}`);
  }

  if (flags.apply) {
    const mediaRoot = path.join(root, "public", "media");
    mkdirSync(mediaRoot, { recursive: true });
    const next = applyPatch(library, patch);
    for (const [id, base64] of Object.entries(patch.blobs)) {
      const asset = next.assets[id];
      if (!asset) throw new Error(`Applied library missing asset ${id}`);
      const filePath = externalAssetPath(mediaRoot, id, asset);
      const bytes = Buffer.from(base64, "base64");
      if (existsSync(filePath)) {
        const existing = readFileSync(filePath);
        if (!existing.equals(bytes)) throw new Error(`Media collision for ${id}`);
      } else {
        writeFileSync(filePath, bytes, { mode: 0o644, flag: "wx" });
      }
    }
    writeFileSync(libraryPath, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`applied to ${libraryPath} (+ ${Object.keys(patch.blobs).length} media)`);
  }

  console.log(JSON.stringify({
    targets: targets.length,
    updated,
    skippedLocked,
    unchanged,
    coversFailed,
    operations: Object.keys(patch.operations).length,
    blobs: Object.keys(patch.blobs).length,
    applied: flags.apply,
    baseRevision,
  }));
} catch (reason) {
  console.error(reason instanceof Error ? reason.message : String(reason));
  process.exit(1);
}
```

Notes for implementer:
- Reuse `loadEnvLocal` / apply blob write pattern from `import-steam-media.mjs` for consistency.
- Early lock skip before fetch avoids CDN work; `steamCoverRefreshAction` still handles same-id after fetch.
- Always write patch when `--out` is set, even with zero ops.

- [ ] **Step 4: Smoke CLI help**

Run: `npm run import:steam-covers -- --help`

Expected: usage text, exit 0

Run: `npm run import:steam-covers -- --dry-run --limit 1`

Expected: JSON with `targets` and `dryRun: true` (needs existing `public/data/library.json`)

- [ ] **Step 5: Commit**

```bash
git add scripts/import-steam-covers.mjs package.json justfile
git commit -m "$(cat <<'EOF'
feat(steam): covers-only import CLI and just recipes

Refresh library Steam covers via CDN without owned-games reimport.
EOF
)"
```

---

### Task 3: README + verification

**Files:**
- Modify: `README.md` (Steam CLI section near existing `steam-import` / `steam-import-media` docs)

- [ ] **Step 1: Document recipes**

After the `steam-import-media` examples, add:

```markdown
# Только обложки Steam (CDN) для игр с steamAppId в library.json:
just steam-import-covers-via-patch --limit 5
just steam-import-covers --limit 5
# or: npm run import:steam-covers -- --apply --limit 5
```

And a short RU paragraph:

```markdown
`import:steam-covers` — только `coverAssetId` (+ asset). Не трогает часы/статус/tier/review,
не пишет snapshot, не нужен `STEAM_WEB_API_KEY`. Учитывает `steamOverrides.coverAssetId`;
`--force` перезаписывает locked. Флаги: `--apply`, `--out`, `--dry-run`, `--force`,
`--limit`, `--appids`, `--game-id` (XOR с `--appids`).
```

- [ ] **Step 2: Full verification**

Run:

```bash
npx vitest run tests/steam-covers.test.ts tests/steam-cover.test.ts
npm test
npm run data:validate
npm run build
```

Expected: all pass

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs(steam): document covers-only just recipes

EOF
)"
```

---

## Spec coverage checklist

| Spec item | Task |
|---|---|
| Standalone CLI + just | 2 |
| All positive `steamAppId` games | 1 (`selectSteamCoverTargets`) |
| Locks + `--force` | 1 + 2 |
| Always re-fetch; same-id → unchanged | 1 + 2 |
| CDN-only encode | 2 |
| Patch/apply I/O | 2 |
| No snapshot/API key/SPA | 2 (omission) |
| `--game-id` XOR `--appids` | 2 |
| README | 3 |
| Tests lock/force/filter/patch shape | 1 |

## Self-review notes

- No `--missing-only` (explicitly out of scope).
- Domain returns `"unchanged"` for `proposedCoverAssetId == null` so CLI never calls `withSteamCover` on failed encode (CLI increments `coversFailed` before decision when `cover` is null).
- `buildSteamUpsertPatch` already diffs fields — cover-only game copies yield only `coverAssetId` + `updatedAt` ops (asserted in Task 1).
