import { afterEach, describe, expect, it } from "vitest";
import {
  THEME_COLORS,
  THEME_STORAGE_KEY,
  applyTheme,
  isThemeId,
  loadTheme,
  saveTheme,
} from "../src/state/theme";

afterEach(() => {
  localStorage.removeItem(THEME_STORAGE_KEY);
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.colorScheme = "";
});

describe("theme", () => {
  it("accepts dark, light, and glass ids", () => {
    expect(isThemeId("dark")).toBe(true);
    expect(isThemeId("light")).toBe(true);
    expect(isThemeId("glass")).toBe(true);
    expect(isThemeId("liquid")).toBe(false);
    expect(isThemeId(null)).toBe(false);
  });

  it("defaults to dark when storage empty", () => {
    expect(loadTheme()).toBe("dark");
  });

  it("persists and reloads theme", () => {
    saveTheme("glass");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("glass");
    expect(loadTheme()).toBe("glass");
  });

  it("applies data-theme, color-scheme, and theme-color meta", () => {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    meta.setAttribute("content", THEME_COLORS.dark);
    document.head.appendChild(meta);

    applyTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(meta.getAttribute("content")).toBe(THEME_COLORS.light);

    applyTheme("glass");
    expect(document.documentElement.dataset.theme).toBe("glass");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(meta.getAttribute("content")).toBe(THEME_COLORS.glass);

    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(meta.getAttribute("content")).toBe(THEME_COLORS.dark);
  });
});
