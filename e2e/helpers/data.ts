import type { Page } from "playwright/test";

export interface LibraryGame {
  id: string;
  title: string;
  status: string;
  platforms: string[];
  tags: string[];
}

export interface LibraryFixture {
  games: LibraryGame[];
  countByStatus(status: string): number;
  /** First game whose full title (case-insensitive) is a substring of exactly one library title. */
  uniqueTitleGame(): { id: string; title: string };
  /** Query that matches zero games. */
  noMatchQuery(): string;
  /** First status id with at least one game. */
  statusWithGames(): string;
}

export async function loadLibraryFixture(page: Page): Promise<LibraryFixture> {
  const response = await page.request.get("/data/library.json");
  if (!response.ok()) {
    throw new Error(`Failed to load library.json: ${response.status()}`);
  }
  const data = await response.json() as {
    games: Record<string, {
      title: string;
      status: string;
      platforms?: string[];
      tags?: string[];
    }>;
  };

  const games: LibraryGame[] = Object.entries(data.games).map(([id, game]) => ({
    id,
    title: game.title,
    status: game.status,
    platforms: game.platforms ?? [],
    tags: game.tags ?? [],
  }));

  return {
    games,
    countByStatus(status: string) {
      return games.filter((game) => game.status === status).length;
    },
    uniqueTitleGame() {
      const titles = games.map((game) => game.title);
      for (const game of games) {
        const needle = game.title.toLocaleLowerCase("ru");
        const hits = titles.filter((title) => title.toLocaleLowerCase("ru").includes(needle));
        if (hits.length === 1) return { id: game.id, title: game.title };
      }
      throw new Error("No unique-title game found in library.json");
    },
    noMatchQuery() {
      return "zzzz-no-such-game-zzzz";
    },
    statusWithGames() {
      const counts = new Map<string, number>();
      for (const game of games) {
        counts.set(game.status, (counts.get(game.status) ?? 0) + 1);
      }
      for (const [status, count] of counts) {
        if (count > 0) return status;
      }
      throw new Error("Library has no games");
    },
  };
}
