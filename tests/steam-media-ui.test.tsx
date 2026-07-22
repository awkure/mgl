import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Game } from "../src/domain/types";
import { steamStoreAppUrl } from "../src/domain/steamMedia";
import { GamePage } from "../src/pages/GamePage";

const NOW = "2026-07-22T12:00:00.000Z";
const GAME_ID = "11111111-1111-4111-8111-111111111111";

class ResizeObserverMock {
  observe() { }
  disconnect() { }
}

function baseGame(overrides: Partial<Game> = {}): Game {
  return {
    id: GAME_ID,
    title: "",
    coverAssetId: null,
    steamAppId: 570,
    importedVia: "manually",
    hoursPlayed: null,
    lastPlayedAt: null,
    achievementsUnlocked: null,
    achievementsTotal: null,
    steamOverrides: {},
    platforms: [],
    tags: [],
    status: "wishlist",
    placement: { tierId: "unranked", rank: 1024 },
    reviewMarkdown: "",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("GamePage Steam store link", () => {
  it("shows store link when manually imported but steamAppId is set", () => {
    render(
      <GamePage
        assets={{}}
        game={baseGame({ importedVia: "manually", steamAppId: 570 })}
        mode="game"
        notes={[]}
        onSave={vi.fn()}
      />,
    );

    const link = screen.getByRole("link", { name: "Steam" });
    expect(link).toHaveAttribute("href", steamStoreAppUrl(570));
  });

  it("does not expose SPA media pull (profile screenshots are CLI-only)", () => {
    render(
      <GamePage
        assets={{}}
        game={baseGame({ steamAppId: 570 })}
        mode="game"
        notes={[]}
        onSave={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Подтянуть медиа Steam" })).toBeNull();
  });
});
