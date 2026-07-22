import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogRouteIsland, TierRouteIsland } from "../src/App/routeIslands";
import { ScreenFiltersProvider } from "../src/components/screenFilters";
import { withComputedRevision, type Game, type LibraryDatabase } from "../src/domain";
import { LibraryProvider } from "../src/state/LibraryContext";

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
    lastPlayedAt: null, achievementsUnlocked: null, achievementsTotal: null, steamOverrides: {},
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

function renderWithLibrary(ui: ReactElement) {
  return render(
    <LibraryProvider>
      <ScreenFiltersProvider>{ui}</ScreenFiltersProvider>
    </LibraryProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

beforeEach(() => {
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

describe("route islands", () => {
  it("renders catalog island with library games", async () => {
    renderWithLibrary(
      <CatalogRouteIsland active onOpenGame={() => undefined} scrollSelf />,
    );
    expect(await screen.findByText("DuckTales")).toBeTruthy();
  });

  it("renders tier island with library games", async () => {
    renderWithLibrary(
      <TierRouteIsland onMoveGame={() => undefined} onOpenGame={() => undefined} />,
    );
    expect(await screen.findByText("DuckTales")).toBeTruthy();
  });
});
