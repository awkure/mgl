import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CATALOG_SORT_STORAGE_KEY, saveCatalogSort } from "../src/domain/catalogSort";
import { CatalogPage } from "../src/pages/CatalogPage";
import type { Game } from "../src/domain/types";

const NOW = "2026-07-16T10:00:00.000Z";

function game(partial: Partial<Game> & Pick<Game, "id" | "title">): Game {
  return {
    coverAssetId: null,
    steamAppId: null,
    importedVia: "manually",
    hoursPlayed: null,
    lastPlayedAt: null, achievementsUnlocked: null, achievementsTotal: null, steamOverrides: {},
    platforms: ["PC"],
    tags: [],
    status: "played",
    placement: { tierId: "unranked", rank: 1024 },
    reviewMarkdown: "",
    createdAt: NOW,
    updatedAt: NOW,
    ...partial,
  };
}

describe("CatalogPage sort", () => {
  it("orders by stored catalog sort", () => {
    window.localStorage.clear();
    saveCatalogSort(window.localStorage, { key: "title", dir: "asc" });
    window.location.hash = "#/games";
    const games = [
      game({ id: "11111111-1111-4111-8111-111111111111", title: "Zelda", updatedAt: "2026-07-17T00:00:00.000Z" }),
      game({ id: "22222222-2222-4222-8222-222222222222", title: "Asteroids", updatedAt: "2026-07-18T00:00:00.000Z" }),
    ];
    render(<CatalogPage assets={{}} games={games} />);
    const titles = screen.getAllByRole("link").map((node) => node.textContent);
    expect(titles[0]).toContain("Asteroids");
    expect(titles[1]).toContain("Zelda");
  });

  it("does not write sort into the hash when changing filters", () => {
    window.localStorage.clear();
    window.localStorage.setItem(CATALOG_SORT_STORAGE_KEY, JSON.stringify({ key: "hoursPlayed", dir: "asc" }));
    window.location.hash = "#/games";
    render(<CatalogPage assets={{}} games={[game({ id: "11111111-1111-4111-8111-111111111111", title: "Duck" })]} />);
    expect(window.location.hash).not.toContain("sort=");
    expect(window.location.hash).not.toContain("hoursPlayed");
  });
});
