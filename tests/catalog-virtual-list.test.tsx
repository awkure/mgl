import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CATALOG_SINGLE_COLUMN_QUERY,
  CatalogVirtualList,
} from "../src/components/CatalogVirtualList";
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

type MatchMediaMock = {
  setMatches: (matches: boolean) => void;
  listeners: Set<(event: MediaQueryListEvent) => void>;
};

function mockCatalogMatchMedia(initialNarrow: boolean): MatchMediaMock {
  let matches = initialNarrow;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();

  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => {
      const isCatalogQuery = query === CATALOG_SINGLE_COLUMN_QUERY;
      return {
        get matches() {
          return isCatalogQuery ? matches : false;
        },
        media: query,
        onchange: null,
        addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
          if (typeof listener === "function") {
            listeners.add(listener as (event: MediaQueryListEvent) => void);
          }
        },
        removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
          if (typeof listener === "function") {
            listeners.delete(listener as (event: MediaQueryListEvent) => void);
          }
        },
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      } as MediaQueryList;
    }),
  );

  return {
    listeners,
    setMatches(next: boolean) {
      matches = next;
      const event = { matches } as MediaQueryListEvent;
      for (const listener of listeners) {
        listener(event);
      }
    },
  };
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  mockCatalogMatchMedia(false);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("CatalogVirtualList", () => {
  it("mounts only a visible subset at the single-column breakpoint", async () => {
    mockCatalogMatchMedia(true);
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

  it("renders the full grid without virtual classes on wide viewports", () => {
    mockCatalogMatchMedia(false);
    const games = Array.from({ length: 40 }, (_, index) => makeGame(index));
    const scrollElement = mockScrollElement(180);

    render(
      <CatalogVirtualList assets={{}} games={games} scrollElement={scrollElement} />,
    );

    expect(screen.getAllByRole("link")).toHaveLength(games.length);
    expect(document.querySelector(".catalog-list--virtual")).toBeNull();
    expect(document.querySelector(".catalog-list")).toBeTruthy();
  });

  it("switches between virtual and full grid when matchMedia changes", async () => {
    const media = mockCatalogMatchMedia(false);
    const games = Array.from({ length: 40 }, (_, index) => makeGame(index));
    const scrollElement = mockScrollElement(180);

    render(
      <CatalogVirtualList assets={{}} games={games} scrollElement={scrollElement} />,
    );

    expect(screen.getAllByRole("link")).toHaveLength(games.length);

    await act(async () => {
      media.setMatches(true);
    });

    await waitFor(() => {
      expect(document.querySelector(".catalog-list--virtual")).toBeTruthy();
      expect(screen.getAllByRole("link").length).toBeLessThan(games.length);
    });
  });

  it("renders the full list and warns once when scroll root is missing", () => {
    mockCatalogMatchMedia(true);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const games = [makeGame(1), makeGame(2), makeGame(3)];

    render(<CatalogVirtualList assets={{}} games={games} scrollElement={null} />);

    expect(screen.getAllByRole("link")).toHaveLength(3);
    expect(document.querySelector(".catalog-list--virtual")).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("scroll root missing");
  });

  it("forwards open-game clicks", () => {
    mockCatalogMatchMedia(true);
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
