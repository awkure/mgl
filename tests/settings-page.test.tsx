import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { SettingsPage } from "../src/pages/SettingsPage";
import { THEME_STORAGE_KEY } from "../src/state/theme";

beforeEach(() => {
  localStorage.removeItem(THEME_STORAGE_KEY);
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  localStorage.removeItem(THEME_STORAGE_KEY);
  document.documentElement.removeAttribute("data-theme");
});

describe("SettingsPage", () => {
  it("renders theme selector and switches to light", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    expect(screen.getByRole("heading", { name: "Настройки" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Тёмная" })).toHaveAttribute("aria-checked", "true");

    await user.click(screen.getByRole("radio", { name: "Светлая" }));
    expect(screen.getByRole("radio", { name: "Светлая" })).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });
});
