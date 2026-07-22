# Steam profile screenshots for media import — design

Date: 2026-07-22

Delta vs: `2026-07-22-steam-media-prefill-design.md`

## Goal

«Медиа Steam» attachments come only from the owner's **community-published** Steam UGC for that appid — not storefront marketing screenshots or trailers.

## Decisions

| Topic | Choice |
|---|---|
| Screenshots | `IPublishedFileService/GetUserFiles` (`filetype=4`) → WebP note images |
| Videos | Same API (`filetype=3`) → link to `sharedfiles/filedetails/?id=…` + optional preview thumb |
| Auth | `STEAM_WEB_API_KEY` + `--profile` / `STEAM_PROFILE_ID` (`.env` / `.env.local`) |
| Surface | CLI `import:steam-media` only |
| SPA media button | Removed |
| Screenshot URL | Prefer `file_url`, else `preview_url`; skip if neither |
| Empty gallery | Still upsert note (may be empty attachments) |
| Storefront | Only for optional `--prefill` (name/genres/header) — never for media |
| Video binaries | Not hosted in `public/media` (links only; thumbs are WebP images) |

## Flow

1. Load env; require Web API key + profile  
2. Resolve steamid64  
3. Resolve library game + appid  
4. `getUserScreenshots` + `getUserVideos` (paginate `numperpage=100`)  
5. Optional `--prefill` → `getAppDetails`  
6. Encode screenshot/thumb WebP → upsert `<!-- steam-media:v1 -->` note (best-effort per file; see bulk design)

## Out of scope

- SPA browser pull of profile media (key must not enter Vite client)  
- Private / unpublished client-local screenshots  
- Storefront trailers / marketing shots  
- Hosting video binaries / HLS  

**Amended:** full-library media crawl + import-default media + best-effort encode — see `2026-07-22-steam-media-bulk-design.md`.

## Verification

```bash
npx vitest run tests/steam-api.test.ts tests/steam-media.test.ts tests/steam-media-ui.test.tsx
npm test
npm run build
```
