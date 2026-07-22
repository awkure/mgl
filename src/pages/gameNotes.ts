import {
  closestCenter,
  KeyboardCode,
  KeyboardSensor,
  pointerWithin,
  PointerSensor,
  TouchSensor,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates, type SortingStrategy } from "@dnd-kit/sortable";
import { moveRanked } from "../domain/ranks";
import { DEFAULT_NOTE_GROUP_RANK } from "../domain/types";

/** Fields required by note grouping and drop placement helpers. */
export interface GameNoteDraft {
  clientId: string;
  groupRank?: number;
  rank: number;
}

export interface EditableNoteGroup<T extends GameNoteDraft = GameNoteDraft> {
  groupRank: number;
  notes: T[];
}

export interface NoteDropPlacement {
  groupRank: number;
  index: number;
}

export type NoteDropEdge = "before" | "after";

export function noteGroupRank(note: Pick<GameNoteDraft, "groupRank">): number {
  return note.groupRank ?? DEFAULT_NOTE_GROUP_RANK;
}

export function groupDraftNotes<T extends GameNoteDraft>(notes: T[]): EditableNoteGroup<T>[] {
  const groups = new Map<number, T[]>();
  for (const note of notes) {
    const groupRank = noteGroupRank(note);
    const group = groups.get(groupRank) ?? [];
    group.push(note);
    groups.set(groupRank, group);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left - right)
    .map(([groupRank, groupNotes]) => ({
      groupRank,
      notes: groupNotes.sort((left, right) => left.rank - right.rank || left.clientId.localeCompare(right.clientId)),
    }));
}

export function nextEmptyNoteGroupRank(notes: GameNoteDraft[]): number {
  if (!notes.length) return DEFAULT_NOTE_GROUP_RANK;
  return Math.max(...notes.map(noteGroupRank)) + 1024;
}

export function moveDraftNoteToGroup<T extends GameNoteDraft>(
  notes: T[],
  clientId: string,
  groupRank: number,
  targetIndex: number,
): T[] {
  const moving = notes.find((note) => note.clientId === clientId);
  if (!moving) return notes;
  const targetNotes = notes.filter((note) => note.clientId !== clientId && noteGroupRank(note) === groupRank);
  const ranked = moveRanked(
    [...targetNotes, { ...moving, groupRank }].map((note) => ({ id: note.clientId, rank: note.rank, note })),
    clientId,
    targetIndex,
  ).items;
  const updates = new Map(ranked.map((item) => [item.id, { ...item.note, groupRank, rank: item.rank }]));
  return notes.map((note) => updates.get(note.clientId) ?? note);
}

export function getImplicitNoteDropEdge(notes: GameNoteDraft[], activeClientId: string, overClientId: string): NoteDropEdge | null {
  if (activeClientId === overClientId) return null;
  const active = notes.find((note) => note.clientId === activeClientId);
  const over = notes.find((note) => note.clientId === overClientId);
  if (!active || !over) return null;
  const groupRank = noteGroupRank(over);
  const ordered = groupDraftNotes(notes).find((group) => group.groupRank === groupRank)?.notes ?? [];
  const sourceIndex = ordered.findIndex((note) => note.clientId === activeClientId);
  const overIndex = ordered.findIndex((note) => note.clientId === overClientId);
  if (overIndex < 0) return null;
  return noteGroupRank(active) === groupRank && sourceIndex >= 0 && sourceIndex < overIndex ? "after" : "before";
}

export function getNoteDropPlacement(
  notes: GameNoteDraft[],
  activeClientId: string,
  overClientId: string,
  edge?: NoteDropEdge,
): NoteDropPlacement | null {
  if (activeClientId === overClientId) return null;
  const active = notes.find((note) => note.clientId === activeClientId);
  const over = notes.find((note) => note.clientId === overClientId);
  if (!active || !over) return null;
  const groupRank = noteGroupRank(over);
  const ordered = groupDraftNotes(notes).find((group) => group.groupRank === groupRank)?.notes ?? [];
  const destination = ordered.filter((note) => note.clientId !== activeClientId);
  let targetIndex = destination.findIndex((note) => note.clientId === overClientId);
  if (targetIndex < 0) return null;
  const resolvedEdge = edge ?? getImplicitNoteDropEdge(notes, activeClientId, overClientId);
  if (resolvedEdge === "after") targetIndex += 1;
  return { groupRank, index: Math.min(targetIndex, destination.length) };
}

export function getNoteDropIndex(
  notes: GameNoteDraft[],
  activeClientId: string,
  overClientId: string,
  edge?: NoteDropEdge,
): number | null {
  return getNoteDropPlacement(notes, activeClientId, overClientId, edge)?.index ?? null;
}

export class NonTouchNotePointerSensor extends PointerSensor {
  static activators: typeof PointerSensor.activators = [{
    eventName: "onPointerDown",
    handler: (event, options) => {
      if (event.nativeEvent.pointerType === "touch") return false;
      return PointerSensor.activators[0].handler(event, options);
    },
  }];
}

export const NOTE_LIST_SENSOR_TYPES = {
  pointer: NonTouchNotePointerSensor,
  touch: TouchSensor,
  keyboard: KeyboardSensor,
} as const;

export const noteKeyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
  const filteredDroppableContainers = new Proxy(args.context.droppableContainers, {
    get(target, property) {
      if (property === "getEnabled") return () => target.getEnabled().filter((container) => container.data.current?.type !== "note-edge");
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const coordinates = sortableKeyboardCoordinates(event, {
    ...args,
    context: { ...args.context, droppableContainers: filteredDroppableContainers },
  });
  if (event.code !== KeyboardCode.Down || !args.context.collisionRect) return coordinates;

  const { collisionRect, droppableContainers, droppableRects } = args.context;
  const hasNoteBelow = droppableContainers.getEnabled().some((container) => {
    if (container.id === args.active || container.data.current?.type !== "note") return false;
    const rect = droppableRects.get(container.id);
    return Boolean(rect && rect.top > collisionRect.top);
  });
  if (hasNoteBelow) return coordinates;

  const emptyGroup = droppableContainers.getEnabled()
    .filter((container) => container.data.current?.type === "note-group")
    .map((container) => ({ container, rect: droppableRects.get(container.id) }))
    .filter((entry): entry is { container: typeof entry.container; rect: NonNullable<typeof entry.rect> } => Boolean(entry.rect && entry.rect.top > collisionRect.top))
    .sort((left, right) => left.rect.top - right.rect.top)[0];
  if (!emptyGroup) return coordinates;

  return {
    x: emptyGroup.rect.left + (emptyGroup.rect.width - collisionRect.width) / 2,
    y: emptyGroup.rect.top + (emptyGroup.rect.height - collisionRect.height) / 2,
  };
};

export const NOTE_LIST_SENSOR_OPTIONS = {
  pointer: { activationConstraint: { distance: 8 } },
  touch: { activationConstraint: { delay: 180, tolerance: 8 } },
  keyboard: {
    coordinateGetter: noteKeyboardCoordinates,
    keyboardCodes: {
      start: [KeyboardCode.Space],
      cancel: [KeyboardCode.Esc],
      end: [KeyboardCode.Space, KeyboardCode.Enter, KeyboardCode.Tab],
    },
  },
};

// Shelf cards keep their DOM nodes in place. Moving every grid item with transforms
// while hovering can still leave stale composited layers in Safari, so only the
// lightweight overlay moves; the actual order changes once, after drop.
export const NOTE_LIST_SORTING_STRATEGY: SortingStrategy = () => null;

export const noteListCollisionDetection: CollisionDetection = (args) => {
  if (!args.pointerCoordinates) {
    const collisions = closestCenter(args);
    const preferred = collisions.find((collision) => collision.data?.droppableContainer.data.current?.type !== "note-edge");
    return preferred ? [preferred] : collisions;
  }
  const directHit = pointerWithin(args);
  const activeClientId = String(args.active.data.current?.clientId ?? "");
  const validEdge = directHit.find((collision) => {
    const container = collision.data?.droppableContainer;
    if (container.data.current?.type !== "note-edge" || String(container.data.current.clientId ?? "") === activeClientId) return false;
    const edgeRect = container.rect.current;
    const card = container.node.current?.closest("[data-note-id]") as HTMLElement | null | undefined;
    const cardRect = card?.getBoundingClientRect();
    if (!edgeRect || !cardRect || edgeRect.width <= 0 || edgeRect.height <= 0) return false;
    return edgeRect.left >= cardRect.left - 1 && edgeRect.right <= cardRect.right + 1
      && edgeRect.top >= cardRect.top - 1 && edgeRect.bottom <= cardRect.bottom + 1;
  });
  if (validEdge) return [validEdge];
  for (const type of ["note-edge", "note", "note-group"]) {
    if (type === "note-edge") continue;
    const preferred = directHit.find((collision) => collision.data?.droppableContainer.data.current?.type === type);
    if (preferred) return [preferred];
  }
  return directHit.length ? [directHit[0]] : closestCenter(args).slice(0, 1);
};
