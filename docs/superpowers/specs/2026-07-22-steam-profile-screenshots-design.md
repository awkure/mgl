# Steam profile screenshots for media import — design

Date: 2026-07-22

Delta vs: `2026-07-22-steam-media-prefill-design.md`

## Goal

«Медиа Steam» screenshots come from the owner's **community-published** Steam gallery for that appid, not storefront marketing `appdetails.screenshots`.

## Decisions

| Topic | Choice |
|---|---|
| Screenshot source | `IPublishedFileService/GetUserFiles` (`filetype=4`) for profile + appid |
| Auth | `STEAM_WEB_API_KEY` + `--profile` / `STEAM_PROFILE_ID` (`.env` / `.env.local`) |
| Surface | CLI `import:steam-media` only |
| SPA media button | Removed |
| Image URL | Prefer `file_url`, else `preview_url`; skip if neither |
| Empty gallery | Still upsert note (trailers only / empty shots) |
| Trailers / prefill | Unchanged — storefront `getAppDetails` |
| Storefront screenshots | No longer parsed or used for media |

## Flow

1. Load env; require Web API key + profile  
2. Resolve steamid64  
3. Resolve library game + appid  
4. `getUserScreenshots(key, steamid, appid)` (paginate `numperpage=100`)  
5. `getAppDetails` for movies (+ optional `--prefill`)  
6. Encode WebP → upsert `<!-- steam-media:v1 -->` note (all-or-nothing)

## Out of scope

- SPA browser pull of profile screenshots (key must not enter Vite client)  
- Private / unpublished client-local screenshots (API cannot see them)  
- Full-library media crawl  

## Verification

```bash
npx vitest run tests/steam-api.test.ts tests/steam-media.test.ts tests/steam-media-ui.test.tsx
npm test
npm run build
```
