import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HistoryEvent } from "../src/domain/historyTypes";
import { HistoryPage } from "../src/pages/HistoryPage";

function event(
  overrides: Partial<HistoryEvent> & Pick<HistoryEvent, "id" | "gameId">,
): HistoryEvent {
  return {
    changedAt: "2026-01-02T12:00:00.000Z",
    entity: "game",
    entityId: overrides.gameId,
    field: "status",
    op: "set",
    before: "wishlist",
    after: "playing",
    title: "Hades",
    coverAssetId: null,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe("HistoryPage", () => {
  it("renders nested deltas for consecutive same game", () => {
    const events = [
      event({
        id: "e1",
        gameId: "g1",
        changedAt: "2026-01-03T00:00:00.000Z",
        before: "wishlist",
        after: "playing",
      }),
      event({
        id: "e2",
        gameId: "g1",
        changedAt: "2026-01-02T00:00:00.000Z",
        before: "playing",
        after: "completed",
      }),
    ];
    const view = render(
      <HistoryPage
        events={events}
        liveGameIds={new Set(["g1"])}
        onOpenGame={vi.fn()}
      />,
    );
    const nodes = view.container.querySelectorAll(".history-timeline__node");
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.querySelectorAll(".history-timeline__delta")).toHaveLength(2);
  });

  it("node link points to #/games/g1 when game exists", () => {
    render(
      <HistoryPage
        events={[event({ id: "e1", gameId: "g1", title: "Hades" })]}
        liveGameIds={new Set(["g1"])}
        onOpenGame={vi.fn()}
      />,
    );
    const link = screen.getByRole("link", { name: "Hades" });
    expect(link).toHaveAttribute("href", "#/games/g1");
    expect(link).toHaveClass("history-timeline__link");
  });

  it("missing game is not a link", () => {
    const view = render(
      <HistoryPage
        events={[event({ id: "e1", gameId: "gone", title: "Removed Game" })]}
        liveGameIds={new Set()}
        onOpenGame={vi.fn()}
      />,
    );
    expect(screen.queryByRole("link")).toBeNull();
    const node = view.container.querySelector(".history-timeline__node.is-missing");
    expect(node).not.toBeNull();
    expect(within(node as HTMLElement).getByText("Removed Game")).toBeInTheDocument();
    expect(within(node as HTMLElement).getByText("удалена")).toBeInTheDocument();
  });

  it("shows empty state", () => {
    render(<HistoryPage events={[]} liveGameIds={new Set()} />);
    expect(screen.getByText("Пока нет опубликованных изменений.")).toBeInTheDocument();
  });

  it("keeps timeline visible when load error is shown", () => {
    const events = [event({ id: "e1", gameId: "g1", title: "Hades" })];
    render(
      <HistoryPage
        error="Не удалось загрузить историю"
        events={events}
        liveGameIds={new Set(["g1"])}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Не удалось загрузить историю");
    expect(screen.getByText("Hades")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Повторить" })).toBeInTheDocument();
  });

  it("falls back to live cover when snapshot asset is gone", () => {
    const resolveAssetUrl = (id: string) => (id === "live-cover" ? `/media/${id}.webp` : null);
    const view = render(
      <HistoryPage
        events={[event({ id: "e1", gameId: "g1", title: "Hades", coverAssetId: "stale-cover" })]}
        liveCoverByGameId={new Map([["g1", "live-cover"]])}
        liveGameIds={new Set(["g1"])}
        resolveAssetUrl={resolveAssetUrl}
      />,
    );
    const img = view.container.querySelector(".history-timeline__cover img");
    expect(img).toHaveAttribute("src", "/media/live-cover.webp");
    expect(view.container.querySelector(".history-timeline__cover--placeholder")).toBeNull();
  });

  it("shows note create preview under label", () => {
    render(
      <HistoryPage
        events={[
          event({
            id: "n-create",
            gameId: "g1",
            entity: "note",
            entityId: "n1",
            field: null,
            op: "create",
            before: null,
            after: "Секретный маршрут",
            title: "Hades",
          }),
        ]}
        liveGameIds={new Set(["g1"])}
      />,
    );
    expect(screen.getByText("Заметка · добавлена")).toBeInTheDocument();
    expect(screen.getByText("Секретный маршрут")).toBeInTheDocument();
    expect(document.querySelector(".history-timeline__note-preview")).not.toBeNull();
  });

  it("renders note body edit as two-column block diff", () => {
    const view = render(
      <HistoryPage
        events={[
          event({
            id: "n-edit",
            gameId: "g1",
            entity: "note",
            entityId: "n1",
            field: "bodyMarkdown",
            op: "set",
            before: "старый текст",
            after: "новый текст",
            title: "Hades",
          }),
        ]}
        liveGameIds={new Set(["g1"])}
      />,
    );
    expect(screen.getByText("Заметка · обновлён текст")).toBeInTheDocument();
    const oldEl = view.container.querySelector(".history-timeline__note-diff-old");
    const newEl = view.container.querySelector(".history-timeline__note-diff-new");
    expect(oldEl).toHaveTextContent("старый текст");
    expect(newEl).toHaveTextContent("новый текст");
  });

  it("uses em dash placeholders when note edit sides are empty", () => {
    const view = render(
      <HistoryPage
        events={[
          event({
            id: "n-edit-empty",
            gameId: "g1",
            entity: "note",
            entityId: "n1",
            field: "bodyMarkdown",
            op: "set",
            before: null,
            after: null,
            title: "Hades",
          }),
        ]}
        liveGameIds={new Set(["g1"])}
      />,
    );
    const oldEl = view.container.querySelector(".history-timeline__note-diff-old");
    const newEl = view.container.querySelector(".history-timeline__note-diff-new");
    expect(oldEl).toHaveTextContent("—");
    expect(newEl).toHaveTextContent("—");
  });
});
