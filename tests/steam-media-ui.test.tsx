import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Game } from "../src/domain/types";
import { steamStoreAppUrl } from "../src/domain/steamMedia";
import { GamePage } from "../src/pages/GamePage";

const NOW = "2026-07-22T12:00:00.000Z";
const GAME_ID = "11111111-1111-4111-8111-111111111111";

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

function baseGame(overrides: Partial<Game> = {}): Game {
  return {
    id: GAME_ID,
    title: "",
    coverAssetId: null,
    steamAppId: 570,
    importedVia: "manually",
    hoursPlayed: null,
    lastPlayedAt: null,
    achievementsUnlocked: null,
    achievementsTotal: null,
    steamOverrides: {},
    platforms: [],
    tags: [],
    status: "wishlist",
    placement: { tierId: "unranked", rank: 1024 },
    reviewMarkdown: "",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function appDetailsBody(appid: number, data: Record<string, unknown>) {
  return { [String(appid)]: { success: true, data } };
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("GamePage Steam store link", () => {
  it("shows store link when manually imported but steamAppId is set", () => {
    render(
      <GamePage
        assets={{}}
        game={baseGame({ importedVia: "manually", steamAppId: 570 })}
        mode="game"
        notes={[]}
        onSave={vi.fn()}
      />,
    );

    const link = screen.getByRole("link", { name: "Steam" });
    expect(link).toHaveAttribute("href", steamStoreAppUrl(570));
  });
});

describe("GamePage Steam prefill", () => {
  it("fills empty title from storefront on new game page", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/appdetails")) {
        return {
          ok: true,
          json: async () =>
            appDetailsBody(570, {
              name: "Dota 2",
              genres: [{ description: "Action" }],
            }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <GamePage assets={{}} mode="new" notes={[]} onCancel={vi.fn()} onSave={vi.fn()} />,
    );

    const input = screen.getByLabelText("Steam appid или URL");
    await user.type(input, "570");
    await user.click(screen.getByRole("button", { name: "Подтянуть из Steam" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Название *")).toHaveValue("Dota 2");
    });
  });

  it("persists prefill for existing game with empty title", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () =>
          appDetailsBody(570, {
            name: "Dota 2",
            genres: [{ description: "Action" }],
          }),
      })),
    );

    render(
      <GamePage
        assets={{}}
        game={baseGame({ title: "", steamAppId: null })}
        mode="game"
        notes={[]}
        onSave={onSave}
      />,
    );

    await user.type(screen.getByLabelText("Steam appid или URL"), "570");
    await user.click(screen.getByRole("button", { name: "Подтянуть из Steam" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });
    const payload = onSave.mock.calls.at(-1)?.[0];
    expect(payload?.title).toBe("Dota 2");
    expect(payload?.steamAppId).toBe(570);
    expect(payload?.importedVia).toBe("steam");
  });
});
