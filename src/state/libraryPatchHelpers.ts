import {
  PATCH_STORAGE_KEY,
  LIBRARY_SCHEMA_VERSION,
  classifyStorageUsage,
  diffLibrary,
  garbageCollectUnreferencedAssets,
  projectedStorageUsage,
  reconcilePatch,
  referencedAssetIds,
  webkitStringBytes,
  type Asset,
  type LibraryDatabase,
  type PatchEnvelope,
  type ReconciledPatch,
  type StorageUsage,
} from "../domain";

export function emptyPatch(baseRevision: string): PatchEnvelope {
  return { patchVersion: 2, schemaVersion: LIBRARY_SCHEMA_VERSION, baseRevision, operations: {}, blobs: {} };
}

export function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const trimmed = value.trim();
    const key = trimmed.toLocaleLowerCase("ru");
    if (!trimmed || seen.has(key)) return [];
    seen.add(key);
    return [trimmed];
  });
}

export function maxRank(items: Array<{ rank: number }>): number {
  return items.reduce((maximum, item) => Math.max(maximum, item.rank), 0);
}

export function patchAssetMetadata(patch: PatchEnvelope): Record<string, Asset> {
  return Object.fromEntries(Object.entries(patch.operations).flatMap(([path, operation]) => {
    const match = /^\/assets\/([0-9a-f]{64})$/.exec(path);
    return match && operation.operation === "set" && operation.value && typeof operation.value === "object"
      ? [[match[1], operation.value as Asset]]
      : [];
  }));
}

export function patchLocalAssetIds(patch: PatchEnvelope): string[] {
  return Object.keys(patchAssetMetadata(patch))
    .filter((id) => patch.operations[`/assets/${id}`]?.baseExists === false)
    .sort();
}

export function requiredLocalAssetIds(patch: PatchEnvelope, database: LibraryDatabase): string[] {
  const referenced = referencedAssetIds(database);
  return patchLocalAssetIds(patch).filter((id) => referenced.has(id));
}

export function patchUsage(patch: PatchEnvelope): StorageUsage {
  try {
    return projectedStorageUsage(localStorage, PATCH_STORAGE_KEY, JSON.stringify(patch));
  } catch {
    return classifyStorageUsage(webkitStringBytes(PATCH_STORAGE_KEY, JSON.stringify(patch)));
  }
}

export function garbageCollectReconciledAssets(base: LibraryDatabase, reconciled: ReconciledPatch): ReconciledPatch {
  if (reconciled.conflicts.length) return reconciled;
  const effective = structuredClone(reconciled.effective);
  if (!garbageCollectUnreferencedAssets(effective).length) return reconciled;
  return reconcilePatch(base, diffLibrary(base, effective, { previousPatch: reconciled.patch }));
}

export function samePublishedVersion(left: LibraryDatabase, right: LibraryDatabase): boolean {
  return left.revision === right.revision
    || left.publicationId !== null && left.publicationId === right.publicationId;
}
