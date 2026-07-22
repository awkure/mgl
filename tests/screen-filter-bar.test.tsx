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
    window.location.hash = "#/";
    render(
      <ScreenFiltersProvider>
        <ScreenFilterBar games={[game]} mode="tier" />
      </ScreenFiltersProvider>,
    );
    await user.type(screen.getByRole("searchbox", { name: "Фильтр игр на экране" }), "Duck");
    expect(window.location.hash).toBe("#/");
  });
});
