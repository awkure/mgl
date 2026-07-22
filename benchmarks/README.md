# Benchmarks

Report-only micro-benchmarks for domain hot paths (catalog filters, validation). Not CI gates.

```bash
npm run bench
```

Runs Vitest bench suites under `benchmarks/vitest/` against deterministic fixtures in `benchmarks/fixtures/`.
