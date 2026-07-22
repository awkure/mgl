import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameCard } from "../src/components/GameCard";
import type { Game } from "../src/domain/types";

const NOW = "2026-07-16T10:00:00.000Z";
const game: Game = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "DuckTales",
  coverAssetId: null,
  steamAppId: null, importedVia: "manually", hoursPlayed: null, platforms: ["NES"],
  tags: [],
  status: "playing",
  placement: { tierId: "a", rank: 1024 },
  reviewMarkdown: "",
  createdAt: NOW,
  updatedAt: NOW,
};

afterEach(() => cleanup());

describe("GameCard click", () => {
  it("prevents default on tier cover without onOpen (drag overlay / drag-mode case)", () => {
    render(<GameCard game={game} isDragging />);
    const cover = screen.getByRole("button", { name: /DuckTales/ });
    expect(cover).not.toHaveAttribute("href");
    const result = fireEvent.click(cover);
    expect(result).toBe(false);
  });

  it("blocks Safari context-menu callout when tier cover has no href", () => {
    render(<GameCard game={game} />);
    const cover = screen.getByRole("button", { name: /DuckTales/ });
    expect(fireEvent.contextMenu(cover)).toBe(false);
  });

  it("prevents default and calls onOpen when provided", () => {
    const onOpen = vi.fn();
    render(<GameCard game={game} onOpen={onOpen} />);
    expect(fireEvent.click(screen.getByRole("link", { name: /DuckTales/ }))).toBe(false);
    expect(onOpen).toHaveBeenCalledWith(game.id);
  });

  it("opens from anywhere on the list card via a single stretched link", () => {
    const onOpen = vi.fn();
    const tagged = { ...game, tags: ["platformer"], platforms: ["NES"] };
    render(<GameCard game={tagged} onOpen={onOpen} variant="list" />);

    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(fireEvent.click(screen.getByText("NES"))).toBe(false);
    expect(onOpen).toHaveBeenCalledWith(game.id);
    onOpen.mockClear();
    expect(fireEvent.click(screen.getByText("platformer"))).toBe(false);
    expect(onOpen).toHaveBeenCalledWith(game.id);
    onOpen.mockClear();
    expect(fireEvent.click(screen.getByText("Играю"))).toBe(false);
    expect(onOpen).toHaveBeenCalledWith(game.id);
  });
});
