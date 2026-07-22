# Benchmarks

Report-only micro-benchmarks for domain hot paths (catalog filters, validation) and post-build bundle size. Not CI gates.

```bash
npm run bench
```

Runs Vitest bench suites under `benchmarks/vitest/` against deterministic fixtures in `benchmarks/fixtures/`.

```bash
npm run build
npm run bench:bundle
```

Records every file under `dist/` (sizes sorted descending) and writes `benchmarks/results/bundle.json`. Exits with code 1 if `dist/` is missing. Results directory is gitignored.
