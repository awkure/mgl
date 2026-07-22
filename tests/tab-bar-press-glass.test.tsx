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
    expect(shell.style.getPropertyValue("--press-tab").trim()).toBe("2");

    shell.setAttribute("data-pager-dragging", "true");
    await waitFor(() => {
      expect(shell).not.toHaveAttribute("data-tab-press");
      expect(settings).not.toHaveAttribute("data-pressed");
    });
  });
});
