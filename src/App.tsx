import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HashRouter,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  AppShell,
  DiffDialog,
  type AppRoute,
  type DiffSyncController,
  type DiffItem,
} from "./components";
import {
  PATCH_STORAGE_KEY,
  parsePatchPath,
  webkitStringBytes,
  type Asset,
  type PatchEnvelope,
} from "./domain";
import { assetMeta, assetSummary, classifyDiff, entityName, fieldLabels } from "./App/diffModel";
import { GameRouteIsland, gameIdFromPath } from "./App/routeIslands";
import { SwipePager } from "./components/SwipePager";
import { LibraryProvider, useLibrary } from "./state/LibraryContext";
import {
  PUBLISH_CLIPBOARD_COMMAND,
  copyText,
  createPublishPayload,
} from "./state/publishCommand";
import {
  GITHUB_REPOSITORY_NAME,
  GITHUB_REPOSITORY_OWNER,
  clearGitHubPat,
  getGitHubPatCreationUrl,
  loadGitHubPat,
  saveGitHubPat,
  type GitHubPatPersistence,
} from "./state/githubPat";
import {
  createInitialTabStacksState,
  entryFromPath,
  isTabRoot,
  locationHref,
  popTab,
  pushOntoTab,
  selectTab,
  stackTop,
  syncFromLocation,
  tabIdFromPath,
  tabProgressFromTabId,
  type StackEntry,
  type TabId,
  type TabStacksState,
  TAB_ROOTS,
} from "./state/tabStacks";
function routeKind(pathname: string): AppRoute {
  if (pathname === "/") return "tiers";
  if (pathname === "/games") return "catalog";
  if (pathname === "/games/new") return "new";
  if (pathname === "/settings") return "settings";
  if (pathname.startsWith("/games/")) return "game";
  return "catalog";
}

function parseHref(href: string): StackEntry {
  const raw = href.startsWith("#") ? href.slice(1) || "/" : href;
  const [pathPart, searchPart] = raw.split("?");
  return entryFromPath(pathPart || "/", searchPart);
}

function overlayEntry(state: TabStacksState, tab: TabId): StackEntry | null {
  const top = stackTop(state, tab);
  if (!top || isTabRoot(tab, top)) return null;
  return top;
}

function LibraryRoutes() {
  const library = useLibrary();
  const navigate = useNavigate();
  const location = useLocation();
  const mainRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const tierDraggingRef = useRef(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [preparedPayload, setPreparedPayload] = useState<{ patch: PatchEnvelope; payload: string } | null>(null);
  const [publishFailure, setPublishFailure] = useState<{ patch: PatchEnvelope; message: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const githubPatRef = useRef<string | null>(null);
  const [githubPatPersistence, setGitHubPatPersistence] = useState<GitHubPatPersistence | null>(null);
  const [githubSyncState, setGitHubSyncState] = useState<{
    busy: boolean;
    stage: DiffSyncController["stage"];
    error: string | null;
    commitUrl?: string;
  }>({ busy: false, stage: "idle", error: null });
  const previousPendingCommitRef = useRef<string | null>(null);
  const [tabState, setTabState] = useState<TabStacksState>(() =>
    createInitialTabStacksState(entryFromPath(location.pathname, location.search.replace(/^\?/, "") || undefined)),
  );

  const activeTop = stackTop(tabState) ?? TAB_ROOTS[tabState.activeTab];
  const route = routeKind(activeTop.pathname);
  const catalogAtRoot = !overlayEntry(tabState, "catalog");

  const setPagerProgress = useCallback((progress: number) => {
    shellRef.current?.style.setProperty("--pager-progress", String(progress));
  }, []);

  const setPagerDragging = useCallback((dragging: boolean) => {
    const shell = shellRef.current;
    if (!shell) return;
    if (dragging) shell.setAttribute("data-pager-dragging", "true");
    else shell.removeAttribute("data-pager-dragging");
  }, []);

  useEffect(() => {
    setPagerProgress(tabProgressFromTabId(tabState.activeTab));
  }, [tabState.activeTab, setPagerProgress]);

  useEffect(() => {
    const entry = entryFromPath(location.pathname, location.search.replace(/^\?/, "") || undefined);
    setTabState((current) => syncFromLocation(current, entry));
  }, [location.pathname, location.search]);

  const goToEntry = useCallback((entry: StackEntry, replace = false) => {
    navigate(locationHref(entry), { replace });
  }, [navigate]);

  const activateTabAndSync = useCallback((tab: TabId) => {
    setTabState((current) => {
      const resolved = selectTab(current, tab);
      goToEntry(stackTop(resolved) ?? TAB_ROOTS[tab], true);
      return resolved;
    });
  }, [goToEntry]);

  const openGameOnTab = useCallback((tab: TabId, gameId: string) => {
    const entry = entryFromPath(`/games/${encodeURIComponent(gameId)}`);
    setTabState((current) => pushOntoTab(current, tab, entry));
    goToEntry(entry);
  }, [goToEntry]);

  const popStack = useCallback((tab: TabId) => {
    setTabState((current) => {
      const next = popTab(current, tab);
      if (current.activeTab === tab) {
        goToEntry(stackTop(next, tab) ?? TAB_ROOTS[tab], true);
      }
      return next;
    });
  }, [goToEntry]);

  const navigateHref = useCallback((href: string) => {
    const entry = parseHref(href);
    const path = entry.pathname;

    if (path === "/games/new" || gameIdFromPath(path)) {
      setTabState((current) => pushOntoTab(current, "catalog", entry));
      goToEntry(entry);
      return;
    }

    if (path === "/games") {
      setTabState((current) => ({
        activeTab: "catalog",
        stacks: { ...current.stacks, catalog: [entry] },
      }));
      goToEntry(entry, true);
      return;
    }

    if (path === "/" || path === "/settings") {
      const tab = tabIdFromPath(path);
      setTabState((current) => ({
        activeTab: tab,
        stacks: { ...current.stacks, [tab]: [entry] },
      }));
      goToEntry(entry, true);
      return;
    }

    goToEntry(entry);
  }, [goToEntry]);

  useEffect(() => {
    const loaded = loadGitHubPat();
    if (loaded.ok) {
      githubPatRef.current = loaded.token;
      setGitHubPatPersistence(loaded.persistence);
    } else {
      setGitHubSyncState((current) => ({ ...current, error: loaded.error === "invalid-token" ? "Сохранённый PAT повреждён" : "Safari не разрешил прочитать сохранённый PAT" }));
    }
  }, []);

  const games = useMemo(() => Object.values(library.effective.games), [library.effective.games]);
  const operationEntries = useMemo(() => Object.entries(library.patch.operations), [library.patch.operations]);
  const publishPayload = preparedPayload?.patch === library.patch ? preparedPayload.payload : "";
  const publishError = publishFailure?.patch === library.patch ? publishFailure.message : null;
  const publishPayloadPreparing = operationEntries.length > 0 && !publishPayload && !publishError;
  const patchBytes = useMemo(
    () => webkitStringBytes(PATCH_STORAGE_KEY, JSON.stringify(library.patch)),
    [library.patch],
  );

  useEffect(() => {
    if (githubSyncState.stage !== "complete" || !operationEntries.length) return;
    setGitHubSyncState((current) => ({ ...current, stage: "idle", commitUrl: undefined }));
  }, [githubSyncState.stage, library.patch, operationEntries.length]);

  useEffect(() => {
    const commitSha = library.pendingPublication?.commitSha ?? null;
    if (previousPendingCommitRef.current && !commitSha) {
      setGitHubSyncState((current) => ({ ...current, stage: "idle", commitUrl: undefined }));
    }
    previousPendingCommitRef.current = commitSha;
  }, [library.pendingPublication]);

  useEffect(() => {
    let active = true;
    if (!operationEntries.length) {
      setPreparedPayload(null);
      setPublishFailure(null);
      return () => { active = false; };
    }
    const patch = library.patch;
    void createPublishPayload(patch).then((payload) => {
      if (!active) return;
      setPreparedPayload({ patch, payload });
      setPublishFailure(null);
    }).catch((error) => {
      if (!active) return;
      setPreparedPayload(null);
      setPublishFailure({
        patch,
        message: `Не удалось подготовить патч: ${error instanceof Error ? error.message : String(error)}`,
      });
    });
    return () => { active = false; };
  }, [library.patch, operationEntries.length]);

  const items = useMemo<DiffItem[]>(() => operationEntries.map(([path, operation]) => {
    const parsed = parsePatchPath(path);
    const name = parsed ? entityName(parsed.map, parsed.id, operation, library.effective, library.base) : path;
    const field = parsed?.field ? fieldLabels[parsed.field] ?? parsed.field : undefined;
    const asset = parsed?.map === "assets"
      ? (operation.operation === "set" ? operation.value as Asset : library.base.assets[parsed.id])
      : undefined;
    return {
      id: path,
      group: classifyDiff(path, operation),
      title: name,
      detail: field ?? (operation.operation === "delete" ? "Удаление" : operation.baseExists ? "Замена" : "Новая запись"),
      meta: assetMeta(asset),
      transactionId: operation.transactionId,
    };
  }), [library.base, library.effective, operationEntries]);

  const conflictItems = useMemo(() => library.conflicts.map((conflict) => {
    const parsed = parsePatchPath(conflict.path);
    return {
      id: conflict.path,
      path: conflict.path,
      label: parsed
        ? `${entityName(parsed.map, parsed.id, conflict.operation, library.effective, library.base)}${parsed.field ? ` · ${fieldLabels[parsed.field] ?? parsed.field}` : ""}`
        : conflict.path,
      staticValue: conflict.staticExists ? (parsed?.map === "assets" ? assetSummary(conflict.staticValue) : conflict.staticValue) : "(отсутствует)",
      localValue: conflict.operation.operation === "delete" ? "(удалено локально)" : parsed?.map === "assets" ? assetSummary(conflict.operation.value) : conflict.operation.value,
      canMergeManually: parsed?.map !== "assets",
    };
  }), [library.base, library.conflicts, library.effective]);

  const showError = (error: unknown) => setActionError(error instanceof Error ? error.message : String(error));
  const exportPatch = () => { void library.exportRecoveryArchive().catch(showError); };
  const freeLocalAssetSpace = () => {
    if (!window.confirm("Удалить все локальные копии вложений? Неопубликованные ссылки на них также будут удалены; текст сохранится.")) return;
    void library.deleteAllLocalAssets().catch(showError);
  };
  const copyPatch = async () => {
    try {
      await copyText(publishPayload);
      return true;
    } catch {
      return false;
    }
  };

  const syncWithGitHub = async (token: string) => {
    setGitHubSyncState((current) => ({ ...current, busy: true, stage: "connecting", error: null }));
    try {
      const result = await library.syncToGitHub(token, (stage) => {
        setGitHubSyncState((current) => ({ ...current, busy: true, stage }));
      });
      setGitHubSyncState({ busy: false, stage: "complete", error: null, commitUrl: result.commitUrl });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Не удалось синхронизировать библиотеку";
      if (message.startsWith("GitHub отклонил PAT")) {
        clearGitHubPat();
        githubPatRef.current = null;
        setGitHubPatPersistence(null);
      }
      setGitHubSyncState((current) => ({ ...current, busy: false, stage: "idle", error: message }));
      throw reason;
    }
  };

  const connectGitHubWithoutSync = async (token: string) => {
    setGitHubSyncState((current) => ({ ...current, busy: true, stage: "connecting", error: null, commitUrl: undefined }));
    try {
      await library.verifyGitHubAccess(token);
      setGitHubSyncState({ busy: false, stage: "idle", error: null });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Не удалось проверить доступ к GitHub";
      setGitHubSyncState((current) => ({ ...current, busy: false, stage: "idle", error: message }));
      throw reason;
    }
  };

  const connectAndSyncGitHub = async (token: string, remember: boolean) => {
    const saved = saveGitHubPat(token, remember);
    if (!saved.ok) {
      throw new Error(saved.error === "invalid-token"
        ? "Нужен fine-grained PAT в формате github_pat_…"
        : "Safari не разрешил сохранить PAT");
    }
    const loaded = loadGitHubPat();
    if (!loaded.ok || !loaded.token || !loaded.persistence) {
      clearGitHubPat();
      throw new Error("Не удалось прочитать сохранённый PAT");
    }
    if (operationEntries.length) {
      githubPatRef.current = loaded.token;
      setGitHubPatPersistence(loaded.persistence);
      await syncWithGitHub(loaded.token);
    } else {
      try { await connectGitHubWithoutSync(loaded.token); }
      catch (reason) {
        clearGitHubPat();
        throw reason;
      }
      githubPatRef.current = loaded.token;
      setGitHubPatPersistence(loaded.persistence);
    }
  };

  const disconnectGitHub = async () => {
    const cleared = clearGitHubPat();
    if (!cleared.ok) throw new Error("Safari не разрешил удалить сохранённый PAT");
    githubPatRef.current = null;
    setGitHubPatPersistence(null);
    setGitHubSyncState({ busy: false, stage: "idle", error: null });
  };

  const savePatFromSettings = async (token: string, remember: boolean) => {
    const saved = saveGitHubPat(token, remember);
    if (!saved.ok) {
      throw new Error(saved.error === "invalid-token"
        ? "Нужен fine-grained PAT в формате github_pat_…"
        : "Safari не разрешил сохранить PAT");
    }
    const loaded = loadGitHubPat();
    if (!loaded.ok || !loaded.token || !loaded.persistence) {
      clearGitHubPat();
      throw new Error("Не удалось прочитать сохранённый PAT");
    }
    try {
      await connectGitHubWithoutSync(loaded.token);
    } catch (reason) {
      clearGitHubPat();
      githubPatRef.current = null;
      setGitHubPatPersistence(null);
      throw reason;
    }
    githubPatRef.current = loaded.token;
    setGitHubPatPersistence(loaded.persistence);
  };

  const githubSyncController: DiffSyncController = {
    connected: githubPatRef.current !== null,
    persistence: githubPatPersistence ?? "none",
    busy: githubSyncState.busy,
    stage: githubSyncState.stage,
    error: githubSyncState.error,
    commitUrl: githubSyncState.commitUrl ?? (library.pendingPublication
      ? `https://github.com/${GITHUB_REPOSITORY_OWNER}/${GITHUB_REPOSITORY_NAME}/commit/${library.pendingPublication.commitSha}`
      : undefined),
    pagesPending: library.pendingPublication !== null,
    connectMode: operationEntries.length ? "sync" : "verify",
    repository: `${GITHUB_REPOSITORY_OWNER}/${GITHUB_REPOSITORY_NAME} · main`,
    patCreationHref: getGitHubPatCreationUrl(),
    onConnect: connectAndSyncGitHub,
    onDisconnect: disconnectGitHub,
    onSync: async () => {
      const token = githubPatRef.current;
      if (!token) throw new Error("Сначала подключите fine-grained PAT");
      await syncWithGitHub(token);
    },
    onDismissError: () => setGitHubSyncState((current) => ({ ...current, error: null })),
  };

  const expandedDiscardPaths = (paths: string[]): string[] => {
    const selected = new Set(paths);
    for (const path of paths) {
      const parsed = parsePatchPath(path);
      const operation = library.patch.operations[path];
      const dependencyRoot = parsed && !parsed.field && operation && (
        parsed.map === "games"
        || parsed.map === "notes" && operation.operation === "delete"
        || parsed.map === "assets" && operation.operation === "set" && !operation.baseExists
      );
      const dependencyField = parsed?.field === "coverAssetId" || parsed?.field === "attachments";
      if (!dependencyRoot && !dependencyField) continue;
      if (!operation) continue;
      for (const [candidatePath, candidate] of operationEntries) {
        if (candidate.transactionId === operation.transactionId) selected.add(candidatePath);
      }
    }
    return [...selected];
  };

  if (library.loading) {
    return <div className="boot-screen"><span className="boot-screen__spinner" /><p>Открываем библиотеку…</p></div>;
  }
  if (library.fatalError) {
    return <div className="boot-screen boot-screen--error"><h1>Не удалось открыть библиотеку</h1><p>{library.fatalError}</p><button className="button button--primary" onClick={() => window.location.reload()} type="button">Попробовать снова</button></div>;
  }

  return (
    <AppShell
      activeTab={tabState.activeTab}
      games={games}
      onNavigate={navigateHref}
      onOpenDiff={() => setDiffOpen(true)}
      onSelectTab={activateTabAndSync}
      ref={shellRef}
      resolveAssetUrl={library.resolveAssetUrl}
      route={route}
      storage={{
        bytes: library.usage.bytes,
        budgetBytes: library.usage.budget,
        localAssetCount: library.localAssets.length,
        localAssetBytes: library.localAssetBytes,
        quotaLevel: library.attachmentsBlocked ? "blocked" : library.quotaStatus.level,
        persistent: library.persistentStorage,
        oldestLocalAssetAt: library.localAssets[0]?.createdAt ?? null,
        operationCount: operationEntries.length,
        conflictCount: library.conflicts.length,
        error: actionError ?? library.persistenceError ?? undefined,
      }}
    >
      <div className="app-main__swipe" ref={mainRef}>
        <SwipePager
          activeTab={tabState.activeTab}
          catalogHashSync={catalogAtRoot && tabState.activeTab === "catalog"}
          catalogOverlay={overlayEntry(tabState, "catalog") ? (
            <GameRouteIsland
              entry={overlayEntry(tabState, "catalog")!}
              onPop={() => popStack("catalog")}
              onReplaceGame={(gameId) => {
                const entry = entryFromPath(`/games/${encodeURIComponent(gameId)}`);
                setTabState((current) => {
                  const stacks = {
                    ...current.stacks,
                    catalog: current.stacks.catalog.length
                      ? [...current.stacks.catalog.slice(0, -1), entry]
                      : [TAB_ROOTS.catalog, entry],
                  };
                  return { ...current, activeTab: "catalog", stacks };
                });
                goToEntry(entry, true);
              }}
              showError={showError}
            />
          ) : null}
          draggingRef={tierDraggingRef}
          onActivateTab={activateTabAndSync}
          onDraggingChange={setPagerDragging}
          onMoveGame={(gameId, target) => {
            try {
              library.moveGame(gameId, target.tierId, target.index);
            } catch (error) { showError(error); }
          }}
          onOpenGame={openGameOnTab}
          onProgress={setPagerProgress}
          settingsPat={{
            busy: githubSyncState.busy,
            connected: githubPatRef.current !== null,
            onDisconnect: disconnectGitHub,
            onSave: savePatFromSettings,
            patCreationHref: getGitHubPatCreationUrl(),
            persistence: githubPatPersistence,
            repository: `${GITHUB_REPOSITORY_OWNER}/${GITHUB_REPOSITORY_NAME} · main`,
          }}
          tiersOverlay={overlayEntry(tabState, "tiers") ? (
            <GameRouteIsland
              entry={overlayEntry(tabState, "tiers")!}
              onPop={() => popStack("tiers")}
              onReplaceGame={(gameId) => {
                const entry = entryFromPath(`/games/${encodeURIComponent(gameId)}`);
                setTabState((current) => {
                  const stacks = {
                    ...current.stacks,
                    tiers: current.stacks.tiers.length
                      ? [...current.stacks.tiers.slice(0, -1), entry]
                      : [TAB_ROOTS.tiers, entry],
                  };
                  return { ...current, activeTab: "tiers", stacks };
                });
                goToEntry(entry, true);
              }}
              showError={showError}
            />
          ) : null}
        />
      </div>

      <DiffDialog
        conflicts={conflictItems}
        copyPatch={copyPatch}
        error={actionError ?? publishError ?? library.persistenceError ?? undefined}
        items={items}
        localAssets={{
          bytes: library.localAssetBytes,
          count: library.localAssets.length,
          oldestCreatedAt: library.localAssets[0]?.createdAt ?? null,
          onFreeSpace: freeLocalAssetSpace,
          persistent: library.persistentStorage,
          quotaLevel: library.attachmentsBlocked ? "blocked" : library.quotaStatus.level,
        }}
        onClearAll={() => {
          if (!window.confirm("Отменить все локальные правки?")) return;
          try { library.clearPatch(); } catch (error) { showError(error); }
        }}
        onClose={() => setDiffOpen(false)}
        onDownloadCorruptedRaw={library.corruptedPatchRaw === null ? undefined : library.downloadCorruptedPatch}
        onDismissError={actionError ? () => setActionError(null) : undefined}
        onExport={exportPatch}
        onImport={(text) => { void library.importPatch(text).catch(showError); }}
        onResolveConflict={(id, resolution, manualValue) => {
          try { library.resolvePatchConflict(id, resolution, manualValue); } catch (error) { showError(error); }
        }}
        onUndoGroup={(group) => {
          const groupPaths = items.filter((item) => item.group === group).map((item) => item.id);
          try { library.discardPaths(expandedDiscardPaths(groupPaths)); } catch (error) { showError(error); }
        }}
        onUndoItem={(id) => {
          try { library.discardPaths(expandedDiscardPaths([id])); } catch (error) { showError(error); }
        }}
        open={diffOpen}
        patchBytes={patchBytes}
        payload={publishPayload}
        payloadPreparing={publishPayloadPreparing}
        publishCommand={PUBLISH_CLIPBOARD_COMMAND}
        sync={githubSyncController}
      />
    </AppShell>
  );
}

export default function App() {
  return <HashRouter><LibraryProvider><LibraryRoutes /></LibraryProvider></HashRouter>;
}
