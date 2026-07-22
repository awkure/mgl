import { memo, useMemo, type MutableRefObject } from "react";
import type { Game } from "../domain/types";
import { CatalogPage } from "../pages/CatalogPage";
import { GamePage } from "../pages/GamePage";
import { TierListPage, type MoveGameTarget } from "../pages/TierListPage";
import { useLibrarySelector } from "../state/LibraryContext";
import type { StackEntry } from "../state/tabStacks";

function gamesFromSnapshot(s: { effective: { games: Record<string, Game> } }) {
  return Object.values(s.effective.games);
}

function shallowArrayEqual<T>(a: T[], b: T[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function gameIdFromPath(pathname: string): string | null {
  const match = /^\/games\/([^/]+)$/.exec(pathname);
  if (!match || match[1] === "new") return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export const CatalogRouteIsland = memo(function CatalogRouteIsland({
  active,
  scrollSelf,
  onOpenGame,
}: {
  active: boolean;
  scrollSelf?: boolean;
  onOpenGame: (id: string) => void;
}) {
  const games = useLibrarySelector(gamesFromSnapshot, shallowArrayEqual);
  const assets = useLibrarySelector((s) => s.effective.assets);
  const resolveAssetUrl = useLibrarySelector((s) => s.resolveAssetUrl);
  const refreshFromPublished = useLibrarySelector((s) => s.refreshFromPublished);

  return (
    <CatalogPage
      active={active}
      assets={assets}
      games={games}
      onOpenGame={onOpenGame}
      onRefresh={() => refreshFromPublished()}
      resolveAssetUrl={resolveAssetUrl}
      scrollSelf={scrollSelf}
    />
  );
});

export const TierRouteIsland = memo(function TierRouteIsland({
  draggingRef,
  onMoveGame,
  onOpenGame,
}: {
  draggingRef?: MutableRefObject<boolean>;
  onMoveGame: (gameId: string, target: MoveGameTarget) => void;
  onOpenGame: (id: string) => void;
}) {
  const games = useLibrarySelector(gamesFromSnapshot, shallowArrayEqual);
  const assets = useLibrarySelector((s) => s.effective.assets);
  const resolveAssetUrl = useLibrarySelector((s) => s.resolveAssetUrl);
  const refreshFromPublished = useLibrarySelector((s) => s.refreshFromPublished);

  return (
    <TierListPage
      assets={assets}
      draggingRef={draggingRef}
      games={games}
      onMoveGame={onMoveGame}
      onOpenGame={onOpenGame}
      onRefresh={() => refreshFromPublished()}
      resolveAssetUrl={resolveAssetUrl}
    />
  );
});

export const GameRouteIsland = memo(function GameRouteIsland({
  entry,
  onPop,
  onReplaceGame,
  showError,
}: {
  entry: StackEntry;
  onPop: () => void;
  onReplaceGame: (gameId: string) => void;
  showError: (error: unknown) => void;
}) {
  const mode = entry.pathname === "/games/new" ? ("new" as const) : ("game" as const);
  const id = mode === "game" ? gameIdFromPath(entry.pathname) : null;

  const game = useLibrarySelector((s) => (id ? s.effective.games[id] : undefined));
  const gameSuggestions = useLibrarySelector(gamesFromSnapshot, shallowArrayEqual);
  const notes = useLibrarySelector(
    (s) => (id ? Object.values(s.effective.notes).filter((note) => note.gameId === id) : []),
    shallowArrayEqual,
  );
  const assets = useLibrarySelector((s) => s.effective.assets);
  const canAddBlob = useLibrarySelector((s) => s.canAddBlob);
  const resolveAssetUrl = useLibrarySelector((s) => s.resolveAssetUrl);
  const attachmentsBlocked = useLibrarySelector((s) => s.attachmentsBlocked);
  const deleteGame = useLibrarySelector((s) => s.deleteGame);
  const saveGame = useLibrarySelector((s) => s.saveGame);

  const platformSuggestions = useMemo(
    () => [...new Set(gameSuggestions.flatMap((item) => item.platforms))],
    [gameSuggestions],
  );
  const tagSuggestions = useMemo(
    () => [...new Set(gameSuggestions.flatMap((item) => item.tags))],
    [gameSuggestions],
  );

  if (mode === "game" && !game) {
    return (
      <div className="empty-state empty-state--hero">
        <h1>Игра не найдена</h1>
        <p>Возможно, она была удалена локально.</p>
        <button className="button button--primary" onClick={onPop} type="button">
          Назад
        </button>
      </div>
    );
  }

  return (
    <GamePage
      assets={assets}
      canAddBlob={canAddBlob}
      game={game}
      gameSuggestions={gameSuggestions}
      key={game?.id ?? "new"}
      mode={mode}
      notes={notes}
      onCancel={onPop}
      onDelete={
        game
          ? async (gameId) => {
              deleteGame(gameId);
              onPop();
            }
          : undefined
      }
      onSave={async (input) => {
        try {
          const gameId = await saveGame(input);
          if (mode === "new") onReplaceGame(gameId);
        } catch (error) {
          showError(error);
        }
      }}
      platformSuggestions={platformSuggestions}
      resolveAssetUrl={resolveAssetUrl}
      storageLocked={attachmentsBlocked}
      tagSuggestions={tagSuggestions}
    />
  );
});
