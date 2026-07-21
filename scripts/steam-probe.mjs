#!/usr/bin/env node

/**
 * Resolve a Steam profile and check whether the owned-games library is visible.
 *
 * Usage: npm run steam:probe -- <steamID64|vanity|profile-url>
 * Requires STEAM_WEB_API_KEY in the environment or .env / .env.local (Node-only).
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  getPlayerSummary,
  probeOwnedGamesVisibility,
  resolveSteamId,
  SteamApiError,
} from "./lib/steamApi.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(path.join(root, ".env"));
loadEnvFile(path.join(root, ".env.local"));

const input = process.argv.slice(2).join(" ").trim();
if (!input) {
  console.error("Usage: npm run steam:probe -- <steamID64|vanity|profile-url>");
  process.exit(2);
}

const key = process.env.STEAM_WEB_API_KEY?.trim();
if (!key) {
  console.error("STEAM_WEB_API_KEY is missing. Add it to .env (Node-only; never VITE_*).");
  process.exit(2);
}

const { parseSteamProfileInput } = await import(
  pathToFileURL(path.join(root, "src/domain/steamIdentity.ts")).href
);

try {
  const ref = parseSteamProfileInput(input);
  const steamid = await resolveSteamId(key, ref);
  const summary = await getPlayerSummary(key, steamid);
  const library = await probeOwnedGamesVisibility(key, steamid);

  console.log(`persona: ${summary.personaname ?? "(unknown)"}`);
  console.log(`steamid64: ${steamid}`);
  console.log(`profile: ${summary.profileurl ?? `https://steamcommunity.com/profiles/${steamid}`}`);
  console.log(`library_visible: ${library.visible ? "yes" : "no"}`);
  console.log(`game_count: ${library.gameCount}`);

  if (!library.visible) {
    console.error(
      "Библиотека скрыта. В Steam: Privacy → Game details → Public, затем повторите probe.",
    );
    process.exit(1);
  }
} catch (reason) {
  const message = reason instanceof Error ? reason.message : String(reason);
  console.error(message);
  process.exit(reason instanceof SteamApiError ? 1 : 1);
}
