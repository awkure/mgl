# Benchmarks

Report-only micro-benchmarks for domain hot paths (catalog filters, validation), post-build bundle size, and browser scroll FPS. Not CI gates.

```bash
npm run bench
```

Runs Vitest bench suites under `benchmarks/vitest/` against deterministic fixtures in `benchmarks/fixtures/`.

```bash
npm run build
npm run bench:bundle
```

Records every file under `dist/` (sizes sorted descending) and writes `benchmarks/results/bundle.json`. Exits with code 1 if `dist/` is missing. Results directory is gitignored.

```bash
npm run build
npm run bench:fps
```

Starts `vite preview` on an ephemeral port, opens HashRouter routes in headless Chromium (Playwright), scrolls the catalog and tier scroll roots while sampling `requestAnimationFrame` deltas, and writes `benchmarks/results/fps.json`. Exits with code 0 even when FPS is low; exits with code 1 only when the harness fails (missing `dist/`, preview, browser, or scroll root).

**Setup:** install the browser once with `npx playwright install chromium`. FPS numbers reflect whatever library was baked into `dist/` at build time — seed a representative library before building (`just db-seed` copies `fixtures/library/` into `public/` without touching unrelated media workflows). Rebuild after seeding.

Artifacts under `benchmarks/results/` are gitignored; commit runners only, not reports.
