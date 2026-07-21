import { useEffect, useState } from "react";
import { applyTheme, loadTheme, saveTheme, type ThemeId } from "../state/theme";
import { Icon } from "../components/Icon";

const THEME_OPTIONS: { id: ThemeId; label: string }[] = [
  { id: "dark", label: "Тёмная" },
  { id: "light", label: "Светлая" },
];

export function SettingsPage() {
  const [theme, setTheme] = useState<ThemeId>(() => loadTheme());

  useEffect(() => {
    applyTheme(theme);
    saveTheme(theme);
  }, [theme]);

  return (
    <div className="page settings-page">
      <header className="page-heading">
        <div>
          <h1>Настройки</h1>
          <p>Внешний вид и поведение библиотеки.</p>
        </div>
      </header>

      <section aria-labelledby="settings-theme-heading" className="settings-card">
        <div className="settings-card__header">
          <span className="settings-card__icon" aria-hidden="true">
            <Icon name="sparkles" size={18} />
          </span>
          <div>
            <h2 id="settings-theme-heading">Тема</h2>
            <p>Выберите оформление интерфейса.</p>
          </div>
        </div>
        <div aria-label="Тема оформления" className="theme-selector" role="radiogroup">
          {THEME_OPTIONS.map((option) => (
            <button
              aria-checked={theme === option.id}
              className={`theme-selector__option${theme === option.id ? " is-active" : ""}`}
              key={option.id}
              onClick={() => setTheme(option.id)}
              role="radio"
              type="button"
            >
              <span className={`theme-selector__swatch theme-selector__swatch--${option.id}`} aria-hidden="true" />
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
