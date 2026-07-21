import { useMemo, useRef, useState, type AnchorHTMLAttributes, type CSSProperties, type HTMLAttributes } from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardCode,
  KeyboardSensor,
  pointerWithin,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TIER_IDS, type Asset, type Game, type TierId } from "../domain/types";
import { GameCard } from "../components/GameCard";
import { Icon } from "../components/Icon";
import { sortGamesByPlacement, TIER_DESCRIPTIONS, TIER_LABELS } from "../components/libraryUi";

export type TierGameIds = Record<TierId, string[]>;

export interface MoveGameTarget {
  tierId: TierId;
  index: number;
}

export interface TierListPageProps {
  games: Game[];
  assets: Record<string, Asset>;
  onMoveGame: (gameId: string, target: MoveGameTarget) => void;
  onOpenGame?: (gameId: string) => void;
  resolveAssetUrl?: (assetId: string) => string | null;
}

export class NonTouchPointerSensor extends PointerSensor {
  static activators: typeof PointerSensor.activators = [{
    eventName: "onPointerDown",
    handler: (event, options) => {
      if (event.nativeEvent.pointerType === "touch") return false;
      return PointerSensor.activators[0].handler(event, options);
    },
  }];
}

export const TIER_LIST_SENSOR_TYPES = {
  pointer: NonTouchPointerSensor,
  touch: TouchSensor,
  keyboard: KeyboardSensor,
} as const;

export const TIER_LIST_SORTING_STRATEGY = rectSortingStrategy;

export const TIER_LIST_SENSOR_OPTIONS = {
  pointer: { activationConstraint: { distance: 8 } },
  touch: { activationConstraint: { delay: 180, tolerance: 8 } },
  keyboard: {
    coordinateGetter: sortableKeyboardCoordinates,
    keyboardCodes: {
      start: [KeyboardCode.Space],
      cancel: [KeyboardCode.Esc],
      end: [KeyboardCode.Space, KeyboardCode.Enter, KeyboardCode.Tab],
    },
  },
};

export const tierListCollisionDetection: CollisionDetection = (args) => {
  if (!args.pointerCoordinates) return closestCenter(args);

  const collisions = pointerWithin(args);
  const gameCollision = collisions.find((collision) => collision.data?.droppableContainer.data.current?.type === "game");
  if (gameCollision) return [gameCollision];

  const tierCollision = collisions.find((collision) => collision.data?.droppableContainer.data.current?.type === "tier");
  return tierCollision ? [tierCollision] : [];
};

export function getTierDropTarget(
  games: Game[],
  activeGameId: string,
  targetTierId: TierId,
  overGameId: string | null,
): MoveGameTarget | null {
  const activeGame = games.find((game) => game.id === activeGameId);
  if (!activeGame || overGameId === activeGameId) return null;

  const targetGames = sortGamesByPlacement(games.filter((game) => game.placement.tierId === targetTierId));
  const destination = targetGames.filter((game) => game.id !== activeGameId);
  if (!overGameId) return { tierId: targetTierId, index: destination.length };

  let index = destination.findIndex((game) => game.id === overGameId);
  if (index < 0) return null;

  if (activeGame.placement.tierId === targetTierId) {
    const sourceGames = sortGamesByPlacement(games.filter((game) => game.placement.tierId === targetTierId));
    const sourceIndex = sourceGames.findIndex((game) => game.id === activeGameId);
    const overIndex = sourceGames.findIndex((game) => game.id === overGameId);
    if (sourceIndex >= 0 && overIndex >= 0 && sourceIndex < overIndex) index += 1;
  }

  return { tierId: targetTierId, index: Math.min(index, destination.length) };
}

export function buildTierGameIds(games: Game[]): TierGameIds {
  return Object.fromEntries(
    TIER_IDS.map((tierId) => [
      tierId,
      sortGamesByPlacement(games.filter((game) => game.placement.tierId === tierId)).map((game) => game.id),
    ]),
  ) as TierGameIds;
}

export function findTierIdForSortable(items: TierGameIds, sortableId: string): TierId | null {
  if (sortableId.startsWith("tier:")) {
    const tierId = sortableId.slice("tier:".length) as TierId;
    return TIER_IDS.includes(tierId) ? tierId : null;
  }
  if (!sortableId.startsWith("game:")) return null;
  const gameId = sortableId.slice("game:".length);
  for (const tierId of TIER_IDS) {
    if (items[tierId].includes(gameId)) return tierId;
  }
  return null;
}

/** Insert active into another tier's item list so that tier's SortableContext can animate siblings. */
export function relocateActiveGameAcrossTiers(
  items: TierGameIds,
  activeGameId: string,
  overTierId: TierId,
  overGameId: string | null,
): TierGameIds | null {
  const activeTierId = TIER_IDS.find((tierId) => items[tierId].includes(activeGameId));
  if (!activeTierId || activeTierId === overTierId) return null;
  // Empty target has no siblings to shift; keep the active card mounted in its source tier.
  if (items[overTierId].length === 0) return null;

  const destination = items[overTierId].filter((gameId) => gameId !== activeGameId);
  let index = overGameId ? destination.indexOf(overGameId) : destination.length;
  if (overGameId && index < 0) return null;
  index = Math.min(Math.max(index, 0), destination.length);

  return {
    ...items,
    [activeTierId]: items[activeTierId].filter((gameId) => gameId !== activeGameId),
    [overTierId]: [...destination.slice(0, index), activeGameId, ...destination.slice(index)],
  };
}

function SortableGame({
  game,
  tierId,
  asset,
  onOpenGame,
  resolveAssetUrl,
}: {
  game: Game;
  tierId: TierId;
  asset?: Asset;
  onOpenGame?: (id: string) => void;
  resolveAssetUrl?: (assetId: string) => string | null;
}) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `game:${game.id}`,
    attributes: { roleDescription: "перетаскиваемая игра" },
    data: { type: "game", gameId: game.id, tierId },
  });
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition };
  return (
    <GameCard
      asset={asset}
      dragLinkProps={{
        "aria-describedby": attributes["aria-describedby"],
        "aria-disabled": attributes["aria-disabled"],
        "aria-roledescription": attributes["aria-roledescription"],
        onKeyDown: listeners?.onKeyDown,
        tabIndex: attributes.tabIndex,
      } as AnchorHTMLAttributes<HTMLAnchorElement>}
      dragLinkRef={setActivatorNodeRef}
      dragRootProps={{ onPointerDown: listeners?.onPointerDown, onTouchStart: listeners?.onTouchStart } as HTMLAttributes<HTMLElement>}
      game={game}
      isDragging={isDragging}
      onOpen={onOpenGame}
      ref={setNodeRef}
      resolveAssetUrl={resolveAssetUrl}
      style={style}
    />
  );
}

function TierRow({
  tierId,
  games,
  assets,
  onOpenGame,
  resolveAssetUrl,
}: {
  tierId: TierId;
  games: Game[];
  assets: Record<string, Asset>;
  onOpenGame?: (id: string) => void;
  resolveAssetUrl?: (assetId: string) => string | null;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `tier:${tierId}`, data: { type: "tier", tierId } });
  const compactLabel = tierId === "unranked" ? "—" : TIER_LABELS[tierId];
  return (
    <section className={`tier-row tier-row--${tierId}${isOver ? " is-over" : ""}`} aria-labelledby={`tier-${tierId}`}>
      <header className="tier-row__label">
        <strong aria-hidden="true" title={TIER_LABELS[tierId]}>{compactLabel}</strong>
        <span className="visually-hidden" id={`tier-${tierId}`}>{TIER_LABELS[tierId]}</span>
        <span>{TIER_DESCRIPTIONS[tierId]}</span>
      </header>
      <div className="tier-row__games" ref={setNodeRef}>
        <SortableContext items={games.map((game) => `game:${game.id}`)} strategy={TIER_LIST_SORTING_STRATEGY}>
          {games.map((game) => (
            <SortableGame
              asset={game.coverAssetId ? assets[game.coverAssetId] : undefined}
              game={game}
              key={game.id}
              onOpenGame={onOpenGame}
              resolveAssetUrl={resolveAssetUrl}
              tierId={tierId}
            />
          ))}
        </SortableContext>
        {!games.length ? <div className="tier-row__empty"><Icon name="plus" size={18} />Перетащите игру сюда</div> : null}
      </div>
    </section>
  );
}

export function TierListPage({ games, assets, onMoveGame, onOpenGame, resolveAssetUrl }: TierListPageProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragItems, setDragItems] = useState<TierGameIds | null>(null);
  const dragItemsRef = useRef<TierGameIds | null>(null);
  const suppressOpen = useRef(false);
  const sensors = useSensors(
    useSensor(TIER_LIST_SENSOR_TYPES.pointer, TIER_LIST_SENSOR_OPTIONS.pointer),
    useSensor(TIER_LIST_SENSOR_TYPES.touch, TIER_LIST_SENSOR_OPTIONS.touch),
    useSensor(TIER_LIST_SENSOR_TYPES.keyboard, TIER_LIST_SENSOR_OPTIONS.keyboard),
  );
  const baseItems = useMemo(() => buildTierGameIds(games), [games]);
  const items = dragItems ?? baseItems;
  const gameById = useMemo(() => Object.fromEntries(games.map((game) => [game.id, game])), [games]);
  const byTier = useMemo(
    () => Object.fromEntries(
      TIER_IDS.map((tierId) => [tierId, items[tierId].map((gameId) => gameById[gameId]).filter((game): game is Game => Boolean(game))]),
    ) as Record<TierId, Game[]>,
    [gameById, items],
  );
  const activeGame = activeId ? gameById[activeId] ?? null : null;

  const onDragStart = ({ active }: DragStartEvent) => {
    const gameId = String(active.data.current?.gameId ?? "");
    suppressOpen.current = true;
    setActiveId(gameId);
    dragItemsRef.current = baseItems;
    setDragItems(baseItems);
  };
  const finishDrag = () => {
    setActiveId(null);
    dragItemsRef.current = null;
    setDragItems(null);
    // Keep suppress through the ghost click that follows pointerup; clear after that task.
    window.setTimeout(() => {
      suppressOpen.current = false;
    }, 0);
  };
  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const current = dragItemsRef.current;
    if (!current) return;
    const activeGameId = String(active.data.current?.gameId ?? "");
    if (!activeGameId) return;
    const overTierId = findTierIdForSortable(current, String(over.id));
    if (!overTierId) return;
    const overGameId = over.data.current?.type === "game" ? String(over.data.current.gameId) : null;
    const next = relocateActiveGameAcrossTiers(current, activeGameId, overTierId, overGameId);
    if (!next) return;
    dragItemsRef.current = next;
    setDragItems(next);
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const gameId = String(active.data.current?.gameId ?? "");
    const currentItems = dragItemsRef.current;
    finishDrag();
    if (!over) return;
    if (over.id === active.id) return;
    // Prefer live container membership after cross-tier preview; fall back to droppable data.
    const targetTier = (
      (currentItems ? findTierIdForSortable(currentItems, String(over.id)) : null)
      ?? (over.data.current?.tierId as TierId | undefined)
      ?? (active.data.current?.tierId as TierId | undefined)
    );
    if (!targetTier) return;
    const overGameId = over.data.current?.type === "game" ? String(over.data.current.gameId) : null;
    const target = getTierDropTarget(games, gameId, targetTier, overGameId);
    if (target) onMoveGame(gameId, target);
  };
  const openGame = onOpenGame ? (gameId: string) => {
    if (suppressOpen.current) return;
    onOpenGame(gameId);
  } : undefined;
  return (
    <div className={`page tier-page${games.length ? "" : " tier-page--empty"}`}>
      <h1 className="visually-hidden">Тирлист игр</h1>
      {!games.length ? (
        <div className="empty-state empty-state--hero"><span className="empty-state__icon"><Icon name="gamepad" /></span><h2>Здесь появится ваш тирлист</h2><p>Добавьте первую игру, а затем перемещайте карточки между тирами.</p><a className="button button--primary" href="#/games/new"><Icon name="plus" size={18} />Добавить первую игру</a></div>
      ) : (
        <DndContext
          accessibility={{ announcements: { onDragStart: ({ active }) => `Вы взяли игру ${games.find((game) => `game:${game.id}` === active.id)?.title ?? ""}.`, onDragOver: ({ over }) => over ? "Выберите это место, чтобы переместить игру." : "Игра вне списка.", onDragEnd: ({ over }) => over ? "Игра перемещена." : "Перемещение отменено.", onDragCancel: () => "Перемещение отменено." } }}
          autoScroll
          collisionDetection={tierListCollisionDetection}
          onDragCancel={finishDrag}
          onDragEnd={onDragEnd}
          onDragOver={onDragOver}
          onDragStart={onDragStart}
          sensors={sensors}
        >
          <div className="tier-board">
            {TIER_IDS.map((tierId) => <TierRow assets={assets} games={byTier[tierId]} key={tierId} onOpenGame={openGame} resolveAssetUrl={resolveAssetUrl} tierId={tierId} />)}
          </div>
          <DragOverlay>{activeGame ? <GameCard asset={activeGame.coverAssetId ? assets[activeGame.coverAssetId] : undefined} game={activeGame} isDragging onOpen={openGame} resolveAssetUrl={resolveAssetUrl} /> : null}</DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
