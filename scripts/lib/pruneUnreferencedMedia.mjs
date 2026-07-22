/** Delete public/media files not referenced by library.assets (after apply GC). */

import { readdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import { externalAssetFilename } from "../validate-data.mjs";

/**
 * @param {string} mediaRoot
 * @param {Record<string, object>} assets
 * @returns {number} removed file count
 */
export function pruneUnreferencedMediaFiles(mediaRoot, assets) {
  const expected = new Set(
    Object.entries(assets ?? {}).map(([id, asset]) => externalAssetFilename(id, asset)),
  );
  let removed = 0;
  for (const entry of readdirSync(mediaRoot, { withFileTypes: true })) {
    if (entry.name === ".gitkeep") continue;
    if (!entry.isFile()) continue;
    if (expected.has(entry.name)) continue;
    unlinkSync(path.join(mediaRoot, entry.name));
    removed += 1;
  }
  return removed;
}
