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

describe("tab stack keep-alive", () => {
  it("restores catalog game after visiting tiers; second catalog tap pops to list", async () => {
    render(<App />);
    await waitFor(() => expect(screen.queryByText("Открываем библиотеку…")).not.toBeInTheDocument());

    const tabBar = screen.getByRole("navigation", { name: "Мобильная навигация" });
    fireEvent.click(within(tabBar).getByRole("link", { name: "Каталог" }));
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/games/));

    fireEvent.click(screen.getByRole("link", { name: "DuckTales" }));
    await waitFor(() => expect(window.location.hash).toBe(`#/games/${GAME_ID}`));
    expect(screen.getByRole("button", { name: "DuckTales" })).toBeInTheDocument();

    fireEvent.click(within(tabBar).getByRole("link", { name: "Тирлист" }));
    await waitFor(() => expect(window.location.hash).toBe("#/"));
    expect(screen.queryByRole("button", { name: "DuckTales" })).not.toBeInTheDocument();

    fireEvent.click(within(tabBar).getByRole("link", { name: "Каталог" }));
    await waitFor(() => expect(window.location.hash).toBe(`#/games/${GAME_ID}`));
    expect(screen.getByRole("button", { name: "DuckTales" })).toBeInTheDocument();
    expect(within(tabBar).getByRole("link", { name: "Каталог" })).toHaveAttribute("aria-current", "page");

    fireEvent.click(within(tabBar).getByRole("link", { name: "Каталог" }));
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/games\/?(\?|$)/));
    expect(screen.queryByRole("button", { name: "DuckTales" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "DuckTales" })).toBeInTheDocument();
  });

  it("keeps game opened from tiers on the tiers tab", async () => {
    render(<App />);
    await waitFor(() => expect(screen.queryByText("Открываем библиотеку…")).not.toBeInTheDocument());

    const tabBar = screen.getByRole("navigation", { name: "Мобильная навигация" });
    const tierCover = screen.getByRole("link", { name: /DuckTales/ });
    fireEvent.click(tierCover);
    await waitFor(() => expect(window.location.hash).toBe(`#/games/${GAME_ID}`));
    expect(within(tabBar).getByRole("link", { name: "Тирлист" })).toHaveAttribute("aria-current", "page");
    expect(within(tabBar).getByRole("link", { name: "Каталог" })).not.toHaveAttribute("aria-current");
  });
});
