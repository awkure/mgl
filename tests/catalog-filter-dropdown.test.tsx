import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ScreenFilterBar } from "../src/components/ScreenFilterBar";
import type { Game } from "../src/domain/types";

const game: Game = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "DuckTales",
  coverAssetId: null,
  steamAppId: null, importedVia: "manually", hoursPlayed: null, lastPlayedAt: null, steamOverrides: {}, platforms: ["NES"],
  tags: ["platformer"],
  status: "playing",
  placement: { tierId: "a", rank: 1024 },
  reviewMarkdown: "",
  createdAt: "2026-07-16T10:00:00.000Z",
  updatedAt: "2026-07-16T10:00:00.000Z",
};

describe("catalog filter dropdowns", () => {
  it("keeps a filter open when Safari reports no blur destination for an option click", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/games";
    render(<ScreenFilterBar games={[game]} mode="catalog" />);

    await user.click(screen.getByRole("searchbox", { name: "Фильтр игр на экране" }));
    const summary = screen.getByText("Статус").closest("summary")!;
    const dropdown = summary.closest("details")!;

    await user.click(summary);
    expect(dropdown).toHaveAttribute("open");

    const checkbox = await screen.findByRole("checkbox", { name: "Играю" });
    const option = checkbox.closest("label")!;

    fireEvent.blur(summary, { relatedTarget: null });
    await user.click(option);

    expect(checkbox).toBeChecked();
    expect(dropdown).toHaveAttribute("open");
    expect(document.querySelector("[data-filter-menu-portal]")).toBeTruthy();
  });

  it("closes an open filter when the pointer or keyboard focus leaves it", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/games";
    render(<ScreenFilterBar games={[game]} mode="catalog" />);

    await user.click(screen.getByRole("searchbox", { name: "Фильтр игр на экране" }));
    const summary = screen.getByText("Статус").closest("summary")!;
    const dropdown = summary.closest("details")!;
    const tierSummary = screen.getByText("Тир").closest("summary")!;

    await user.click(summary);
    await screen.findByRole("checkbox", { name: "Играю" });
    await user.click(tierSummary);
    expect(dropdown).not.toHaveAttribute("open");

    await user.click(summary);
    await screen.findByRole("checkbox", { name: "Играю" });
    tierSummary.focus();
    expect(dropdown).not.toHaveAttribute("open");
  });
});
