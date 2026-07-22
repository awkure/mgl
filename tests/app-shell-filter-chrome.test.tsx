import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "../src/components/AppShell";

vi.stubGlobal("matchMedia", (query: string) => ({
  matches: query.includes("max-width") || query.includes("pointer: coarse"),
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
  onchange: null,
}));

describe("AppShell filter chrome", () => {
  it("keeps search in the header on catalog root and shows the filter field", () => {
    window.location.hash = "#/games";
    const { container } = render(
      <AppShell games={[]} onOpenDiff={vi.fn()} route="catalog" storage={{ bytes: 0, operationCount: 0 }}>
        <div>body</div>
      </AppShell>,
    );
    expect(container.querySelector(".app-search-bar")).toBeNull();
    expect(screen.getByRole("combobox", { name: "Глобальный поиск игр" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Фильтр игр на экране" })).toBeInTheDocument();
  });

  it("hides the filter field off tab roots but keeps search", () => {
    window.location.hash = "#/games/x";
    render(
      <AppShell games={[]} onOpenDiff={vi.fn()} route="game" storage={{ bytes: 0, operationCount: 0 }}>
        <div>body</div>
      </AppShell>,
    );
    expect(screen.getByRole("combobox", { name: "Глобальный поиск игр" })).toBeInTheDocument();
    expect(screen.queryByRole("searchbox", { name: "Фильтр игр на экране" })).not.toBeInTheDocument();
  });
});
