import type { DiffGroupId } from "../components";
import { describeAssetChange, parsePatchPath, type Asset, type LibraryDatabase, type PatchOperation } from "../domain";
import { formatBytes } from "../components/libraryUi";

export const fieldLabels: Record<string, string> = {
  title: "Название",
  coverAssetId: "Обложка",
  steamAppId: "Steam App ID",
  importedVia: "Импорт через",
  hoursPlayed: "Часов в игре",
  platforms: "Платформы",
  tags: "Теги",
  status: "Статус",
  placement: "Позиция в тирлисте",
  reviewMarkdown: "Заметка",
  bodyMarkdown: "Текст заметки",
  attachments: "Вложения",
  groupRank: "Группа",
  rank: "Порядок",
  gameId: "Игра",
};

export function entityName(
  map: string,
  id: string,
  operation: PatchOperation,
  effective: LibraryDatabase,
  base: LibraryDatabase,
): string {
  const rootValue = operation.operation === "set" && operation.value && typeof operation.value === "object"
    ? operation.value as Record<string, unknown>
    : undefined;
  if (map === "games") return String(effective.games[id]?.title ?? base.games[id]?.title ?? rootValue?.title ?? "Игра");
  if (map === "notes") {
    const note = effective.notes[id] ?? base.notes[id];
    const gameId = note?.gameId ?? (typeof rootValue?.gameId === "string" ? rootValue.gameId : undefined);
    const game = gameId ? effective.games[gameId] ?? base.games[gameId] : undefined;
    return `Заметка${game ? ` · ${game.title}` : ""}`;
  }
  if (map === "assets") {
    const asset = effective.assets[id] ?? base.assets[id] ?? rootValue as Asset | undefined;
    const database = effective.assets[id] ? effective : base.assets[id] ? base : effective;
    return describeAssetChange(database, id, asset?.originalName);
  }
  return "Изображение";
}

export function classifyDiff(path: string, operation: PatchOperation): DiffGroupId {
  const parsed = parsePatchPath(path);
  if (!parsed) return "changed";
  if (parsed.map === "assets") return "assets";
  if (parsed.field === "placement" || parsed.field === "groupRank" || parsed.field === "rank") return "moved";
  if (!parsed.field && operation.operation === "set" && !operation.baseExists) return "added";
  if (!parsed.field && operation.operation === "delete") return "deleted";
  return "changed";
}

export function assetMeta(asset: Asset | undefined): string[] | undefined {
  if (!asset) return undefined;
  if (asset.kind === "file") return [asset.mime, formatBytes(asset.byteLength)];
  return [`${asset.width}×${asset.height}`, formatBytes(Math.max(0, asset.byteLength)), "WebP"];
}

export function assetSummary(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const asset = value as Partial<Asset>;
  return {
    kind: asset.kind ?? "image",
    type: asset.mime ?? "application/octet-stream",
    width: asset.width,
    height: asset.height,
    bytes: typeof asset.byteLength === "number" ? asset.byteLength : undefined,
    alt: asset.alt,
    originalName: asset.originalName,
  };
}
