import { useEffect, useState, type FormEvent } from "react";
import { STATUS_IDS, TIER_IDS, type StatusId } from "../domain/types";
import { applyTheme, loadTheme, saveTheme, type ThemeId } from "../state/theme";
import {
  loadRandomGameStatuses,
  saveRandomGameStatuses,
} from "../state/randomGamePrefs";
import type { GitHubPatPersistence } from "../state/githubPat";
import { Icon } from "../components/Icon";
import { STATUS_LABELS, TIER_LABELS, TIER_MEANINGS } from "../components/libraryUi";

const THEME_OPTIONS: { id: ThemeId; label: string }[] = [
  { id: "dark", label: "Тёмная" },
  { id: "light", label: "Светлая" },
];

export interface SettingsPatProps {
  connected: boolean;
  persistence: GitHubPatPersistence | null;
  patCreationHref: string;
  repository: string;
  busy?: boolean;
  onSave: (token: string, remember: boolean) => void | Promise<void>;
  onDisconnect: () => void | Promise<void>;
}

export interface SettingsPageProps {
  pat?: SettingsPatProps;
}

export function SettingsPage({ pat }: SettingsPageProps) {
  const [theme, setTheme] = useState<ThemeId>(() => loadTheme());
  const [statuses, setStatuses] = useState<StatusId[]>(() => loadRandomGameStatuses());
  const [patDraft, setPatDraft] = useState("");
  const [rememberPat, setRememberPat] = useState(false);
  const [patBusy, setPatBusy] = useState(false);
  const [patError, setPatError] = useState<string | null>(null);

  useEffect(() => {
    applyTheme(theme);
    saveTheme(theme);
  }, [theme]);

  const toggleStatus = (status: StatusId) => {
    const selected = new Set(statuses);
    if (selected.has(status)) {
      if (selected.size <= 1) return;
      selected.delete(status);
    } else {
      selected.add(status);
    }
    const next = STATUS_IDS.filter((id) => selected.has(id));
    setStatuses(next);
    saveRandomGameStatuses(next);
  };

  const submitPat = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pat) return;
    const token = patDraft.trim();
    if (!token) {
      setPatError("Введите fine-grained PAT");
      return;
    }
    setPatError(null);
    setPatBusy(true);
    void Promise.resolve(pat.onSave(token, rememberPat))
      .then(() => {
        setPatDraft("");
        setRememberPat(false);
      })
      .catch((reason) => {
        setPatError(reason instanceof Error ? reason.message : "Не удалось сохранить PAT");
      })
      .finally(() => setPatBusy(false));
  };

  const disconnectPat = () => {
    if (!pat) return;
    setPatError(null);
    setPatBusy(true);
    void Promise.resolve(pat.onDisconnect())
      .catch((reason) => {
        setPatError(reason instanceof Error ? reason.message : "Не удалось отключить PAT");
      })
      .finally(() => setPatBusy(false));
  };

  const githubBusy = Boolean(pat?.busy) || patBusy;

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

      <section aria-labelledby="settings-tiers-heading" className="settings-card">
        <div className="settings-card__header">
          <span className="settings-card__icon" aria-hidden="true">
            <Icon name="info" size={18} />
          </span>
          <div>
            <h2 id="settings-tiers-heading">Тирлист</h2>
            <p>Что означают буквы на доске.</p>
          </div>
        </div>
        <ul className="settings-tier-legend" aria-label="Значения тиров">
          {TIER_IDS.filter((id): id is Exclude<typeof id, "unranked"> => id !== "unranked").map((tierId) => (
            <li className="settings-tier-legend__row" key={tierId}>
              <b className={`tier-badge tier-badge--${tierId}`}>{TIER_LABELS[tierId]}</b>
              <span>{TIER_MEANINGS[tierId]}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="settings-random-heading" className="settings-card">
        <div className="settings-card__header">
          <span className="settings-card__icon" aria-hidden="true">
            <Icon name="gamepad" size={18} />
          </span>
          <div>
            <h2 id="settings-random-heading">Случайная игра</h2>
            <p>Статусы, из которых выбирается случайная игра.</p>
          </div>
        </div>
        <div aria-label="Статусы для случайной игры" className="status-selector" role="group">
          {STATUS_IDS.map((status) => {
            const active = statuses.includes(status);
            return (
              <button
                aria-pressed={active}
                className={`status-selector__option${active ? " is-active" : ""}`}
                key={status}
                onClick={() => toggleStatus(status)}
                type="button"
              >
                <span className={`status-label status-label--${status}`}>{STATUS_LABELS[status]}</span>
              </button>
            );
          })}
        </div>
      </section>

      {pat ? (
        <section aria-labelledby="settings-github-heading" className="settings-card">
          <div className="settings-card__header">
            <span className="settings-card__icon" aria-hidden="true">
              <Icon name="link" size={18} />
            </span>
            <div>
              <h2 id="settings-github-heading">GitHub</h2>
              <p>Fine-grained PAT для синхронизации локальных правок.</p>
            </div>
          </div>

          {pat.repository ? <p className="settings-github__repo">{pat.repository}</p> : null}

          {patError ? (
            <div className="inline-alert inline-alert--error" role="alert">
              <Icon name="warning" size={15} />
              <span>{patError}</span>
              <button className="button button--ghost" onClick={() => setPatError(null)} type="button">Скрыть</button>
            </div>
          ) : null}

          {pat.connected ? (
            <div className="settings-github__saved">
              <div>
                <Icon name="check" size={15} />
                <span>
                  {pat.persistence === "persistent"
                    ? "PAT сохранён на этом устройстве"
                    : "PAT хранится до закрытия вкладки"}
                </span>
              </div>
              <button
                className="button button--ghost button--danger-text"
                disabled={githubBusy}
                onClick={disconnectPat}
                type="button"
              >
                Отключить
              </button>
            </div>
          ) : (
            <form className="settings-github__form" onSubmit={submitPat}>
              <label htmlFor="settings-github-pat">Fine-grained PAT</label>
              <div className="settings-github__input">
                <input
                  autoComplete="off"
                  disabled={githubBusy}
                  id="settings-github-pat"
                  name="github-fine-grained-pat"
                  onChange={(event) => setPatDraft(event.currentTarget.value)}
                  placeholder="github_pat_…"
                  spellCheck={false}
                  type="password"
                  value={patDraft}
                />
                <button
                  className="button button--primary"
                  disabled={githubBusy || !patDraft.trim()}
                  type="submit"
                >
                  {githubBusy ? "Подключаем…" : "Сохранить"}
                </button>
              </div>
              <label className="settings-github__remember">
                <input
                  checked={rememberPat}
                  disabled={githubBusy}
                  onChange={(event) => setRememberPat(event.currentTarget.checked)}
                  type="checkbox"
                />
                <span>Запомнить PAT на этом устройстве</span>
              </label>
              <p className="settings-github__hint">
                Для проверки доступа создадим отдельную временную ветку со служебным коммитом и сразу удалим её. Ветка main не изменится.
              </p>
              {pat.patCreationHref ? (
                <a className="settings-github__create" href={pat.patCreationHref} rel="noreferrer" target="_blank">
                  Создать fine-grained PAT
                  <Icon name="external" size={11} />
                </a>
              ) : null}
            </form>
          )}
        </section>
      ) : null}
    </div>
  );
}
