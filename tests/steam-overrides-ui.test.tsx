import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withComputedRevision, type Game, type LibraryDatabase } from "../src/domain";
import { GamePage } from "../src/pages/GamePage";
import { LibraryProvider, useLibrary } from "../src/state/LibraryContext";

const GAME_ID = "11111111-1111-4111-8111-111111111111";
const NOW = "2026-07-22T12:00:00.000Z";

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

function steamGame(overrides: Partial<Game> = {}): Game {
  return {
    id: GAME_ID,
    title: "Test Game",
    coverAssetId: null,
    steamAppId: 570,
    importedVia: "steam",
    hoursPlayed: 10,
    lastPlayedAt: "2026-01-01T00:00:00.000Z",
    steamOverrides: {},
    platforms: ["Steam"],
    tags: ["Action"],
    status: "played",
    placement: { tierId: "a", rank: 2048 },
    reviewMarkdown: "",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function seededDatabase(game: Game): LibraryDatabase {
  return withComputedRevision({ schemaVersion: 2, revision: "", publicationId: null, games: { [game.id]: game }, notes: {}, assets: {} });
}

function mockStaticDatabase(database: LibraryDatabase) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => structuredClone(database),
  }));
}

function SaveTitleProbe() {
  const library = useLibrary();
  const current = library.effective.games[GAME_ID];
  return (
    <div>
      <span data-testid="loading">{String(library.loading)}</span>
      <span data-testid="overrides">{JSON.stringify(current?.steamOverrides ?? null)}</span>
      <button
        onClick={() => {
          if (!current) return;
          void library.saveGame({
            id: current.id,
            title: "Renamed in UI",
            coverAssetId: current.coverAssetId,
            steamAppId: current.steamAppId,
            importedVia: current.importedVia,
            platforms: current.platforms,
            tags: current.tags,
            status: current.status,
            tierId: current.placement.tierId,
            reviewMarkdown: current.reviewMarkdown,
            notes: [],
          });
        }}
        type="button"
      >
        Save title
      </button>
    </div>
  );
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("GamePage Steam override hint", () => {
  it("shows protection copy when steamOverrides has keys", () => {
    render(
      <GamePage
        assets={{}}
        game={steamGame({ steamOverrides: { title: true } })}
        mode="game"
        notes={[]}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByText("поля защищены от Steam")).toBeInTheDocument();
  });

  it("hides protection copy when steamOverrides is empty", () => {
    render(
      <GamePage
        assets={{}}
        game={steamGame()}
        mode="game"
        notes={[]}
        onSave={vi.fn()}
      />,
    );
    expect(screen.queryByText("поля защищены от Steam")).not.toBeInTheDocument();
  });
});

describe("LibraryContext saveGame auto-mark", () => {
  it("sets steamOverrides.title after renaming a Steam game", async () => {
    mockStaticDatabase(seededDatabase(steamGame()));
    render(
      <LibraryProvider>
        <SaveTitleProbe />
      </LibraryProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    screen.getByRole("button", { name: "Save title" }).click();
    await waitFor(() => {
      expect(screen.getByTestId("overrides")).toHaveTextContent('"title":true');
    });
  });
});
