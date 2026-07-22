import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameCard } from "../src/components/GameCard";
import type { Game } from "../src/domain/types";
import { GamePage } from "../src/pages/GamePage";

const NOW = "2026-07-16T10:00:00.000Z";

function baseGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "DuckTales",
    coverAssetId: null,
    steamAppId: 570,
    importedVia: "steam",
    hoursPlayed: null,
    lastPlayedAt: null,
    achievementsUnlocked: null,
    achievementsTotal: null,
    steamOverrides: {},
    platforms: ["Steam"],
    tags: [],
    status: "playing",
    placement: { tierId: "a", rank: 1024 },
    reviewMarkdown: "",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

afterEach(() => cleanup());

describe("GameCard Steam achievements", () => {
  it("shows progress bar on list variant when counts are known", () => {
    render(
      <GameCard
        game={baseGame({ achievementsUnlocked: 12, achievementsTotal: 40 })}
        variant="list"
      />,
    );

    const block = screen.getByLabelText("Достижения: 12 из 40");
    expect(block).toHaveClass("game-card__achievements");
    expect(within(block).getByText("12/40")).toBeInTheDocument();
    const fill = block.querySelector(".game-card__achievements-fill");
    expect(fill).toHaveStyle({ width: "30%" });
  });

  it("does not show achievements bar on tier variant", () => {
    render(
      <GameCard
        game={baseGame({ achievementsUnlocked: 12, achievementsTotal: 40 })}
        onOpen={vi.fn()}
        variant="tier"
      />,
    );

    expect(screen.queryByLabelText(/Достижения:/)).not.toBeInTheDocument();
  });

  it("does not show achievements bar on list when total is zero", () => {
    render(
      <GameCard
        game={baseGame({ achievementsUnlocked: 0, achievementsTotal: 0 })}
        variant="list"
      />,
    );

    expect(screen.queryByLabelText(/Достижения:/)).not.toBeInTheDocument();
  });
});

describe("GamePage achievements meta", () => {
  it("shows unlocked/total after last played row", () => {
    render(
      <GamePage
        assets={{}}
        game={baseGame({
          achievementsUnlocked: 12,
          achievementsTotal: 40,
          lastPlayedAt: "2026-01-01T00:00:00.000Z",
        })}
        mode="game"
        notes={[]}
        onSave={vi.fn()}
      />,
    );

    const meta = document.querySelector("dl.game-sidebar__meta");
    expect(meta).toBeTruthy();
    const rows = Array.from(meta!.children);
    const lastPlayedIndex = rows.findIndex((row) => row.textContent?.includes("Последняя игра"));
    const achievementsIndex = rows.findIndex((row) => row.textContent?.includes("Достижения"));
    expect(lastPlayedIndex).toBeGreaterThanOrEqual(0);
    expect(achievementsIndex).toBe(lastPlayedIndex + 1);
    expect(within(rows[achievementsIndex] as HTMLElement).getByText("12/40")).toBeInTheDocument();
  });

  it("shows em dash when achievement counts are unknown", () => {
    render(
      <GamePage assets={{}} game={baseGame()} mode="game" notes={[]} onSave={vi.fn()} />,
    );

    const row = screen.getByText("Достижения").closest("div");
    expect(row).toBeTruthy();
    expect(within(row as HTMLElement).getByText("—")).toBeInTheDocument();
  });
});
