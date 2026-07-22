import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScreenFiltersProvider, useTierFilters } from "../src/components/screenFilters";
import { emptyCatalogSearchFilters } from "../src/domain/catalogSearch";
import type { Game } from "../src/domain/types";
import { TierListPage } from "../src/pages/TierListPage";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);

const NOW = "2026-07-16T10:00:00.000Z";

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "DuckTales",
    coverAssetId: null,
    steamAppId: null,
    importedVia: "manually",
    hoursPlayed: null,
    lastPlayedAt: null, achievementsUnlocked: null, achievementsTotal: null, steamOverrides: {},
    platforms: ["NES"],
    tags: ["platformer"],
    status: "playing",
    placement: { tierId: "a", rank: 1024 },
    reviewMarkdown: "",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function SetQ({ q }: { q: string }) {
  const { setFilters } = useTierFilters();
  return (
    <button type="button" onClick={() => setFilters({ ...emptyCatalogSearchFilters(), q })}>
      set
    </button>
  );
}

describe("TierListPage live filters", () => {
  it("hides non-matching games and omits empty tier rows when a filter is active", async () => {
    const games = [
      makeGame(),
      makeGame({
        id: "22222222-2222-4222-8222-222222222222",
        title: "Zelda",
        placement: { tierId: "b", rank: 1024 },
      }),
    ];

    render(
      <ScreenFiltersProvider>
        <SetQ q="Duck" />
        <TierListPage assets={{}} games={games} onMoveGame={vi.fn()} />
      </ScreenFiltersProvider>,
    );

    expect(screen.getByRole("button", { name: /DuckTales/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Zelda/ })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "B" })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "set" }));
    });

    expect(screen.getByRole("button", { name: /DuckTales/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Zelda/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "B" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "A" })).toBeInTheDocument();
  });

  it("shows filter empty state when no games match", async () => {
    const games = [makeGame()];

    render(
      <ScreenFiltersProvider>
        <SetQ q="no-match-query" />
        <TierListPage assets={{}} games={games} onMoveGame={vi.fn()} />
      </ScreenFiltersProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "set" }));
    });

    expect(screen.getByRole("heading", { name: "Ничего не найдено" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "A" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сбросить фильтры" })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Сбросить фильтры" }));
    });

    expect(screen.getByRole("button", { name: /DuckTales/ })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "A" })).toBeInTheDocument();
  });
});
