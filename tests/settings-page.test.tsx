import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { SettingsPage } from "../src/pages/SettingsPage";
import { THEME_STORAGE_KEY } from "../src/state/theme";
import {
  DEFAULT_RANDOM_GAME_STATUSES,
  RANDOM_GAME_STATUSES_STORAGE_KEY,
  loadRandomGameStatuses,
} from "../src/state/randomGamePrefs";
import { GITHUB_PAT_STORAGE_KEY } from "../src/state/githubPat";

beforeEach(() => {
  localStorage.removeItem(THEME_STORAGE_KEY);
  localStorage.removeItem(RANDOM_GAME_STATUSES_STORAGE_KEY);
  localStorage.removeItem(GITHUB_PAT_STORAGE_KEY);
  sessionStorage.removeItem(GITHUB_PAT_STORAGE_KEY);
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  localStorage.removeItem(THEME_STORAGE_KEY);
  localStorage.removeItem(RANDOM_GAME_STATUSES_STORAGE_KEY);
  localStorage.removeItem(GITHUB_PAT_STORAGE_KEY);
  sessionStorage.removeItem(GITHUB_PAT_STORAGE_KEY);
  document.documentElement.removeAttribute("data-theme");
});

describe("SettingsPage", () => {
  it("renders theme selector and switches to light", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    expect(screen.getByRole("heading", { name: "Настройки" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Тёмная" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("radio", { name: "Жидкое стекло" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Светлая" }));
    expect(screen.getByRole("radio", { name: "Светлая" })).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("toggles random-game statuses and persists them", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    expect(loadRandomGameStatuses()).toEqual([...DEFAULT_RANDOM_GAME_STATUSES]);
    expect(screen.getByRole("button", { name: "Хочу поиграть" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Пройдено" })).toHaveAttribute("aria-pressed", "false");

    await user.click(screen.getByRole("button", { name: "Пройдено" }));
    expect(screen.getByRole("button", { name: "Пройдено" })).toHaveAttribute("aria-pressed", "true");
    expect(loadRandomGameStatuses()).toEqual(["wishlist", "playing", "played", "completed"]);

    await user.click(screen.getByRole("button", { name: "Хочу поиграть" }));
    expect(loadRandomGameStatuses()).toEqual(["playing", "played", "completed"]);
  });

  it("keeps at least one random-game status selected", async () => {
    const user = userEvent.setup();
    localStorage.setItem(RANDOM_GAME_STATUSES_STORAGE_KEY, JSON.stringify(["playing"]));
    render(<SettingsPage />);

    await user.click(screen.getByRole("button", { name: "Играю" }));
    expect(screen.getByRole("button", { name: "Играю" })).toHaveAttribute("aria-pressed", "true");
    expect(loadRandomGameStatuses()).toEqual(["playing"]);
  });

  it("shows graded tier meanings legend", () => {
    render(<SettingsPage />);
    expect(screen.getByRole("heading", { name: "Тирлист" })).toBeInTheDocument();
    expect(screen.getByText("Шедевр")).toBeInTheDocument();
    expect(screen.getByText("Отлично, но не дотягивает до шедевра")).toBeInTheDocument();
    expect(screen.getByText("Хорошая игра")).toBeInTheDocument();
    expect(screen.getByText("Норм, можно и скипнуть")).toBeInTheDocument();
    expect(screen.getByText("Плохо — жаль потраченного времени")).toBeInTheDocument();
    expect(screen.getByText("Очень плохо")).toBeInTheDocument();
    expect(screen.queryByText("Ещё не в тирлисте")).not.toBeInTheDocument();
  });

  it("saves and disconnects a GitHub PAT through settings", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onDisconnect = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <SettingsPage
        pat={{
          connected: false,
          onDisconnect,
          onSave,
          patCreationHref: "https://github.com/settings/personal-access-tokens/new",
          persistence: null,
          repository: "owner/repo · main",
        }}
      />,
    );

    expect(screen.getByRole("link", { name: "Создать fine-grained PAT" })).toHaveAttribute(
      "href",
      "https://github.com/settings/personal-access-tokens/new",
    );
    await user.type(screen.getByLabelText("Fine-grained PAT"), "github_pat_secret_token_value");
    await user.click(screen.getByRole("checkbox", { name: "Запомнить PAT на этом устройстве" }));
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(onSave).toHaveBeenCalledWith("github_pat_secret_token_value", true);

    rerender(
      <SettingsPage
        pat={{
          connected: true,
          onDisconnect,
          onSave,
          patCreationHref: "https://github.com/settings/personal-access-tokens/new",
          persistence: "persistent",
          repository: "owner/repo · main",
        }}
      />,
    );
    expect(screen.getByText("PAT сохранён на этом устройстве")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Отключить" }));
    expect(onDisconnect).toHaveBeenCalled();
  });
});
