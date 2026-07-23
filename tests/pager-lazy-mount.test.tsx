import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { withComputedRevision, type Game, type LibraryDatabase } from "../src/domain";

const GAME_ID = "11111111-1111-4111-8111-111111111111";
const NOW = "2026-07-16T10:00:00.000Z";

function game(title: string): Game {
  return {
    id: GAME_ID,
    title,
    coverAssetId: null,
    steamAppId: null,
    importedVia: "manually",
    hoursPlayed: null,
    lastPlayedAt: null,
    achievementsUnlocked: null,
    achievementsTotal: null,
    steamOverrides: {},
    platforms: ["NES"],
    tags: [],
    status: "playing",
    placement: { tierId: "a", rank: 1024 },
    reviewMarkdown: "",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function database(): LibraryDatabase {
  return withComputedRevision({
    schemaVersion: 2,
    revision: "",
    publicationId: null,
    games: { [GAME_ID]: game("DuckTales") },
    notes: {},
    assets: {},
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = "";
  localStorage.clear();
});

beforeEach(() => {
  window.location.hash = "#/";
  localStorage.clear();
  vi.stubGlobal("matchMedia", vi.fn().mockImplementation((query: string) => ({
    matches: String(query).includes("max-width") || String(query).includes("pointer: coarse"),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => structuredClone(database()),
  }));
});

async function boot() {
  render(<App />);
  await waitFor(() => expect(screen.queryByText("Открываем библиотеку…")).not.toBeInTheDocument());
}

describe("pager lazy mount", () => {
  it("keeps far panel roots unmounted on catalog", async () => {
    window.location.hash = "#/games";
    await boot();
    expect(document.querySelector(".catalog-page")).toBeTruthy();
    expect(document.querySelector(".tier-page")).toBeTruthy();
    expect(document.querySelector(".history-page")).toBeTruthy();
    expect(document.querySelector(".settings-page")).toBeNull();
  });

  it("keeps far panel roots unmounted on settings", async () => {
    window.location.hash = "#/settings";
    await boot();
    expect(document.querySelector(".settings-page")).toBeTruthy();
    expect(document.querySelector(".history-page")).toBeTruthy();
    expect(document.querySelector(".catalog-page")).toBeNull();
    expect(document.querySelector(".tier-page")).toBeNull();
  });

  it("drops catalog root under an open game overlay", async () => {
    window.location.hash = "#/games";
    await boot();
    fireEvent.click(screen.getByRole("link", { name: "DuckTales" }));
    await waitFor(() => expect(window.location.hash).toBe(`#/games/${GAME_ID}`));
    expect(document.querySelector(".game-view-page")).toBeTruthy();
    expect(document.querySelector(".catalog-page")).toBeNull();
    // neighbors still near
    expect(document.querySelector(".tier-page")).toBeTruthy();
    expect(document.querySelector(".history-page")).toBeTruthy();
  });

  it("remounts catalog list after popping the game", async () => {
    window.location.hash = `#/games/${GAME_ID}`;
    await boot();
    await waitFor(() => expect(document.querySelector(".game-view-page")).toBeTruthy());
    const tabBar = screen.getByRole("navigation", { name: "Мобильная навигация" });
    fireEvent.click(within(tabBar).getByRole("link", { name: "Каталог" }));
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/games\/?(\?|$)/));
    expect(document.querySelector(".catalog-page")).toBeTruthy();
    expect(document.querySelector(".game-view-page")).toBeNull();
  });
});
