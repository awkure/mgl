# Моя игровая библиотека

Статичный сайт для личной базы игр: тирлист, каталог, теги, заметки и локальные
правки без сервера. Опубликованные метаданные хранятся в
`public/data/library.json`, изображения и файлы — в `public/media`, а
незакоммиченные изменения — только в `localStorage` текущего браузера.

Стартовая база пустая. Игры добавляются через интерфейс, а изменения попадают в
локальный патч. На странице игры поля и заметки редактируются на месте;
изображения в заметки вставляются из буфера обмена или перетаскиваются прямо в
Markdown-поле. Компактная кнопка `+` в редакторе добавляет изображения и
произвольные файлы; до публикации их содержимое остаётся частью локального
патча.

## Содержание

- [Разработка](#разработка)
- [Публикация данных](#публикация-данных)
- [GitHub Pages](#github-pages)
- [Safari и резервные копии](#safari-и-резервные-копии)
- [Features](#features)
  - [Steam](#steam)

## Разработка

Требуется Node.js 22.13 или новее. Удобные команды — через [just](https://github.com/casey/just):

```sh
just setup   # npm ci + .env из .env.example при отсутствии
just dev
just check   # validate + test + build
```

Личный снимок библиотеки лежит в `fixtures/library/` (JSON + media).
Опубликованная база в `public/` по умолчанию пустая:

```sh
just db-seed   # скопировать fixture → public/
just db-clean  # опустошить public/data/library.json и public/media
```

Без just:

```sh
npm ci
cp -n .env.example .env
npm run dev
```

Проверки:

```sh
just test    # или npm test
just build   # или npm run build
```

GitHub Sync читает владельца/репозиторий из `.env` (`VITE_GITHUB_*`).
Локальные переопределения — в `.env.local` (не коммитится).

## Публикация данных

Основной способ — кнопка **Синхронизировать** вверху окна «Локальные правки».
При первом запуске она предлагает создать и вставить fine-grained PAT:

- resource owner и репозиторий задаются в `.env`
  (`VITE_GITHUB_REPOSITORY_OWNER` / `VITE_GITHUB_REPOSITORY_NAME`);
- repository permission: только `Contents: write`;
- срок действия лучше ограничить.

Страница читает последний commit `main` через GitHub Git Database API,
перебазирует на него локальный патч, загружает только новые media, создаёт один
tree и commit, после чего обновляет `main` с `force: false`. Репозиторий, ветка и
пути зафиксированы в приложении: оно создаёт записи только для
`public/data/library.json` и вычисляемых SHA-256-путей `public/media/*`.
Изменения, сделанные уже после нажатия кнопки, остаются в новом локальном
патче. До завершения GitHub Pages новая база и media временно кешируются, чтобы
reload не возвращал старую revision.

GitHub не умеет ограничить fine-grained PAT отдельной папкой: клиентский
allowlist защищает от ошибок приложения, но не ограничивает украденный токен.
Для защиты истории дополнительно запретите force push для `main` через branch
ruleset. Даже без ruleset само приложение никогда не отправляет `force: true`.
Запомненный PAT хранится отдельно от патча в `localStorage`; без флажка
«Запомнить» — только в `sessionStorage`. Его можно удалить кнопкой
«Отключить», а при подозрении на утечку нужно отозвать в настройках GitHub.

Старый локальный способ остаётся резервным:

1. Откройте окно «Локальные правки» на сайте.
2. Проверьте diff и нажмите «Скопировать патч».
3. В терминале внутри локального клона выполните короткую постоянную команду
   `npm run publish:clipboard`.
4. Скрипт прочитает патч прямо из буфера macOS, не вставляя и не печатая его в
   терминале, проверит операции, применит их и создаст локальный commit. Короткий
   заголовок перечислит затронутые игры, а тело сгруппирует изменения игр,
   заметок, изображений и файлов без полных Markdown-текстов и base64. Новые
   бинарные данные будут записаны по вычисленным SHA-256-путям в `public/media`.
   Статичная база не принимает inline-base64: он существует только в локальном `patch.blobs`.
5. Самостоятельно выполните push нужной Git-ветки привычным способом.
6. Когда GitHub Pages обновится, перезагрузите сайт: уже опубликованные
   локальные операции исчезнут автоматически.

Патч остаётся набором операций: скрипт проверяет revision и hash исходного
значения каждой операции и применяет их к актуальному
`public/data/library.json`. Он никогда не заменяет базу скачанным готовым JSON,
не выполняет fetch, merge, установку зависимостей, build, preview или push и не
двигает Git-ветки. Публикация создаёт один локальный commit только по путям
`public/data/library.json` и затронутым `public/media/*`.

`publish:clipboard` рассчитан на macOS и использует системный
`/usr/bin/pbpaste`. Экспорт patch-файла остаётся резервной копией и способом
восстановления, но не заменяет обычную публикацию из буфера.

## GitHub Pages

Workflow находится в `.github/workflows/deploy.yml`. После добавления remote
выберите в настройках репозитория **Settings → Pages → Source → GitHub Actions**.
Каждый ручной push в `main` проверит проект, соберёт `dist` и опубликует его.

## Safari и резервные копии

Локальный патч не синхронизируется между устройствами и может быть удалён
браузером. Окно diff показывает консервативный Safari-бюджет в 4 MiB и позволяет
в любой момент скачать patch-файл. Обложки кадрируются до 512×512 и кодируются
в WebP. Изображения в заметках сохраняют исходные пиксельные размеры: готовый
WebP сохраняется как есть, остальные форматы кодируются в lossless WebP.

## Features

Планируемые и частично готовые возможности.

### Steam

Публичный Steam Web API требует ключ
([steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey)).
Прямые запросы из браузера блокируются CORS, ключ нельзя класть в SPA.
Профиль Steam должен открывать **Game details** для чтения библиотеки.
Ориентир архитектуры: CLI / скрипт (как publish), не live-sync из клиента.

Ключ: `STEAM_WEB_API_KEY` в `.env` / `.env.local` (только Node, без `VITE_`).
`STEAM_PROFILE_ID` — это **steamID64** со страницы
[store.steampowered.com/account](https://store.steampowered.com/account/)
(поле Steam ID, вида `7656119…`). Vanity `awkure` и URL
[steamcommunity.com/id/awkure](https://steamcommunity.com/id/awkure/) тоже ок.

```sh
npm run steam:probe -- https://steamcommunity.com/id/awkure
npm run test:steam   # live smoke; или just test-steam

# Patch file (import via UI «Импорт» / publish:clipboard):
just steam-import-via-patch --limit 5
# or: npm run import:steam -- --limit 5

# Write straight into public/data + public/media (reload dev server page):
just steam-import --limit 5
# or: npm run import:steam -- --apply --limit 5
```

Флаги `import:steam`: `--profile`, `--out`, `--apply`, `--dry-run`, `--played-only`,
`--limit`, `--appids`, `--no-covers`, `--skip-details`. `--apply` не делает git commit.

### Фундамент

- [x] Канал доступа: CLI с `STEAM_WEB_API_KEY` (не ключ в SPA / `localStorage`)
- [x] `ResolveVanityURL` + разбор profile URL / steamID64 (`src/domain/steamIdentity.ts`,
      `scripts/lib/steamApi.mjs`, `npm run steam:probe`)
- [x] Проверка видимости библиотеки через `GetOwnedGames` + понятная ошибка,
      если скрыта (`steam:probe`)
- [x] Поле `steamAppId: number | null` в схеме v2: `types` → `validation` →
      `validate-data.mjs` → UI на странице игры
- [x] Дедуп-хелперы: по `steamAppId`, иначе по нормализованному `title`
      (`findDuplicateGame`)

### Импорт библиотеки

- [x] `GetOwnedGames` (`include_appinfo`, `include_played_free_games`) →
      кандидаты в каталог
- [x] CLI `npm run import:steam` → V2 OperationPatch / `--dry-run` preview
      (без автопубликации)
- [x] Выбор через CLI-флаги (`--appids`, `--limit`, `--played-only`, …);
      SPA-чекбоксы отложены
- [x] Маппинг в `Game`: `title`, `platforms: ["Steam"]`, `tags` из жанров,
      `status` по playtime, `placement.tierId: "unranked"`, пустой review
- [x] Скачивание обложки с CDN / `header_image` → encode WebP 512 → SHA-256
      asset в `patch.blobs`
- [x] Обогащение через Storefront `appdetails` (жанры, type, header) с
      троттлингом ≥1.5s
- [x] Фильтры: `--played-only`, exclude demos/DLC/tools по type+имени,
      `--limit` / `--dry-run`

### Заполнение одной игры

- [ ] В редакторе: вставить Steam URL / appid → префилл title, tags, cover
- [ ] Ссылка на страницу в Steam как note attachment / поле в карточке
- [ ] Подтянуть screenshots / trailer URLs как опциональные вложения заметок

### Статус и playtime

- [ ] Эвристики статуса из `playtime_forever` / `playtime_2weeks`
      (0 → wishlist/unplayed, недавняя активность → playing)
- [ ] Не перезаписывать уже выставленный tier без подтверждения
- [ ] Показать playtime в UI (часы) — отдельное поле или только при импорте
- [ ] `GetRecentlyPlayedGames` → виджет «сейчас в ротации» / очередь
      быстрого добавления

### Достижения

- [ ] `GetPlayerAchievements` + `GetSchemaForGame` для игр уже в каталоге
- [ ] Подсказка статуса platinum / completed при 100% unlock
- [ ] Бейдж прогресса достижений на карточке (опционально)

### Синхронизация и эксплуатация (позже / низкий приоритет)

- [ ] Повторный sync: только новые appid, без дублей и без сброса локальных
      правок (title/tier/review)
- [ ] Снимок последнего успешного Steam-импорта (owned games + playtime /
      metadata): при каждом `steam-import` / `import:steam` diff со свежим
      `GetOwnedGames` и пропускать appid без изменений (метаданные, часы и т.п.),
      чтобы не гонять полный reimport всей библиотеки
- [ ] GitHub Action «Import Steam» с секретом ключа → PR с diff
      `library.json` + media
- [ ] Live sync из SPA — не делать, пока нет безопасного серверного прокси
- [ ] Обработка rate limit / 429, пагинация обогащения `appdetails`
- [ ] `GetFriendList` — вне скоупа личной библиотеки (не планировать без
      явного запроса)

### Документация и тесты

- [x] Раздел в README: ключ, privacy Steam, `steam:probe`, ограничения CORS
- [x] Фикстуры / unit-тесты маппинга и Steam API (импорт)
- [ ] Acceptance: импорт не ломает schema v2 и orphan-asset инварианты
