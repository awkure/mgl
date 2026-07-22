import type { GameSaveInput } from "../pages/GamePage";
import {
  base64ToBytes,
  deleteLocalAssetsAtomic,
  makeLocalAsset,
  publishedAssetUrl,
  sha256Bytes,
  type Asset,
  type LibraryDatabase,
  type LocalAsset,
} from "../domain";

export function assetFromPrepared(image: { assetId: string; width: number; height: number; alt: string; originalName: string; byteLength: number }): Asset {
  return { id: image.assetId, kind: "image", mime: "image/webp", width: image.width, height: image.height, byteLength: image.byteLength, alt: image.alt, originalName: image.originalName };
}

export function retainLocalAsset(database: LibraryDatabase, asset: Asset, expectedKind: "image" | "file"): string {
  const existing = database.assets[asset.id];
  if (existing) {
    const compatible = expectedKind === "file" ? existing.kind === "file" : existing.kind !== "file";
    if (!compatible) throw new Error("Файл с тем же содержимым уже сохранён как другой тип asset");
    return existing.id;
  }
  database.assets[asset.id] = asset;
  return asset.id;
}

export function preparedLocalAssets(input: GameSaveInput, base: LibraryDatabase): LocalAsset[] {
  const result = new Map<string, LocalAsset>();
  const add = (id: string, blob: Blob, mimeType: string, expectedBytes: number) => {
    if (Object.prototype.hasOwnProperty.call(base.assets, id)) return;
    if (blob.size !== expectedBytes) throw new Error("Размер подготовленного вложения не совпадает с Blob");
    result.set(id, makeLocalAsset(id, blob, mimeType));
  };
  if (input.pendingCover) add(input.pendingCover.assetId, input.pendingCover.blob, input.pendingCover.mime, input.pendingCover.byteLength);
  for (const note of input.notes) for (const attachment of note.attachments) {
    if (attachment.type === "pending-image") add(attachment.image.assetId, attachment.image.blob, attachment.image.mime, attachment.image.byteLength);
    if (attachment.type === "pending-file") add(attachment.file.assetId, attachment.file.blob, attachment.file.mime, attachment.file.byteLength);
  }
  return [...result.values()];
}

export function localAssetsFromLegacyBlobs(blobs: Record<string, string>, assets: Record<string, Asset>): LocalAsset[] {
  return Object.entries(blobs).map(([id, encoded]) => {
    const asset = assets[id];
    if (!asset) throw new Error(`Для legacy Blob ${id} отсутствует metadata`);
    const bytes = base64ToBytes(encoded);
    if (bytes.byteLength !== asset.byteLength) throw new Error(`Размер legacy Blob ${id} не совпадает с metadata`);
    const mime = asset.kind === "image" ? "image/webp" : asset.mime;
    return makeLocalAsset(id, new Blob([bytes.slice().buffer as ArrayBuffer], { type: mime }), mime);
  });
}

export async function verifyPublishedLocalAssets(ids: string[], database: LibraryDatabase): Promise<void> {
  for (const id of ids) {
    const asset = database.assets[id];
    if (!asset) throw new Error(`Опубликованная база не содержит asset ${id}`);
    const url = publishedAssetUrl(asset, import.meta.env.BASE_URL);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Опубликованный файл ${id} пока недоступен: HTTP ${response.status}`);
    const blob = await response.blob();
    if (blob.size !== asset.byteLength) throw new Error(`Размер опубликованного файла ${id} не совпадает`);
    if (sha256Bytes(new Uint8Array(await blob.arrayBuffer())) !== id) throw new Error(`SHA-256 опубликованного файла ${id} не совпадает`);
  }
}

export async function verifyAndDeletePublishedLocalAssets(ids: string[], database: LibraryDatabase): Promise<void> {
  await verifyPublishedLocalAssets(ids, database);
  await deleteLocalAssetsAtomic(ids);
}
