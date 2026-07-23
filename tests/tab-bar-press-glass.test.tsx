import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../src/components/AppShell";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn().mockImplementation((query: string) => ({
    matches: String(query).includes("max-width") || String(query).includes("pointer: coarse"),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
});

describe("tab bar — four tabs", () => {
  it("lists История before Настройки in the mobile tab bar DOM", () => {
    render(
      <AppShell onOpenDiff={vi.fn()} route="tiers" storage={{ bytes: 0, operationCount: 0 }}>
        <div>body</div>
      </AppShell>,
    );
    const tabBar = screen.getByRole("navigation", { name: "Мобильная навигация" });
    const labels = within(tabBar).getAllByRole("link").map((link) => link.textContent?.trim());
    expect(labels).toEqual(["Тирлист", "Каталог", "История", "Настройки"]);
    const historyIndex = labels.indexOf("История");
    const settingsIndex = labels.indexOf("Настройки");
    expect(historyIndex).toBeGreaterThanOrEqual(0);
    expect(settingsIndex).toBeGreaterThan(historyIndex);
  });

  it("maps history press to --press-tab 2 and settings to 3", () => {
    const { container } = render(
      <AppShell onOpenDiff={vi.fn()} route="tiers" storage={{ bytes: 0, operationCount: 0 }}>
        <div>body</div>
      </AppShell>,
    );
    const shell = container.querySelector(".app-shell") as HTMLElement;
    const tabBar = screen.getByRole("navigation", { name: "Мобильная навигация" });
    const history = within(tabBar).getByRole("link", { name: "История" });
    fireEvent.pointerDown(history, { pointerId: 1, button: 0 });
    expect(shell.style.getPropertyValue("--press-tab").trim()).toBe("2");
    fireEvent.pointerUp(history, { pointerId: 1, button: 0 });
  });
});

describe("tab bar press glass — callout", () => {
  it("prevents context menu on tab links and add button", () => {
    const { container } = render(
      <AppShell onOpenDiff={vi.fn()} route="tiers" storage={{ bytes: 0, operationCount: 0 }}>
        <div>body</div>
      </AppShell>,
    );
    const tabBar = screen.getByRole("navigation", { name: "Мобильная навигация" });
    const catalog = within(tabBar).getByRole("link", { name: "Каталог" });
    const add = screen.getByRole("link", { name: "Добавить игру" });

    expect(catalog).toHaveAttribute("draggable", "false");
    expect(add).toHaveAttribute("draggable", "false");

    const catalogMenu = fireEvent.contextMenu(catalog);
    const addMenu = fireEvent.contextMenu(add);
    expect(catalogMenu).toBe(false);
    expect(addMenu).toBe(false);
    expect(container.querySelector(".app-shell")).toBeTruthy();
  });
});

describe("tab bar press glass — press state", () => {
  it("sets data-tab-press and --press-tab while a tab is pressed, then clears on pointerup", () => {
    const { container } = render(
      <AppShell onOpenDiff={vi.fn()} route="tiers" storage={{ bytes: 0, operationCount: 0 }}>
        <div>body</div>
      </AppShell>,
    );
    const shell = container.querySelector(".app-shell") as HTMLElement;
    const tabBar = screen.getByRole("navigation", { name: "Мобильная навигация" });
    const catalog = within(tabBar).getByRole("link", { name: "Каталог" });

    fireEvent.pointerDown(catalog, { pointerId: 1, button: 0 });
    expect(shell).toHaveAttribute("data-tab-press", "true");
    expect(shell.style.getPropertyValue("--press-tab").trim()).toBe("1");
    expect(catalog).toHaveAttribute("data-pressed", "true");

    fireEvent.pointerUp(catalog, { pointerId: 1, button: 0 });
    expect(shell).not.toHaveAttribute("data-tab-press");
    expect(catalog).not.toHaveAttribute("data-pressed");
  });

  it("captures pointer on tab pointerdown for reliable pointerup", () => {
    render(
      <AppShell onOpenDiff={vi.fn()} route="tiers" storage={{ bytes: 0, operationCount: 0 }}>
        <div>body</div>
      </AppShell>,
    );
    const tabBar = screen.getByRole("navigation", { name: "Мобильная навигация" });
    const catalog = within(tabBar).getByRole("link", { name: "Каталог" });
    const setPointerCapture = vi.fn();
    catalog.setPointerCapture = setPointerCapture;

    fireEvent.pointerDown(catalog, { pointerId: 1, button: 0 });
    expect(setPointerCapture).toHaveBeenCalledWith(1);
  });

  it("ignores press lens while pager is dragging", () => {
    const { container } = render(
      <AppShell onOpenDiff={vi.fn()} route="tiers" storage={{ bytes: 0, operationCount: 0 }}>
        <div>body</div>
      </AppShell>,
    );
    const shell = container.querySelector(".app-shell") as HTMLElement;
    const tabBar = screen.getByRole("navigation", { name: "Мобильная навигация" });
    const catalog = within(tabBar).getByRole("link", { name: "Каталог" });

    shell.setAttribute("data-pager-dragging", "true");
    fireEvent.pointerDown(catalog, { pointerId: 1, button: 0 });
    expect(shell).not.toHaveAttribute("data-tab-press");
    expect(catalog).not.toHaveAttribute("data-pressed");
  });

  it("clears press when pager-dragging becomes true mid-press", async () => {
    const { container } = render(
      <AppShell onOpenDiff={vi.fn()} route="tiers" storage={{ bytes: 0, operationCount: 0 }}>
        <div>body</div>
      </AppShell>,
    );
    const shell = container.querySelector(".app-shell") as HTMLElement;
    const tabBar = screen.getByRole("navigation", { name: "Мобильная навигация" });
    const settings = within(tabBar).getByRole("link", { name: "Настройки" });

    fireEvent.pointerDown(settings, { pointerId: 1, button: 0 });
    expect(shell).toHaveAttribute("data-tab-press", "true");
    expect(shell.style.getPropertyValue("--press-tab").trim()).toBe("3");

    shell.setAttribute("data-pager-dragging", "true");
    await waitFor(() => {
      expect(shell).not.toHaveAttribute("data-tab-press");
      expect(settings).not.toHaveAttribute("data-pressed");
    });
  });

  it("updates --press-tab continuously while dragging across the tab bar", () => {
    const { container } = render(
      <AppShell onOpenDiff={vi.fn()} route="tiers" storage={{ bytes: 0, operationCount: 0 }}>
        <div>body</div>
      </AppShell>,
    );
    const shell = container.querySelector(".app-shell") as HTMLElement;
    const tabBar = screen.getByRole("navigation", { name: "Мобильная навигация" }) as HTMLElement;
    const tiers = within(tabBar).getByRole("link", { name: "Тирлист" });

    Object.defineProperty(tabBar, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 0,
        y: 700,
        left: 0,
        top: 700,
        right: 400,
        bottom: 756,
        width: 400,
        height: 56,
        toJSON() {
          return {};
        },
      }),
    });

    fireEvent.pointerDown(tiers, { pointerId: 1, button: 0, clientX: 50, clientY: 728 });
    expect(shell).toHaveAttribute("data-tab-press", "true");
    expect(Number(shell.style.getPropertyValue("--press-tab"))).toBeCloseTo(0, 5);

    // Midway across the bar → continuous progress (~1.5 between catalog and history).
    fireEvent.pointerMove(tiers, { pointerId: 1, buttons: 1, clientX: 200, clientY: 728 });
    expect(Number(shell.style.getPropertyValue("--press-tab"))).toBeCloseTo(1.5, 5);

    const history = within(tabBar).getByRole("link", { name: "История" });
    expect(history).toHaveAttribute("data-pressed", "true");
    expect(tiers).not.toHaveAttribute("data-pressed");

    fireEvent.pointerUp(tiers, { pointerId: 1, button: 0, clientX: 200, clientY: 728 });
    expect(shell).not.toHaveAttribute("data-tab-press");
  });
});
