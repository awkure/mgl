export type ThemeId = "dark" | "light";

export const THEME_STORAGE_KEY = "my-game-library.theme.v1";

export const THEME_COLORS: Record<ThemeId, string> = {
  dark: "#111214",
  light: "#f2f3f5",
};

export function isThemeId(value: unknown): value is ThemeId {
  return value === "dark" || value === "light";
}

export function loadTheme(): ThemeId {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeId(raw)) return raw;
  } catch {
    // Safari private mode / storage blocked
  }
  return "dark";
}

export function saveTheme(theme: ThemeId): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Safari private mode / storage blocked
  }
}

export function applyTheme(theme: ThemeId): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme === "light" ? "light" : "dark";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLORS[theme]);
}

export function initTheme(): ThemeId {
  const theme = loadTheme();
  applyTheme(theme);
  return theme;
}
