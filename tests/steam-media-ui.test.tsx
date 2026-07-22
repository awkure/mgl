import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Game } from "../src/domain/types";
import { STEAM_MEDIA_NOTE_MARKER, steamMediaNoteBody, steamStoreAppUrl } from "../src/domain/steamMedia";
import { optimizeNoteImage } from "../src/domain/assets";
import { GamePage } from "../src/pages/GamePage";

vi.mock("../src/domain/assets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/domain/assets")>();
  return { ...actual, optimizeNoteImage: vi.fn(actual.optimizeNoteImage) };
});

const NOW = "2026-07-22T12:00:00.000Z";
const GAME_ID = "11111111-1111-4111-8111-111111111111";

class ResizeObserverMock {
  observe() { }
  disconnect() { }
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

describe("GamePage Steam media pull", () => {
  const SCREENSHOT_URL = "https://cdn.example/shot-full.jpg";
  const THUMB_URL = "https://cdn.example/trailer-thumb.jpg";

  function mockOptimizedImage(assetId: string) {
    return {
      asset: {
        id: assetId,
        kind: "image" as const,
        mime: "image/webp",
        width: 1280,
        height: 720,
        alt: "shot",
        originalName: "shot.webp",
      },
      blob: new Blob([assetId], { type: "image/webp" }),
      byteLength: 64,
    };
  }

  beforeEach(() => {
    vi.mocked(optimizeNoteImage).mockImplementation(async (_file, alt) =>
      mockOptimizedImage(`asset-${String(alt).replace(/\W+/g, "-")}`),
    );
  });

  it("disables media pull without steamAppId", () => {
    render(
      <GamePage
        assets={{}}
        game={baseGame({ steamAppId: null })}
        mode="game"
        notes={[]}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Подтянуть медиа Steam" })).toBeDisabled();
  });

  it("disables media pull when storage is locked", () => {
    render(
      <GamePage
        assets={{}}
        game={baseGame({ steamAppId: 570 })}
        mode="game"
        notes={[]}
        onSave={vi.fn()}
        storageLocked
      />,
    );

    expect(screen.getByRole("button", { name: "Подтянуть медиа Steam" })).toBeDisabled();
  });

  it("persists media note with marker and pending screenshot attachments", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/appdetails")) {
          return {
            ok: true,
            json: async () =>
              appDetailsBody(570, {
                name: "Dota 2",
                screenshots: [{ id: 1, path_full: SCREENSHOT_URL, path_thumbnail: "https://cdn.example/thumb.jpg" }],
                movies: [{ id: 10, name: "Launch Trailer", thumbnail: THUMB_URL }],
              }),
          };
        }
        if (url === SCREENSHOT_URL || url === THUMB_URL) {
          return { ok: true, blob: async () => new Blob(["img"], { type: "image/jpeg" }) };
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(
      <GamePage
        assets={{}}
        game={baseGame({ steamAppId: 570, title: "Dota 2" })}
        mode="game"
        notes={[]}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Подтянуть медиа Steam" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });

    const payload = onSave.mock.calls.at(-1)?.[0];
    expect(payload?.notes).toHaveLength(1);
    expect(payload?.notes?.[0]?.bodyMarkdown).toBe(steamMediaNoteBody());
    expect(payload?.notes?.[0]?.bodyMarkdown).toContain(STEAM_MEDIA_NOTE_MARKER);
    const attachments = payload?.notes?.[0]?.attachments ?? [];
    const pendingImages = attachments.filter((item) => item.type === "pending-image");
    expect(pendingImages).toHaveLength(2);
    expect(attachments.some((item) => item.type === "link" && item.label === "Launch Trailer")).toBe(true);
  });
});
