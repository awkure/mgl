import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ScreenFilterBar } from "../src/components/ScreenFilterBar";
import { ScreenFiltersProvider } from "../src/components/screenFilters";
import type { Game } from "../src/domain/types";

const game: Game = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "DuckTales",
  coverAssetId: null,
  steamAppId: null, importedVia: "manually", hoursPlayed: null,
  lastPlayedAt: null, achievementsUnlocked: null, achievementsTotal: null, steamOverrides: {},
  platforms: ["NES"], tags: ["platformer"], status: "playing",
  placement: { tierId: "a", rank: 1024 },
  reviewMarkdown: "",
  createdAt: "2026-07-16T10:00:00.000Z",
  updatedAt: "2026-07-16T10:00:00.000Z",
};

describe("ScreenFilterBar", () => {
  it("expands to show facet menus on focus", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/games";
    render(<ScreenFilterBar games={[game]} mode="catalog" />);
    expect(screen.queryByText("Статус")).not.toBeInTheDocument();
    await user.click(screen.getByRole("searchbox", { name: "Фильтр игр на экране" }));
    expect(screen.getByText("Статус")).toBeInTheDocument();
    expect(screen.getByText("Тир")).toBeInTheDocument();
    expect(screen.getByText("Сортировка")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "По убыванию" })).toHaveAttribute("aria-pressed", "true");
  });

  it("persists catalog sort without touching the hash", async () => {
    const user = userEvent.setup();
    window.localStorage.clear();
    window.location.hash = "#/games";
    render(<ScreenFilterBar games={[game]} mode="catalog" />);
    await user.click(screen.getByRole("searchbox", { name: "Фильтр игр на экране" }));
    await user.click(screen.getByText("Сортировка"));
    await user.click(screen.getByRole("radio", { name: /Название/ }));
    expect(window.location.hash).toBe("#/games");
    expect(JSON.parse(window.localStorage.getItem("my-game-library.catalog-sort.v1")!)).toEqual({
      key: "title",
      dir: "desc",
    });
  });

  it("resets direction to desc when the sort key changes", async () => {
    const user = userEvent.setup();
    window.localStorage.clear();
    window.location.hash = "#/games";
    render(<ScreenFilterBar games={[game]} mode="catalog" />);
    await user.click(screen.getByRole("searchbox", { name: "Фильтр игр на экране" }));
    await user.click(screen.getByRole("button", { name: "По возрастанию" }));
    expect(screen.getByRole("button", { name: "По возрастанию" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByText("Сортировка"));
    await user.click(screen.getByRole("radio", { name: /Последняя игра/ }));
    expect(screen.getByRole("button", { name: "По убыванию" })).toHaveAttribute("aria-pressed", "true");
    expect(JSON.parse(window.localStorage.getItem("my-game-library.catalog-sort.v1")!)).toEqual({
      key: "lastPlayed",
      dir: "desc",
    });
  });

  it("writes catalog hash on text change", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/games";
    render(<ScreenFilterBar games={[game]} mode="catalog" />);
    await user.type(screen.getByRole("searchbox", { name: "Фильтр игр на экране" }), "Duck");
    expect(window.location.hash).toContain("q=Duck");
  });

  it("updates tier session filters without touching the hash", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/tiers";
    render(
      <ScreenFiltersProvider>
        <ScreenFilterBar games={[game]} mode="tier" />
      </ScreenFiltersProvider>,
    );
    await user.type(screen.getByRole("searchbox", { name: "Фильтр игр на экране" }), "Duck");
    expect(window.location.hash).toBe("#/tiers");
  });
});
