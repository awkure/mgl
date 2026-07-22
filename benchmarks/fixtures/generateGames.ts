import {
  IMPORTED_VIA_IDS,
  STATUS_IDS,
  TIER_IDS,
  type Game,
  type ImportedViaId,
  type StatusId,
  type TierId,
} from "../../src/domain/types";

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateGames(count: number, seed = 1): Game[] {
  const rnd = mulberry32(seed);
  const games: Game[] = [];
  for (let i = 0; i < count; i += 1) {
    const id = `bench-${String(i).padStart(5, "0")}`;
    const status = STATUS_IDS[Math.floor(rnd() * STATUS_IDS.length)] as StatusId;
    const tierId = TIER_IDS[Math.floor(rnd() * TIER_IDS.length)] as TierId;
    const importedVia = IMPORTED_VIA_IDS[Math.floor(rnd() * IMPORTED_VIA_IDS.length)] as ImportedViaId;
    const updatedAt = new Date(1_700_000_000_000 + i * 60_000).toISOString();
    games.push({
      id,
      title: `Bench Game ${i}`,
      coverAssetId: null,
      steamAppId: null,
      importedVia,
      hoursPlayed: null,
      lastPlayedAt: null, steamOverrides: {},
      platforms: rnd() > 0.5 ? ["PC"] : ["PC", "PS5"],
      tags: rnd() > 0.5 ? ["action"] : ["rpg", "indie"],
      status,
      placement: { tierId, rank: (i + 1) * 1024 },
      reviewMarkdown: "",
      createdAt: updatedAt,
      updatedAt,
    });
  }
  return games;
}
