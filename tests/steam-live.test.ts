/**
 * Live Steam Web API smoke tests.
 * Needs STEAM_WEB_API_KEY (+ optional STEAM_PROFILE_ID) in .env.local.
 * Skipped automatically when the key is absent (CI-safe).
 *
 * @vitest-environment node
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseSteamProfileInput } from "../src/domain/steamIdentity";
import {
  getPlayerSummary,
  probeOwnedGamesVisibility,
  resolveSteamId,
  resolveVanityUrl,
} from "../scripts/lib/steamApi.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
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

const apiKey = process.env.STEAM_WEB_API_KEY?.trim() ?? "";
const profileId = process.env.STEAM_PROFILE_ID?.trim() ?? "";
const hasLiveSteam = Boolean(apiKey);

describe.skipIf(!hasLiveSteam)("Steam live API", () => {
  it("resolves vanity awkure to a steamID64", async () => {
    const steamid = await resolveVanityUrl(apiKey, "awkure");
    expect(steamid).toMatch(/^7656119\d{10}$/);
    if (profileId) expect(steamid).toBe(profileId);
  }, 20_000);

  it("resolves profile URL, STEAM_PROFILE_ID, and vanity to the same id", async () => {
    const fromUrl = await resolveSteamId(apiKey, parseSteamProfileInput("https://steamcommunity.com/id/awkure/"));
    const fromVanity = await resolveSteamId(apiKey, parseSteamProfileInput("awkure"));
    expect(fromUrl).toBe(fromVanity);
    expect(fromUrl).toMatch(/^7656119\d{10}$/);

    if (profileId) {
      const fromEnv = await resolveSteamId(apiKey, parseSteamProfileInput(profileId));
      expect(fromEnv).toBe(fromUrl);
      expect(fromEnv).toBe(profileId);
    }
  }, 20_000);

  it("loads player summary for the resolved account", async () => {
    const steamid = profileId || await resolveVanityUrl(apiKey, "awkure");
    const summary = await getPlayerSummary(apiKey, steamid);
    expect(summary.steamid).toBe(steamid);
    expect(typeof summary.personaname).toBe("string");
    expect(summary.personaname.length).toBeGreaterThan(0);
    expect(String(summary.profileurl ?? "")).toMatch(/steamcommunity\.com/);
  }, 20_000);

  it("sees an owned-games library (Game details must be Public)", async () => {
    const steamid = profileId || await resolveVanityUrl(apiKey, "awkure");
    const library = await probeOwnedGamesVisibility(apiKey, steamid);
    expect(library.visible).toBe(true);
    expect(library.gameCount).toBeGreaterThan(0);
  }, 20_000);
});

describe.skipIf(hasLiveSteam)("Steam live API (skipped without key)", () => {
  it("documents required env", () => {
    expect(apiKey).toBe("");
  });
});
