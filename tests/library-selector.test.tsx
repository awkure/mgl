import { act, renderHook } from "@testing-library/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import {
  LIBRARY_SCHEMA_VERSION,
  type LibraryDatabase,
} from "../src/domain";
import type { LibraryContextValue } from "../src/state/LibraryContext";
import { LibraryProvider, useLibrary } from "../src/state/LibraryContext";
import {
  activateLibraryStore,
  deactivateLibraryStore,
  getLibrarySnapshot,
  publishLibrarySnapshot,
  useLibrarySelector,
} from "../src/state/libraryStore";
import { emptyPatch } from "../src/state/libraryPatchHelpers";

const noop = () => undefined;
const noopAsync = async () => "";
const noopSyncResult = async () => ({
  status: "up-to-date" as const,
  commitSha: "",
  commitUrl: "",
  pagesPending: false,
});

function emptyDatabase(): LibraryDatabase {
  return {
    schemaVersion: LIBRARY_SCHEMA_VERSION,
    revision: "",
    publicationId: null,
    games: {},
    notes: {},
    assets: {},
  };
}

function minimalSnapshot(
  games: LibraryDatabase["games"],
  persistenceError: string | null,
): LibraryContextValue {
  const base = emptyDatabase();
  return {
    base,
    effective: { ...base, games },
    patch: emptyPatch(""),
    conflicts: [],
    pendingPublication: null,
    loading: false,
    fatalError: null,
    persistenceError,
    corruptedPatchRaw: null,
    usage: { level: "ok", bytes: 0, budget: 0, ratio: 0, remainingBytes: 0 },
    storageEstimate: null,
    quotaStatus: { usage: null, quota: null, remaining: null, ratio: null, level: "unknown" },
    persistentStorage: false,
    attachmentsBlocked: false,
    localAssets: [],
    localAssetBytes: 0,
    games,
    canAddBlob: noopAsync,
    resolveAssetUrl: () => null,
    saveGame: noopAsync,
    deleteGame: noop,
    moveGame: noop,
    discardPath: noop,
    discardPaths: noop,
    clearPatch: noop,
    resolvePatchConflict: noop,
    importPatch: async () => undefined,
    undoLast: () => false,
    downloadCorruptedPatch: noop,
    exportRecoveryArchive: async () => undefined,
    deleteAllLocalAssets: async () => undefined,
    verifyGitHubAccess: async () => undefined,
    syncToGitHub: noopSyncResult,
    refreshFromPublished: async () => undefined,
  };
}

describe("useLibrarySelector", () => {
  it("throws outside LibraryProvider with the same message as useLibrary", () => {
    expect(() => renderHook(() => useLibrary())).toThrow("useLibrary must be used inside LibraryProvider");
    expect(() => renderHook(() => useLibrarySelector((s) => s.games))).toThrow(
      "useLibrary must be used inside LibraryProvider",
    );
  });

  it("returns the same games reference when only persistenceError changes", () => {
    const gamesRef = { current: {} as LibraryDatabase["games"] };
    let setPersistenceTick: (next: number) => void = () => undefined;

    function Harness({ children }: { children: ReactNode }) {
      const [tick, setTick] = useState(0);
      setPersistenceTick = setTick;
      const games = gamesRef.current;
      const snap = useMemo(
        () => minimalSnapshot(games, tick === 0 ? null : "Safari rejected write"),
        [games, tick],
      );
      activateLibraryStore();
      publishLibrarySnapshot(snap);
      useEffect(() => () => deactivateLibraryStore(), []);
      return children;
    }

    const { result, rerender, unmount } = renderHook(() => useLibrarySelector((s) => s.games), {
      wrapper: Harness,
    });

    const firstGames = result.current;
    act(() => setPersistenceTick(1));
    rerender();
    expect(result.current).toBe(firstGames);
    expect(result.current).toBe(gamesRef.current);
    unmount();
  });
});

describe("LibraryProvider store publish", () => {
  it("publishes snapshots while mounted", () => {
    const { unmount } = renderHook(() => useLibrarySelector((s) => s.loading), {
      wrapper: ({ children }) => (
        <LibraryProvider>
          {children}
        </LibraryProvider>
      ),
    });
    unmount();
    expect(() => getLibrarySnapshot()).toThrow("useLibrary must be used inside LibraryProvider");
  });
});
