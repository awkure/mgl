# Dev recipes for mygameslist. Requires: just, Node ≥22.13
# https://github.com/casey/just

set shell := ["bash", "-eu", "-o", "pipefail", "-c"]
set dotenv-load := true

default:
    @just --list

# Install deps and ensure .env exists
setup:
    @[ -f .env ] || cp .env.example .env
    npm ci

# Vite dev server
dev: ensure-env
    npm run dev

# Production build
build: ensure-env
    npm run build

# Preview built dist/
preview: ensure-env
    npm run preview

# Run Vitest once
test: ensure-env
    npm test

# Vitest watch mode
test-watch: ensure-env
    npm run test:watch

# Validate public/data/library.json + media
validate:
    npm run data:validate

# Restore published DB + media from fixtures/library
db-seed:
    mkdir -p public/data public/media
    cp fixtures/library/library.json public/data/library.json
    rsync -a --delete fixtures/library/media/ public/media/
    @echo "Seeded public/ from fixtures/library"

# Empty published DB + wipe public/media (keeps .gitkeep)
db-clean:
    mkdir -p public/data public/media
    node -e 'require("fs").writeFileSync("public/data/library.json", JSON.stringify({ schemaVersion: 2, revision: "", publicationId: null, games: {}, notes: {}, assets: {} }, null, 2) + "\n")'
    find public/media -mindepth 1 -maxdepth 1 ! -name '.gitkeep' -exec rm -rf {} +
    touch public/media/.gitkeep
    @echo "Cleaned public/data/library.json and public/media"

# Resolve Steam profile + check owned-games visibility (needs STEAM_WEB_API_KEY)
steam-probe *ARGS:
    npm run steam:probe -- {{ARGS}}

# Live Steam API smoke tests (.env.local: STEAM_WEB_API_KEY, optional STEAM_PROFILE_ID)
test-steam:
    npm run test:steam

# Full local gate before push
check: validate test build

# Apply clipboard patch → local git/jj commit (macOS)
publish-clipboard:
    npm run publish:clipboard

# Push main and wait for Pages deploy workflow
push-ci:
    npm run push:ci

# Reset local Vite env from the example (keeps .env.local)
env-reset:
    cp .env.example .env
    @echo "Wrote .env from .env.example"

[private]
ensure-env:
    @[ -f .env ] || { echo "Missing .env — run: just setup (or just env-reset)"; exit 1; }
