import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
