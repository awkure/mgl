import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  activateLibraryStore,
  deactivateLibraryStore,
  publishLibrarySnapshot,
  useLibrarySelector,
} from "./libraryStore";
import type { GameSaveInput, EditableAttachment } from "../pages/GamePage";
import {
  PATCH_STORAGE_KEY,
  SAFARI_SAFE_BUDGET_BYTES,
  assertValidLibrary,
  classifyStorageUsage,
  computeLibraryRevision,
  deleteLocalAssetsAtomic,
  deleteSafeOrphans,
  describeAssetForRecovery,
  diffLibrary,
  discardOperation,
  estimateOriginStorage,
  garbageCollectUnreferencedAssets,
  inspectLocalAssetIntegrity,
  isQuotaExceededError,
  listLocalAssets,
  localAssetWritePreflight,
  loadPatch,
  makeLocalAsset,
  moveGameToTier,
  normalizePatchEnvelope,
  parsePatchPath,
  publishedAssetUrl,
  readLocalAssets,
  reconcilePatch,
  requestPersistentOriginStorage,
  resolveConflict,
  savePatch,
  storageIsPersisted,
  updateLocalAssetState,
  validatePatch,
  webkitStorageBytes,
  writeLocalAssetsAtomic,
  DEFAULT_NOTE_GROUP_RANK,
  LIBRARY_SCHEMA_VERSION,
  type Asset,
  type LibraryDatabase,
  type LocalAsset,
  type NoteAttachment,
  type OriginStorageStatus,
  type PatchConflict,
  type PatchEnvelope,
  type ReconciledPatch,
  type StorageUsage,
  type TierId,
} from "../domain";
import {
  PENDING_PUBLICATION_STORAGE_KEY,
  clearPendingPublication,
  installPendingPublication,
  loadPendingPublication,
  pendingPublicationAssetIds,
  type PendingPublicationReceipt,
} from "./pendingPublication";
import { createRecoveryArchive, downloadRecoveryArchive } from "./recoveryExport";
import {
  GitHubGitDatabaseSyncClient,
  GitHubPatchConflictError,
  GitHubSyncError,
  type GitHubSyncStage,
} from "./githubGitDatabaseSync";
import {
  GITHUB_REPOSITORY_NAME,
  GITHUB_REPOSITORY_OWNER,
  loadGitHubPat,
} from "./githubPat";
import {
  emptyPatch,
  garbageCollectReconciledAssets,
  maxRank,
  patchAssetMetadata,
  patchLocalAssetIds,
  patchUsage,
  requiredLocalAssetIds,
  samePublishedVersion,
  uniqueStrings,
} from "./libraryPatchHelpers";
import {
  assetFromPrepared,
  localAssetsFromLegacyBlobs,
  preparedLocalAssets,
  retainLocalAsset,
  verifyAndDeletePublishedLocalAssets,
  verifyPublishedLocalAssets,
} from "./libraryAssets";

export { requiredLocalAssetIds } from "./libraryPatchHelpers";
export { verifyPublishedLocalAssets, verifyAndDeletePublishedLocalAssets } from "./libraryAssets";

async function deployedVersionIsGitHubHead(deployed: LibraryDatabase): Promise<boolean> {
  const credential = loadGitHubPat();
  if (!credential.ok || !credential.token) return false;
  try {
    const client = new GitHubGitDatabaseSyncClient({
      owner: GITHUB_REPOSITORY_OWNER,
      repo: GITHUB_REPOSITORY_NAME,
      branch: "main",
      token: credential.token,
    });
    const latest = await client.fetchLatestLibrary();
    return samePublishedVersion(deployed, latest.database);
  } catch {
    return false;
  }
}

interface LibraryState {
  base: LibraryDatabase;
  effective: LibraryDatabase;
  patch: PatchEnvelope;
  conflicts: PatchConflict[];
  pendingPublication: PendingPublicationReceipt | null;
}

export interface LibraryGitHubSyncResult {
  status: "committed" | "up-to-date";
  commitSha: string;
  commitUrl: string;
  pagesPending: boolean;
}

export interface LibraryContextValue extends LibraryState {
  loading: boolean;
  fatalError: string | null;
  persistenceError: string | null;
  corruptedPatchRaw: string | null;
  usage: StorageUsage;
  storageEstimate: { usage?: number; quota?: number } | null;
  quotaStatus: OriginStorageStatus;
  persistentStorage: boolean;
  attachmentsBlocked: boolean;
  localAssets: LocalAsset[];
  localAssetBytes: number;
  games: LibraryDatabase["games"];
  canAddBlob: (byteLength: number) => Promise<string | null>;
  resolveAssetUrl: (assetId: string) => string | null;
  saveGame: (input: GameSaveInput) => Promise<string>;
  deleteGame: (gameId: string) => void;
  moveGame: (gameId: string, tierId: TierId, index: number) => void;
  discardPath: (path: string) => void;
  discardPaths: (paths: string[]) => void;
  clearPatch: () => void;
  resolvePatchConflict: (path: string, choice: "static" | "local", manualValue?: unknown) => void;
  importPatch: (raw: string) => Promise<void>;
  undoLast: () => boolean;
  downloadCorruptedPatch: () => void;
  exportRecoveryArchive: () => Promise<void>;
  deleteAllLocalAssets: () => Promise<void>;
  verifyGitHubAccess: (token: string) => Promise<void>;
  syncToGitHub: (token: string, onStage?: (stage: GitHubSyncStage) => void) => Promise<LibraryGitHubSyncResult>;
  /** Soft refetch of published library.json; keeps UI mounted (no boot spinner). */
  refreshFromPublished: () => Promise<void>;
}

export { useLibrarySelector } from "./libraryStore";

export function LibraryProvider({ children }: { children: ReactNode }) {
  activateLibraryStore();
  useEffect(() => () => deactivateLibraryStore(), []);
  const [state, setState] = useState<LibraryState | null>(null);
  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const [corruptedPatchRaw, setCorruptedPatchRaw] = useState<string | null>(null);
  const [storageEstimate, setStorageEstimate] = useState<{ usage?: number; quota?: number } | null>(null);
  const [quotaStatus, setQuotaStatus] = useState<OriginStorageStatus>({ usage: null, quota: null, remaining: null, ratio: null, level: "unknown" });
  const [persistentStorage, setPersistentStorage] = useState(false);
  const [attachmentWriteBlocked, setAttachmentWriteBlocked] = useState(false);
  const [localAssets, setLocalAssets] = useState<LocalAsset[]>([]);
  const [localAssetUrls, setLocalAssetUrls] = useState<Record<string, string>>({});
  const localAssetUrlsRef = useRef<Record<string, string>>({});
  const undoStack = useRef<PatchEnvelope[]>([]);
  const stateRef = useRef<LibraryState | null>(null);
  const localAssetsRef = useRef<LocalAsset[]>([]);
  const persistRequestedRef = useRef(false);
  const syncInFlightRef = useRef(false);
  const refreshInFlightRef = useRef(false);

  const setLibraryState = useCallback((next: LibraryState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const installLocalAssets = useCallback((assets: LocalAsset[]) => {
    localAssetsRef.current = assets;
    setLocalAssets(assets);
    const previous = localAssetUrlsRef.current;
    const next = typeof URL.createObjectURL === "function"
      ? Object.fromEntries(assets.map((asset) => [asset.id, previous[asset.id] ?? URL.createObjectURL(asset.blob)]))
      : {};
    for (const [id, url] of Object.entries(previous)) {
      if (!Object.prototype.hasOwnProperty.call(next, id)) URL.revokeObjectURL?.(url);
    }
    localAssetUrlsRef.current = next;
    setLocalAssetUrls(next);
  }, []);

  useEffect(() => () => {
    Object.values(localAssetUrlsRef.current).forEach((url) => URL.revokeObjectURL?.(url));
    localAssetUrlsRef.current = {};
  }, []);

  const refreshLocalAssets = useCallback(async () => {
    try { installLocalAssets(await listLocalAssets()); }
    catch { installLocalAssets([]); }
  }, [installLocalAssets]);

  const refreshQuota = useCallback(async () => {
    const next = await estimateOriginStorage();
    setQuotaStatus(next);
    setStorageEstimate(next.usage === null && next.quota === null ? null : { usage: next.usage ?? undefined, quota: next.quota ?? undefined });
    return next;
  }, []);

  const installReconciled = useCallback((
    base: LibraryDatabase,
    reconciled: ReconciledPatch,
    remember = false,
    pendingPublication = stateRef.current?.pendingPublication ?? null,
  ) => {
    const normalized = garbageCollectReconciledAssets(base, reconciled);
    assertValidLibrary(normalized.effective);
    let written;
    try {
      written = savePatch(localStorage, normalized.patch);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Safari не разрешил доступ к localStorage";
      setPersistenceError(message);
      throw new Error(message);
    }
    if (!written.ok) {
      const message = written.error?.message ?? "Safari не сохранил локальный патч";
      setPersistenceError(message);
      throw new Error(message);
    }
    const current = stateRef.current;
    if (remember && current) undoStack.current = [...undoStack.current.slice(-49), structuredClone(current.patch)];
    setPersistenceError(null);
    setLibraryState({ base, effective: normalized.effective, patch: normalized.patch, conflicts: normalized.conflicts, pendingPublication });
    const removable = localAssetsRef.current.filter((asset) => asset.state === "local" && !Object.prototype.hasOwnProperty.call(normalized.effective.assets, asset.id));
    if (removable.length) {
      const removableIds = new Set(removable.map((asset) => asset.id));
      installLocalAssets(localAssetsRef.current.filter((asset) => !removableIds.has(asset.id)));
      void deleteLocalAssetsAtomic([...removableIds]).then(() => refreshQuota()).catch(async (reason) => {
        await refreshLocalAssets();
        setPersistenceError(reason instanceof Error ? `Не удалось удалить неиспользуемые локальные файлы: ${reason.message}` : "Не удалось удалить неиспользуемые локальные файлы");
      });
    }
  }, [installLocalAssets, refreshLocalAssets, refreshQuota, setLibraryState]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const dataUrl = new URL(`${import.meta.env.BASE_URL}data/library.json`, document.baseURI);
        dataUrl.searchParams.set("_", String(Date.now()));
        const response = await fetch(dataUrl, { cache: "no-store" });
        if (!response.ok) throw new Error(`Не удалось загрузить библиотеку: HTTP ${response.status}`);
        const parsed: unknown = await response.json();
        assertValidLibrary(parsed);
        const deployedBase = structuredClone(parsed);
        const computedRevision = computeLibraryRevision(deployedBase);
        if (deployedBase.revision && deployedBase.revision !== computedRevision) throw new Error("Revision опубликованной базы не совпадает с её содержимым");
        deployedBase.revision = computedRevision;

        let base = deployedBase;
        let pendingPublication: PendingPublicationReceipt | null = null;
        try {
          const pending = loadPendingPublication(localStorage);
          if (pending.error) {
            setPersistenceError(pending.error.message);
          } else if (pending.receipt) {
            let receipt = pending.receipt;
            const sameTarget = receipt.owner === GITHUB_REPOSITORY_OWNER
              && receipt.repo === GITHUB_REPOSITORY_NAME
              && receipt.branch === "main";
            const publicationArrived = sameTarget && samePublishedVersion(deployedBase, receipt.database);
            const pagesStillAtSource = sameTarget && deployedBase.revision === receipt.sourceRevision;
            const pagesAtCurrentHead = sameTarget && !publicationArrived && !pagesStillAtSource
              ? await deployedVersionIsGitHubHead(deployedBase)
              : false;
            if (publicationArrived || pagesAtCurrentHead) {
              try {
                const ids = pendingPublicationAssetIds(receipt);
                await verifyAndDeletePublishedLocalAssets(ids, publicationArrived ? deployedBase : receipt.database);
                clearPendingPublication(localStorage);
              } catch (reason) {
                if (receipt.version === 1 && receipt.blobs) {
                  await writeLocalAssetsAtomic(localAssetsFromLegacyBlobs(receipt.blobs, receipt.database.assets));
                  receipt = { ...receipt, version: 2, assetIds: Object.keys(receipt.blobs) };
                  delete receipt.blobs;
                  localStorage.setItem(PENDING_PUBLICATION_STORAGE_KEY, JSON.stringify(receipt));
                }
                base = structuredClone(receipt.database);
                pendingPublication = receipt;
                setPersistenceError(`Публикация не подтверждена, локальные файлы сохранены. ${reason instanceof Error ? reason.message : ""}`.trim());
              }
            } else if (sameTarget) {
              if (receipt.version === 1 && receipt.blobs) {
                await writeLocalAssetsAtomic(localAssetsFromLegacyBlobs(receipt.blobs, receipt.database.assets));
                receipt = { ...receipt, version: 2, assetIds: Object.keys(receipt.blobs) };
                delete receipt.blobs;
                localStorage.setItem(PENDING_PUBLICATION_STORAGE_KEY, JSON.stringify(receipt));
              }
              base = structuredClone(receipt.database);
              pendingPublication = receipt;
            } else {
              setPersistenceError("Ожидающая публикация относится к другому репозиторию");
            }
          }
        } catch {
          setPersistenceError("Safari не разрешил прочитать состояние синхронизации");
        }

        let patch = emptyPatch(base.revision);
        let patchIsCorrupted = false;
        let patchHadLegacyBlobs = false;
        try {
          const loaded = loadPatch(localStorage);
          if (loaded.error) {
            patchIsCorrupted = true;
            setCorruptedPatchRaw(loaded.raw);
            setPersistenceError("Локальный патч повреждён. Его можно скачать из окна правок.");
          } else if (loaded.patch) {
            patch = loaded.patch;
            patchHadLegacyBlobs = Object.keys(patch.blobs).length > 0;
            if (patchHadLegacyBlobs) {
              await writeLocalAssetsAtomic(localAssetsFromLegacyBlobs(patch.blobs, patchAssetMetadata(patch)));
              patch = { ...patch, blobs: {} };
            }
          }
        } catch (error) {
          setPersistenceError(error instanceof Error ? error.message : "localStorage недоступен");
        }
        let reconciled: ReconciledPatch;
        try {
          reconciled = garbageCollectReconciledAssets(base, reconcilePatch(base, patch));
          assertValidLibrary(reconciled.effective);
        } catch (error) {
          patchIsCorrupted = true;
          let raw: string | null = null;
          try { raw = localStorage.getItem(PATCH_STORAGE_KEY); } catch { /* localStorage may be unavailable */ }
          setCorruptedPatchRaw(raw);
          setPersistenceError(error instanceof Error ? `Локальный патч нельзя применить: ${error.message}` : "Локальный патч нельзя применить");
          reconciled = reconcilePatch(base, emptyPatch(base.revision));
        }
        if (!active) return;
        if (!patchIsCorrupted) {
          try {
            const written = savePatch(localStorage, reconciled.patch);
            if (!written.ok) setPersistenceError(written.error?.message ?? "Safari не сохранил патч");
          } catch (error) {
            setPersistenceError(error instanceof Error ? error.message : "localStorage недоступен");
          }
        }
        try {
          const localIds = new Set([
            ...Object.keys(reconciled.effective.assets).filter((id) => !Object.prototype.hasOwnProperty.call(base.assets, id)),
            ...(pendingPublication ? pendingPublicationAssetIds(pendingPublication) : []),
          ]);
          const integrity = await inspectLocalAssetIntegrity(localIds);
          if (integrity.corrupt.length || integrity.missing.length) {
            const details = [...integrity.missing.map((id) => `нет локального файла ${id}`), ...integrity.corrupt.map(({ asset }) => `повреждён локальный файл ${asset.id}`)].join(", ");
            setPersistenceError(`Проверка локальных вложений не пройдена: ${details}`);
          }
          const removedOrphans = await deleteSafeOrphans(localIds, Date.now());
          const removedIds = new Set(removedOrphans);
          if (patchHadLegacyBlobs || integrity.valid.length) installLocalAssets(integrity.valid.filter((asset) => !removedIds.has(asset.id)));
          if (removedOrphans.length) await refreshQuota();
        } catch (reason) {
          if (Object.keys(reconciled.effective.assets).some((id) => !Object.prototype.hasOwnProperty.call(base.assets, id))) {
            setPersistenceError(reason instanceof Error ? reason.message : "localStorage недоступен для локальных вложений");
          }
        }
        setLibraryState({ base, effective: reconciled.effective, patch: reconciled.patch, conflicts: reconciled.conflicts, pendingPublication });
      } catch (error) {
        if (active) setFatalError(error instanceof Error ? error.message : "Не удалось открыть библиотеку");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
    // corruptedPatchRaw must not restart the initial fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installLocalAssets, refreshLocalAssets, setLibraryState]);

  useEffect(() => {
    let active = true;
    void refreshQuota();
    void storageIsPersisted().then((persisted) => { if (active) setPersistentStorage(persisted); });
    const visible = () => {
      if (document.visibilityState !== "visible") return;
      void refreshQuota();
      void refreshLocalAssets();
    };
    document.addEventListener("visibilitychange", visible);
    return () => { active = false; document.removeEventListener("visibilitychange", visible); };
  }, [refreshLocalAssets, refreshQuota]);

  useEffect(() => {
    if (!state) return;
    let timer: number | undefined;
    const installStoredState = () => {
      const current = stateRef.current;
      if (!current) return;
      const pending = loadPendingPublication(localStorage);
      if (pending.error) {
        setPersistenceError(pending.error.message);
        return;
      }
      if (pending.receipt) {
        const sameTarget = pending.receipt.owner === GITHUB_REPOSITORY_OWNER
          && pending.receipt.repo === GITHUB_REPOSITORY_NAME
          && pending.receipt.branch === "main";
        if (!sameTarget) {
          setPersistenceError("Ожидающая публикация относится к другому репозиторию");
          return;
        }
        const loaded = loadPatch(localStorage);
        if (loaded.error) {
          setCorruptedPatchRaw(loaded.raw);
          setPersistenceError("Патч из другой вкладки повреждён. Скачайте raw-значение перед сбросом.");
          return;
        }
        try {
          const base = structuredClone(pending.receipt.database);
          const patch = loaded.patch ?? emptyPatch(base.revision);
          const reconciled = garbageCollectReconciledAssets(base, reconcilePatch(base, patch));
          assertValidLibrary(reconciled.effective);
          setCorruptedPatchRaw(null);
          setPersistenceError(null);
          setLibraryState({ base, effective: reconciled.effective, patch: reconciled.patch, conflicts: reconciled.conflicts, pendingPublication: pending.receipt });
        } catch (error) {
          setCorruptedPatchRaw(loaded.raw);
          setPersistenceError(error instanceof Error ? `Патч из другой вкладки повреждён: ${error.message}` : "Патч из другой вкладки повреждён");
        }
        return;
      }

      // The tab that observed Pages clears the receipt first; other tabs keep
      // their in-memory bridge until their own poll fetches the deployed base.
      if (current.pendingPublication) return;
      const loaded = loadPatch(localStorage);
      if (loaded.patch) {
        try {
          const reconciled = garbageCollectReconciledAssets(current.base, reconcilePatch(current.base, loaded.patch));
          assertValidLibrary(reconciled.effective);
          setCorruptedPatchRaw(null);
          setLibraryState({ base: current.base, effective: reconciled.effective, patch: reconciled.patch, conflicts: reconciled.conflicts, pendingPublication: null });
        } catch (error) {
          setCorruptedPatchRaw(loaded.raw);
          setPersistenceError(error instanceof Error ? `Патч из другой вкладки повреждён: ${error.message}` : "Патч из другой вкладки повреждён");
        }
      } else if (loaded.error) {
        setCorruptedPatchRaw(loaded.raw);
        setPersistenceError("Патч из другой вкладки повреждён. Скачайте raw-значение перед сбросом.");
      } else {
        const patch = emptyPatch(current.base.revision);
        setCorruptedPatchRaw(null);
        setLibraryState({ base: current.base, effective: current.base, patch, conflicts: [], pendingPublication: null });
      }
    };
    const receive = (event: StorageEvent) => {
      if (event.key !== PATCH_STORAGE_KEY && event.key !== PENDING_PUBLICATION_STORAGE_KEY) return;
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(installStoredState, 0);
    };
    window.addEventListener("storage", receive);
    return () => {
      window.removeEventListener("storage", receive);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [setLibraryState, state?.base]);

  useEffect(() => {
    const pending = state?.pendingPublication;
    if (!pending) return;
    let active = true;
    let timer: number | undefined;
    const checkedNonTargetRevisions = new Set<string>();
    const check = async () => {
      try {
        const dataUrl = new URL(`${import.meta.env.BASE_URL}data/library.json`, document.baseURI);
        dataUrl.searchParams.set("_", String(Date.now()));
        const response = await fetch(dataUrl, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const deployed: unknown = await response.json();
        assertValidLibrary(deployed);
        const deployedBase = structuredClone(deployed);
        const revision = computeLibraryRevision(deployedBase);
        if (deployedBase.revision && deployedBase.revision !== revision) throw new Error("Некорректная revision");
        deployedBase.revision = revision;
        if (!active) return;
        let publicationArrived = samePublishedVersion(deployedBase, pending.database);
        if (
          !publicationArrived
          && deployedBase.revision !== pending.sourceRevision
          && !checkedNonTargetRevisions.has(deployedBase.revision)
        ) {
          checkedNonTargetRevisions.add(deployedBase.revision);
          publicationArrived = await deployedVersionIsGitHubHead(deployedBase);
        }
        if (!publicationArrived) {
          timer = window.setTimeout(() => void check(), 5_000);
          return;
        }
        const current = stateRef.current;
        if (!current || current.pendingPublication?.commitSha !== pending.commitSha) return;
        const verificationIds = pendingPublicationAssetIds(pending);
        try {
          await verifyPublishedLocalAssets(verificationIds, deployedBase);
        } catch (reason) {
          setPersistenceError(`Коммит создан, но публикация файлов ещё не подтверждена. Локальные копии сохранены. ${reason instanceof Error ? reason.message : ""}`.trim());
          timer = window.setTimeout(() => void check(), 10_000);
          return;
        }
        const reconciled = reconcilePatch(deployedBase, current.patch);
        await deleteLocalAssetsAtomic(verificationIds);
        await refreshLocalAssets();
        await refreshQuota();
        installReconciled(deployedBase, reconciled, false, null);
        clearPendingPublication(localStorage);
      } catch {
        if (active) timer = window.setTimeout(() => void check(), 10_000);
      }
    };
    timer = window.setTimeout(() => void check(), 2_000);
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [installReconciled, refreshLocalAssets, refreshQuota, state?.pendingPublication]);

  const mutate = useCallback((mutator: (database: LibraryDatabase, base: LibraryDatabase) => void) => {
    const current = stateRef.current;
    if (!current) throw new Error("Библиотека ещё загружается");
    if (corruptedPatchRaw !== null) throw new Error("Сначала экспортируйте или сбросьте повреждённый локальный патч");
    if (current.conflicts.length) throw new Error("Сначала разрешите конфликты локального патча");
    const next = structuredClone(current.effective);
    mutator(next, current.base);
    garbageCollectUnreferencedAssets(next);
    assertValidLibrary(next);
    const patch = diffLibrary(current.base, next, { previousPatch: current.patch });
    installReconciled(current.base, reconcilePatch(current.base, patch), true, current.pendingPublication);
  }, [corruptedPatchRaw, installReconciled]);

  const saveGame = useCallback(async (input: GameSaveInput): Promise<string> => {
    const id = input.id ?? crypto.randomUUID();
    const current = stateRef.current;
    if (!current) throw new Error("Библиотека ещё загружается");
    const preparedAssets = preparedLocalAssets(input, current.base);
    if (preparedAssets.length) {
      if (!persistRequestedRef.current) {
        persistRequestedRef.current = true;
        const granted = await requestPersistentOriginStorage();
        setPersistentStorage(granted || await storageIsPersisted());
      }
      const storageError = localAssetWritePreflight(localStorage, preparedAssets.reduce((total, asset) => total + asset.byteLength, 0));
      if (storageError) throw new Error(storageError);
      try {
        await writeLocalAssetsAtomic(preparedAssets);
        setAttachmentWriteBlocked(false);
      } catch (reason) {
        await refreshQuota();
        if (isQuotaExceededError(reason)) {
          setAttachmentWriteBlocked(true);
          setPersistenceError("localStorage отклонил запись из-за квоты. Текст не потерян: закоммитьте, экспортируйте или удалите локальные вложения.");
          throw new Error("Недостаточно места в localStorage. Закоммитьте, экспортируйте или удалите локальные вложения.");
        }
        throw reason;
      }
      await refreshLocalAssets();
      await refreshQuota();
    }
    mutate((database) => {
      const now = new Date().toISOString();
      const previous = database.games[id];
      let coverAssetId = input.coverAssetId;
      if (input.pendingCover) {
        coverAssetId = retainLocalAsset(database, assetFromPrepared(input.pendingCover), "image");
      }
      const tierChanged = previous && previous.placement.tierId !== input.tierId;
      const placementRank = previous && !tierChanged
        ? previous.placement.rank
        : maxRank(Object.values(database.games).filter((game) => game.id !== id && game.placement.tierId === input.tierId).map((game) => game.placement)) + 1024;
      database.games[id] = {
        id,
        title: input.title.trim(),
        coverAssetId,
        steamAppId: input.steamAppId === undefined ? previous?.steamAppId ?? null : input.steamAppId,
        importedVia: input.importedVia === undefined ? previous?.importedVia ?? "manually" : input.importedVia,
        hoursPlayed: input.hoursPlayed === undefined ? previous?.hoursPlayed ?? null : input.hoursPlayed,
        lastPlayedAt: input.lastPlayedAt === undefined ? previous?.lastPlayedAt ?? null : input.lastPlayedAt,
        steamOverrides: previous?.steamOverrides ?? {},
        platforms: uniqueStrings(input.platforms),
        tags: uniqueStrings(input.tags),
        status: input.status,
        placement: { tierId: input.tierId, rank: placementRank },
        reviewMarkdown: input.reviewMarkdown,
        createdAt: previous?.createdAt ?? now,
        updatedAt: previous?.updatedAt ?? now,
      };

      const retainedNoteIds = new Set<string>();
      input.notes.forEach((draft, index) => {
        if (!draft.bodyMarkdown.trim() && !draft.attachments.length) return;
        const noteId = draft.id && database.notes[draft.id]?.gameId === id ? draft.id : crypto.randomUUID();
        retainedNoteIds.add(noteId);
        const attachments: NoteAttachment[] = draft.attachments.map((attachment: EditableAttachment) => {
          if (attachment.type === "pending-image") {
            const prepared = assetFromPrepared(attachment.image);
            const assetId = retainLocalAsset(database, prepared, "image");
            const asset = database.assets[assetId];
            return { type: "image", assetId, alt: attachment.alt || (asset.kind === "file" ? "" : asset.alt) };
          }
          if (attachment.type === "pending-file") {
            if (attachment.file.blob.size !== attachment.file.byteLength) throw new Error("Размер файла не совпадает с содержимым");
            const prepared: Asset = { id: attachment.file.assetId, kind: "file", mime: attachment.file.mime, byteLength: attachment.file.byteLength, originalName: attachment.file.originalName };
            const assetId = retainLocalAsset(database, prepared, "file");
            return { type: "file", assetId, label: attachment.label || attachment.file.originalName };
          }
          return attachment;
        });
        const previousNote = database.notes[noteId];
        const groupRank = draft.groupRank ?? DEFAULT_NOTE_GROUP_RANK;
        database.notes[noteId] = {
          id: noteId,
          gameId: id,
          bodyMarkdown: draft.bodyMarkdown,
          attachments,
          ...(groupRank === DEFAULT_NOTE_GROUP_RANK ? {} : { groupRank }),
          rank: draft.rank,
          createdAt: previousNote?.createdAt ?? now,
          updatedAt: previousNote?.updatedAt ?? now,
        };
      });
      Object.values(database.notes).forEach((note) => {
        if (note.gameId === id && !retainedNoteIds.has(note.id)) delete database.notes[note.id];
      });

    });
    return id;
  }, [mutate, refreshLocalAssets, refreshQuota]);

  const deleteGame = useCallback((gameId: string) => mutate((database) => {
    delete database.games[gameId];
    Object.values(database.notes).forEach((note) => note.gameId === gameId && delete database.notes[note.id]);
  }), [mutate]);

  const moveGame = useCallback((gameId: string, tierId: TierId, index: number) => mutate((database) => {
    const moved = moveGameToTier(database, gameId, tierId, index);
    database.games = moved.games;
  }), [mutate]);

  const installPatch = useCallback((patch: PatchEnvelope, remember = true) => {
    if (!state) return;
    installReconciled(state.base, reconcilePatch(state.base, patch), remember);
  }, [installReconciled, state]);

  const discardPath = useCallback((path: string) => {
    if (!state) return;
    installPatch(discardOperation(state.patch, path));
  }, [installPatch, state]);

  const discardPaths = useCallback((paths: string[]) => {
    if (!state) return;
    const blocked = new Set(paths);
    const patch = structuredClone(state.patch);
    Object.keys(patch.operations).forEach((path) => blocked.has(path) && delete patch.operations[path]);
    installPatch(patch);
  }, [installPatch, state]);

  const clearPatch = useCallback(() => {
    if (!state) return;
    installPatch(emptyPatch(state.base.revision));
    setCorruptedPatchRaw(null);
    const removable = localAssetsRef.current.filter((asset) => !Object.prototype.hasOwnProperty.call(state.base.assets, asset.id)).map((asset) => asset.id);
    void deleteLocalAssetsAtomic(removable).then(async () => { await refreshLocalAssets(); await refreshQuota(); }).catch(() => undefined);
  }, [installPatch, refreshLocalAssets, refreshQuota, state]);

  const resolvePatchConflict = useCallback((path: string, choice: "static" | "local", manualValue?: unknown) => {
    if (!state) return;
    const result = resolveConflict(state.base, state.patch, path, manualValue === undefined ? { choice } : { choice: "manual", value: manualValue });
    installReconciled(state.base, result, true);
  }, [installReconciled, state]);

  const importPatch = useCallback(async (raw: string) => {
    const parsed = normalizePatchEnvelope(JSON.parse(raw));
    const validation = validatePatch(parsed);
    if (!validation.ok || !validation.value) throw new Error(validation.issues.map((item) => `${item.path}: ${item.message}`).join("\n"));
    let patch = validation.value;
    if (Object.keys(patch.blobs).length) {
      const assets = localAssetsFromLegacyBlobs(patch.blobs, patchAssetMetadata(patch));
      const storageError = localAssetWritePreflight(localStorage, assets.reduce((total, asset) => total + asset.byteLength, 0));
      if (storageError) throw new Error(storageError);
      try { await writeLocalAssetsAtomic(assets); }
      catch (reason) {
        if (isQuotaExceededError(reason)) {
          setAttachmentWriteBlocked(true);
          setPersistenceError("localStorage отклонил импорт из-за квоты. Исходный файл импорта не изменён.");
        }
        throw reason;
      }
      patch = { ...patch, blobs: {} };
      await refreshLocalAssets();
      await refreshQuota();
    }
    installPatch(patch);
    setCorruptedPatchRaw(null);
  }, [installPatch, refreshLocalAssets, refreshQuota]);

  const undoLast = useCallback(() => {
    const previous = undoStack.current.pop();
    if (!previous || !state) return false;
    installReconciled(state.base, reconcilePatch(state.base, previous), false);
    return true;
  }, [installReconciled, state]);

  const downloadCorruptedPatch = useCallback(() => {
    if (corruptedPatchRaw === null) return;
    const url = URL.createObjectURL(new Blob([corruptedPatchRaw], { type: "text/plain" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "mylib-corrupted-local-patch.txt"; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [corruptedPatchRaw]);

  const verifyGitHubAccess = useCallback(async (token: string): Promise<void> => {
    if (syncInFlightRef.current) throw new Error("Операция с GitHub уже выполняется");
    syncInFlightRef.current = true;
    try {
      const client = new GitHubGitDatabaseSyncClient({
        owner: GITHUB_REPOSITORY_OWNER,
        repo: GITHUB_REPOSITORY_NAME,
        branch: "main",
        token,
      });
      await client.verifyWriteAccessWithTemporaryBranch();
    } catch (reason) {
      if (reason instanceof GitHubSyncError) {
        if (reason.status === 401) throw new Error("GitHub отклонил PAT. Создайте новый fine-grained PAT.");
        if (reason.status === 403) throw new Error("PAT не имеет права Contents: write либо GitHub запретил создание или удаление временной проверочной ветки.");
        if (reason.status === 404) throw new Error(`GitHub не нашёл репозиторий. Проверьте, что PAT выдан только для ${GITHUB_REPOSITORY_OWNER}/${GITHUB_REPOSITORY_NAME}.`);
      }
      throw reason;
    } finally {
      syncInFlightRef.current = false;
    }
  }, []);

  const syncToGitHub = useCallback(async (
    token: string,
    onStage?: (stage: GitHubSyncStage) => void,
  ): Promise<LibraryGitHubSyncResult> => {
    if (syncInFlightRef.current) throw new Error("Синхронизация уже выполняется");
    const snapshot = stateRef.current;
    if (!snapshot) throw new Error("Библиотека ещё загружается");
    if (corruptedPatchRaw !== null) throw new Error("Сначала восстановите или сбросьте повреждённый патч");
    if (snapshot.conflicts.length) throw new Error("Сначала разрешите конфликты локального патча");
    if (!Object.keys(snapshot.patch.operations).length) throw new Error("Нет локальных правок для синхронизации");

    syncInFlightRef.current = true;
    const snapshotEffective = structuredClone(snapshot.effective);
    const snapshotPatch = structuredClone(snapshot.patch);
    const snapshotLocalAssetIds = requiredLocalAssetIds(snapshotPatch, snapshotEffective);
    let mediaRecords: LocalAsset[] = [];
    let publicationAccepted = false;
    try {
      mediaRecords = await readLocalAssets(snapshotLocalAssetIds);
      const availableMediaIds = new Set(mediaRecords.map((record) => record.id));
      const missingMedia = snapshotLocalAssetIds.filter((id) => !availableMediaIds.has(id));
      if (missingMedia.length) throw new Error(`В localStorage отсутствуют локальные файлы: ${missingMedia.map((id) => describeAssetForRecovery(snapshotEffective, id)).join("; ")}. Удалите указанные обложки или вложения и загрузите исходные файлы заново.`);
      for (const record of mediaRecords) if (record.byteLength !== record.blob.size) throw new Error(`Локальный файл ${describeAssetForRecovery(snapshotEffective, record.id)} повреждён: сохранённый размер не совпадает с Blob. Удалите указанную обложку или вложение и загрузите исходный файл заново.`);
      await updateLocalAssetState(snapshotLocalAssetIds, "publishing");
      await refreshLocalAssets();
      const client = new GitHubGitDatabaseSyncClient({
        owner: GITHUB_REPOSITORY_OWNER,
        repo: GITHUB_REPOSITORY_NAME,
        branch: "main",
        token,
        onStage,
      });

      let result;
      for (let attempt = 0; ; attempt += 1) {
        try {
          result = await client.publishPatch(snapshotPatch, Object.fromEntries(mediaRecords.map((asset) => [asset.id, asset.blob])));
          break;
        } catch (reason) {
          if (reason instanceof GitHubSyncError && reason.code === "concurrent_update" && attempt === 0) continue;
          if (reason instanceof GitHubPatchConflictError) {
            const current = stateRef.current;
            if (current) {
              const reconciliation = reconcilePatch(reason.latestDatabase, current.patch);
              const receiptAssetIds = current.pendingPublication ? pendingPublicationAssetIds(current.pendingPublication).filter((id) => id in reason.latestDatabase.assets) : [];
              if (reason.latestDatabase.publicationId !== null && reason.latestDatabase.revision !== current.base.revision) {
                const receipt: PendingPublicationReceipt = {
                  version: 2,
                  owner: GITHUB_REPOSITORY_OWNER,
                  repo: GITHUB_REPOSITORY_NAME,
                  branch: "main",
                  sourceRevision: current.pendingPublication?.sourceRevision ?? current.base.revision,
                  commitSha: reason.latestSnapshot.headSha,
                  createdAt: new Date().toISOString(),
                  database: reason.latestDatabase,
                  assetIds: receiptAssetIds,
                };
                const installed = installPendingPublication(localStorage, receipt, reconciliation.patch);
                if (installed.ok) {
                  undoStack.current = [];
                  setPersistenceError(null);
                  setLibraryState({ base: reason.latestDatabase, effective: reconciliation.effective, patch: reconciliation.patch, conflicts: reconciliation.conflicts, pendingPublication: receipt });
                } else {
                  setPersistenceError(`${installed.error.message}. Конфликты сохранятся только до перезагрузки.`);
                  setLibraryState({ base: reason.latestDatabase, effective: reconciliation.effective, patch: reconciliation.patch, conflicts: reconciliation.conflicts, pendingPublication: receipt });
                }
              } else {
                installReconciled(reason.latestDatabase, reconciliation, false, current.pendingPublication);
              }
            }
            throw new Error("В main изменились те же поля. Разрешите появившиеся конфликты и повторите синхронизацию.");
          }
          if (reason instanceof GitHubSyncError) {
            if (reason.status === 401) throw new Error("GitHub отклонил PAT. Создайте новый fine-grained PAT.");
            if (reason.status === 403) throw new Error("PAT не имеет права Contents: write либо запись в main запрещена правилами репозитория.");
            if (reason.status === 404) throw new Error(`GitHub не нашёл репозиторий. Проверьте, что PAT выдан только для ${GITHUB_REPOSITORY_OWNER}/${GITHUB_REPOSITORY_NAME}.`);
            if (reason.code === "concurrent_update") throw new Error("Ветка main снова изменилась во время синхронизации. Повторите попытку.");
          }
          throw reason;
        }
      }

      const current = stateRef.current;
      if (!current) throw new Error("Локальное состояние закрылось во время синхронизации");
      publicationAccepted = true;
      await updateLocalAssetState(snapshotLocalAssetIds.filter((id) => id in result.database.assets), "awaiting-verification");
      await refreshLocalAssets();
      const postClickPatch = diffLibrary(snapshotEffective, current.effective, {
        previousPatch: current.patch,
      });
      const remaining = reconcilePatch(result.database, postClickPatch);
      const pagesPending = result.status === "committed"
        || result.database.revision !== snapshot.base.revision
        || snapshot.pendingPublication !== null;

      if (pagesPending) {
        const receiptAssetIds = [...new Set([
          ...(snapshot.pendingPublication ? pendingPublicationAssetIds(snapshot.pendingPublication) : []),
          ...snapshotLocalAssetIds,
          ...patchLocalAssetIds(result.reconciledPatch),
        ])].filter((id) => id in result.database.assets);
        const receipt: PendingPublicationReceipt = {
          version: 2,
          owner: GITHUB_REPOSITORY_OWNER,
          repo: GITHUB_REPOSITORY_NAME,
          branch: "main",
          sourceRevision: snapshot.pendingPublication?.sourceRevision ?? snapshot.base.revision,
          commitSha: result.commitSha,
          createdAt: new Date().toISOString(),
          database: result.database,
          assetIds: receiptAssetIds,
        };
        const installed = installPendingPublication(localStorage, receipt, remaining.patch);
        if (installed.ok) {
          undoStack.current = [];
          setPersistenceError(null);
          setLibraryState({ base: result.database, effective: remaining.effective, patch: remaining.patch, conflicts: remaining.conflicts, pendingPublication: receipt });
        } else {
          setPersistenceError(`${installed.error.message}. Коммит уже создан; локальный патч очистится после обновления Pages.`);
          setLibraryState({ ...current, pendingPublication: receipt });
        }
      } else {
        await verifyAndDeletePublishedLocalAssets(snapshotLocalAssetIds, result.database);
        await refreshLocalAssets();
        await refreshQuota();
        installReconciled(result.database, remaining, false, null);
        clearPendingPublication(localStorage);
        undoStack.current = [];
      }

      return {
        status: result.status,
        commitSha: result.commitSha,
        commitUrl: `https://github.com/${GITHUB_REPOSITORY_OWNER}/${GITHUB_REPOSITORY_NAME}/commit/${result.commitSha}`,
        pagesPending,
      };
    } finally {
      if (!publicationAccepted && snapshotLocalAssetIds.length) {
        await updateLocalAssetState(snapshotLocalAssetIds, "local").catch(() => undefined);
        await refreshLocalAssets();
      }
      syncInFlightRef.current = false;
    }
  }, [corruptedPatchRaw, installReconciled, refreshLocalAssets, refreshQuota, setLibraryState]);

  const fallbackBase = useMemo<LibraryDatabase>(() => ({ schemaVersion: LIBRARY_SCHEMA_VERSION, revision: "", publicationId: null, games: {}, notes: {}, assets: {} }), []);
  const resolvedState = state ?? { base: fallbackBase, effective: fallbackBase, patch: emptyPatch(""), conflicts: [], pendingPublication: null };
  const usage = state ? patchUsage(state.patch) : classifyStorageUsage(typeof localStorage === "undefined" ? 0 : (() => { try { return webkitStorageBytes(localStorage); } catch { return 0; } })(), SAFARI_SAFE_BUDGET_BYTES);
  const canAddBlob = useCallback(async (byteLength: number): Promise<string | null> => {
    if (!Number.isSafeInteger(byteLength) || byteLength < 0) return "Некорректный размер файла";
    if (attachmentWriteBlocked) return "Новые вложения заблокированы после отказа localStorage. Закоммитьте, экспортируйте или освободите место.";
    if (!persistRequestedRef.current) {
      persistRequestedRef.current = true;
      const granted = await requestPersistentOriginStorage();
      setPersistentStorage(granted || await storageIsPersisted());
    }
    const storageError = localAssetWritePreflight(localStorage, byteLength);
    await refreshQuota();
    return storageError;
  }, [attachmentWriteBlocked, refreshQuota]);
  const resolveAssetUrl = useCallback((assetId: string): string | null => {
    const asset = resolvedState.effective.assets[assetId];
    if (!asset) return null;
    return localAssetUrls[assetId] ?? publishedAssetUrl(asset, import.meta.env.BASE_URL);
  }, [localAssetUrls, resolvedState.effective.assets]);
  const exportRecoveryArchive = useCallback(async () => {
    const current = stateRef.current;
    if (!current) throw new Error("Библиотека ещё загружается");
    const assets = await listLocalAssets();
    downloadRecoveryArchive(await createRecoveryArchive(current.effective, current.patch, assets));
  }, []);
  const deleteAllLocalAssets = useCallback(async () => {
    const current = stateRef.current;
    if (!current) throw new Error("Библиотека ещё загружается");
    const records = await listLocalAssets();
    const unpublished = new Set(records.filter((asset) => !Object.prototype.hasOwnProperty.call(current.base.assets, asset.id)).map((asset) => asset.id));
    if (unpublished.size) mutate((database) => {
      Object.values(database.games).forEach((game) => { if (game.coverAssetId && unpublished.has(game.coverAssetId)) game.coverAssetId = null; });
      Object.values(database.notes).forEach((note) => { note.attachments = note.attachments.filter((attachment) => attachment.type === "link" || !unpublished.has(attachment.assetId)); });
      unpublished.forEach((id) => delete database.assets[id]);
    });
    await deleteLocalAssetsAtomic(records.map((asset) => asset.id));
    setAttachmentWriteBlocked(false);
    await refreshLocalAssets();
    await refreshQuota();
  }, [mutate, refreshLocalAssets, refreshQuota]);

  const refreshFromPublished = useCallback(async () => {
    const current = stateRef.current;
    if (!current) throw new Error("Библиотека ещё загружается");
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      const dataUrl = new URL(`${import.meta.env.BASE_URL}data/library.json`, document.baseURI);
      dataUrl.searchParams.set("_", String(Date.now()));
      const response = await fetch(dataUrl, { cache: "no-store" });
      if (!response.ok) throw new Error(`Не удалось обновить библиотеку: HTTP ${response.status}`);
      const parsed: unknown = await response.json();
      assertValidLibrary(parsed);
      const deployedBase = structuredClone(parsed);
      const computedRevision = computeLibraryRevision(deployedBase);
      if (deployedBase.revision && deployedBase.revision !== computedRevision) {
        throw new Error("Revision опубликованной базы не совпадает с её содержимым");
      }
      deployedBase.revision = computedRevision;

      let base = deployedBase;
      let pendingPublication = current.pendingPublication;

      if (pendingPublication) {
        const sameTarget = pendingPublication.owner === GITHUB_REPOSITORY_OWNER
          && pendingPublication.repo === GITHUB_REPOSITORY_NAME
          && pendingPublication.branch === "main";
        if (sameTarget && samePublishedVersion(deployedBase, pendingPublication.database)) {
          const receipt = pendingPublication;
          try {
            await verifyAndDeletePublishedLocalAssets(pendingPublicationAssetIds(receipt), deployedBase);
            clearPendingPublication(localStorage);
            pendingPublication = null;
            base = deployedBase;
          } catch (reason) {
            base = structuredClone(receipt.database);
            setPersistenceError(`Публикация не подтверждена, локальные файлы сохранены. ${reason instanceof Error ? reason.message : ""}`.trim());
          }
        } else if (sameTarget) {
          base = structuredClone(pendingPublication.database);
        }
      }

      const reconciled = garbageCollectReconciledAssets(base, reconcilePatch(base, current.patch));
      assertValidLibrary(reconciled.effective);
      installReconciled(base, reconciled, false, pendingPublication);
      await refreshLocalAssets();
      await refreshQuota();
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [installReconciled, refreshLocalAssets, refreshQuota]);

  const localAssetBytes = localAssets.reduce((total, asset) => total + asset.byteLength, 0);
  const value = useMemo<LibraryContextValue>(() => ({
    ...resolvedState,
    loading,
    fatalError,
    persistenceError,
    corruptedPatchRaw,
    usage,
    storageEstimate,
    quotaStatus,
    persistentStorage,
    attachmentsBlocked: attachmentWriteBlocked || quotaStatus.level === "blocked",
    localAssets,
    localAssetBytes,
    games: resolvedState.effective.games,
    canAddBlob,
    resolveAssetUrl,
    saveGame,
    deleteGame,
    moveGame,
    discardPath,
    discardPaths,
    clearPatch,
    resolvePatchConflict,
    importPatch,
    undoLast,
    downloadCorruptedPatch,
    exportRecoveryArchive,
    deleteAllLocalAssets,
    verifyGitHubAccess,
    syncToGitHub,
    refreshFromPublished,
  }), [resolvedState, loading, fatalError, persistenceError, corruptedPatchRaw, usage, storageEstimate, quotaStatus, persistentStorage, attachmentWriteBlocked, localAssets, localAssetBytes, canAddBlob, resolveAssetUrl, saveGame, deleteGame, moveGame, discardPath, discardPaths, clearPatch, resolvePatchConflict, importPatch, undoLast, downloadCorruptedPatch, exportRecoveryArchive, deleteAllLocalAssets, verifyGitHubAccess, syncToGitHub, refreshFromPublished]);

  publishLibrarySnapshot(value);

  return children;
}

export function useLibrary(): LibraryContextValue {
  return useLibrarySelector((snapshot) => snapshot);
}

export function operationLocalValue(database: LibraryDatabase, path: string): unknown {
  const parsed = parsePatchPath(path);
  if (!parsed) return undefined;
  const entity = database[parsed.map][parsed.id] as unknown as Record<string, unknown> | undefined;
  return parsed.field ? entity?.[parsed.field] : entity;
}
