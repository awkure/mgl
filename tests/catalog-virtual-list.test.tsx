import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogVirtualList } from "../src/components/CatalogVirtualList";
import { CatalogPage } from "../src/pages/CatalogPage";
import type { Game } from "../src/domain/types";

const NOW = "2026-07-16T10:00:00.000Z";

function makeGame(index: number): Game {
  const id = `${String(index).padStart(8, "0")}-1111-4111-8111-111111111111`;
  return {
    id,
    title: `Game ${index}`,
    coverAssetId: null,
    steamAppId: null,
    importedVia: "manually",
    hoursPlayed: null,
    platforms: ["NES"],
    tags: [],
    status: "playing",
    placement: { tierId: "a", rank: 1024 + index },
    reviewMarkdown: "",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function mockScrollElement(viewportHeight = 200) {
  const el = document.createElement("div");
  Object.defineProperty(el, "clientHeight", { configurable: true, value: viewportHeight });
  Object.defineProperty(el, "offsetHeight", { configurable: true, value: viewportHeight });
  Object.defineProperty(el, "offsetWidth", { configurable: true, value: 400 });
  Object.defineProperty(el, "scrollHeight", { configurable: true, value: 10_000 });
  Object.defineProperty(el, "scrollTop", { configurable: true, writable: true, value: 0 });
  el.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    width: 400,
    height: viewportHeight,
    top: 0,
    left: 0,
    right: 400,
    bottom: viewportHeight,
    toJSON: () => ({}),
  });
  document.body.appendChild(el);
  return el;
}

class ResizeObserverMock {
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    const rect = target.getBoundingClientRect();
    this.callback([
      {
        target,
        contentRect: rect,
        borderBoxSize: [{ inlineSize: rect.width, blockSize: rect.height }],
        contentBoxSize: [{ inlineSize: rect.width, blockSize: rect.height }],
        devicePixelContentBoxSize: [{ inlineSize: rect.width, blockSize: rect.height }],
      } as ResizeObserverEntry,
    ], this);
  }

  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("CatalogVirtualList", () => {
  it("mounts only a visible subset when a scroll root is provided", async () => {
    const games = Array.from({ length: 40 }, (_, index) => makeGame(index));
    const scrollElement = mockScrollElement(180);

    render(
      <CatalogVirtualList assets={{}} games={games} scrollElement={scrollElement} />,
    );

    await waitFor(() => {
      const titles = screen.queryAllByRole("link").map((node) => node.textContent?.trim());
      expect(titles.length).toBeGreaterThan(0);
      expect(titles.length).toBeLessThan(games.length);
    });

    expect(document.querySelector(".catalog-list--virtual")).toBeTruthy();
  });

  it("renders the full list and warns once when scroll root is missing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const games = [makeGame(1), makeGame(2), makeGame(3)];

    render(<CatalogVirtualList assets={{}} games={games} scrollElement={null} />);

    expect(screen.getAllByRole("link")).toHaveLength(3);
    expect(document.querySelector(".catalog-list--virtual")).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("scroll root missing");
  });

  it("forwards open-game clicks", () => {
    const onOpenGame = vi.fn();
    const games = [makeGame(0)];
    render(
      <CatalogVirtualList
        assets={{}}
        games={games}
        onOpenGame={onOpenGame}
        scrollElement={mockScrollElement()}
      />,
    );

    fireEvent.click(screen.getByRole("link", { name: "Game 0" }));
    expect(onOpenGame).toHaveBeenCalledWith(games[0]!.id);
  });
});

describe("CatalogPage virtualization wiring", () => {
  it("keeps filter chips outside the game list", () => {
    window.location.hash = "#/games?status=playing";
    const games = Array.from({ length: 30 }, (_, index) => makeGame(index));

    render(<CatalogPage active assets={{}} games={games} scrollSelf />);

    const chipRegion = screen.getByRole("region", { name: "Активные фильтры" });
    expect(within(chipRegion).getByText("Играю")).toBeTruthy();
    const list = document.querySelector(".catalog-list");
    expect(list).toBeTruthy();
    expect(chipRegion.compareDocumentPosition(list!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("shows empty state without mounting virtual rows", () => {
    window.location.hash = "#/games?q=missing";
    const games = [makeGame(0)];

    render(<CatalogPage active assets={{}} games={games} scrollSelf />);

    expect(screen.getByRole("heading", { name: "Ничего не найдено" })).toBeTruthy();
    expect(document.querySelector(".catalog-list")).toBeNull();
  });
});
