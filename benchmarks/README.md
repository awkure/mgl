# Benchmarks

Report-only micro-benchmarks for domain hot paths (catalog filters, validation), post-build bundle size, browser scroll FPS, and Lighthouse on HashRouter routes. **Not CI gates.**

**Report-only policy:** runners are for local comparison and regression notes. `bench:fps`, `bench:tab-highlight`, and `bench:lighthouse` exit with code **0** even when FPS or scores are low; they exit with code **1** only when the harness fails (missing `dist/`, preview server, browser, scroll root, or Lighthouse crash). Vitest bench and bundle recording follow normal npm exit codes for test/harness failures only — low numbers are not failures.

**Single entrypoint:**

```bash
just bench
```

Builds once (`npm run build`), then runs Vitest bench, bundle size, FPS, and Lighthouse in order. Requires `.env` like other `just` recipes (`just setup` or `just env-reset`).

**Browser setup (FPS + Lighthouse + e2e):** install Chromium once:

```bash
npx playwright install chromium
```

**UI e2e (Playwright):** builds `dist/`, starts `vite preview`, runs visibility/smoke specs under `e2e/`:

```bash
npm run test:e2e
```

**Seeded library:** FPS and Lighthouse reflect whatever library was baked into `dist/` at build time. For representative catalog/game-page numbers, seed before building:

```bash
just db-seed
just bench
```

(`just db-seed` copies `fixtures/library/` into `public/` without touching unrelated media workflows.)

Artifacts under `benchmarks/results/` are gitignored; commit runners only, not reports.

## Vitest domain benches

```bash
npm run bench
```

Runs Vitest bench suites under `benchmarks/vitest/` against deterministic fixtures in `benchmarks/fixtures/`.

## Bundle size

```bash
npm run build
npm run bench:bundle
```

Records every file under `dist/` (sizes sorted descending) and writes `benchmarks/results/bundle.json`. Exits with code 1 if `dist/` is missing.

## Scroll FPS

```bash
npm run build
npm run bench:fps
```

Starts `vite preview` on an ephemeral port, opens HashRouter routes in headless Chromium (Playwright), scrolls the catalog and tier scroll roots while sampling `requestAnimationFrame` deltas, and writes `benchmarks/results/fps.json`.

## Tab-bar highlight drag FPS

```bash
npm run build
npm run bench:tab-highlight
```

Drags a held pointer across the mobile footer tab highlight while sampling frame deltas and `--press-tab` tracking error. Writes `benchmarks/results/tab-highlight-fps.json`. Report-only (same exit policy as `bench:fps`).

## Lighthouse

```bash
npm run build
npm run bench:lighthouse
```

Runs Lighthouse (headless Chromium via Playwright CDP) against `vite preview` on HashRouter routes: `#/` (catalog home), `#/games`, and `#/games/<id>` when the built library has at least one game. Categories: performance, accessibility, best-practices, seo. Writes HTML and JSON under `benchmarks/results/lighthouse/` plus `summary.json`.

**SEO caveat:** this app uses **HashRouter** (hash URLs, static HTML shell). Lighthouse’s SEO category may score poorly — that is expected for a client-routed SPA, not a signal to add fake meta tags just to inflate the score. Report honestly.
