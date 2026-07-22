import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPublishedHistory } from "../src/state/loadPublishedHistory";

describe("loadPublishedHistory", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("fetches history.json with cache: no-store and a cache-bust query", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ schemaVersion: 1, events: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await loadPublishedHistory();

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("history.json");
    expect(String(url)).toMatch(/[?&]_=\d+/);
    expect(init).toMatchObject({ cache: "no-store" });
  });

  it("returns events array from a valid history payload", async () => {
    const events = [
      {
        id: "e1",
        at: "2026-01-01T00:00:00.000Z",
        entity: "game",
        entityId: "g1",
        op: "create",
        field: null,
        before: null,
        after: { title: "X" },
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ schemaVersion: 1, events }),
      }),
    );

    await expect(loadPublishedHistory()).resolves.toEqual(events);
  });

  it("throws on non-OK HTTP status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({}),
      }),
    );

    await expect(loadPublishedHistory()).rejects.toThrow(/HTTP 404/);
  });
});
