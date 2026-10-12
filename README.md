# DONER GAME

Telegram Bot + Telegram Mini App. **Этап 2, v0.2 Telegram Prototype:** существующий frontend подготовлен к запуску как Telegram Main Mini App через HTTPS и к размещению на Vercel. На экране есть имя пользователя, отметка «Открыто в Telegram» и параметр запуска. Кнопки «СЮЖЕТ» и «ИГРАТЬ С ДРУЗЬЯМИ» показывают «Скоро».

Сейчас нет игрового движка, backend, базы данных, авторизации, сохранений, лобби и сетевой игры.

## Структура проекта

```text
tg-game/
├── apps/
│   ├── bot/
│   │   ├── src/
│   │   │   ├── index.ts       # запуск, polling, завершение по сигналам
│   │   │   ├── bot.ts         # /start, /help, /game
│   │   │   ├── config.ts      # чтение apps/bot/.env
│   │   │   ├── deep-link.ts   # getMiniAppDeepLink(startParam?)
│   │   │   └── errors.ts      # сообщения ошибок без секретов
│   │   ├── test/bot.test.ts
│   │   ├── .env.example
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/
│       ├── src/
│       │   ├── App.tsx        # стартовый экран и «Скоро»
│       │   ├── DonerMark.tsx  # небольшая SVG-иллюстрация
│       │   ├── telegram.ts   # Telegram WebApp API, display-only данные
│       │   ├── main.tsx
│       │   └── styles.css
│       ├── public/favicon.svg
│       ├── test/telegram.test.ts
│       ├── .env.example      # frontend пока не требует env variables
│       ├── index.html
│       ├── vite.config.ts
│       ├── package.json
│       └── tsconfig.json
├── packages/shared/          # только общий тип GameMode
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── tsconfig.base.json
├── .nvmrc
└── .gitignore
```

Корень проекта — текущая папка `tg-game`; дополнительная вложенная папка `doner-game` не нужна. Приложения независимы: позже можно добавить отдельный backend и игровой модуль внутри web. `shared` пока экспортирует только типы; импортируйте их через `import type`.

## Требования

- Node.js **24 LTS**, версия 24.11 или новее в ветке 24 (см. `.nvmrc`).
- pnpm **10.34.6** — версия закреплена в `packageManager`.

Если установлен Corepack, включите pnpm:

```bash
corepack enable pnpm
pnpm --version
```

Если Corepack отсутствует, установите pnpm:

```bash
npm install --global pnpm@10.34.6
```

## Установка и переменные окружения

Все команды ниже выполняйте из корня проекта.

```bash
pnpm install
cp -n apps/bot/.env.example apps/bot/.env
```

`cp -n` создаёт файл только при его отсутствии: уже заполненный `.env` сохраняется. Откройте `apps/bot/.env` и заполните:

- `BOT_TOKEN` — token, который выдал BotFather.
- `BOT_USERNAME` — username **этого же бота**, например `your_doner_game_bot`. Обычно указывайте без `@`; начальный `@` также допускается. Не вставляйте URL или отображаемое имя.

Шаблон намеренно содержит пустые значения:

```dotenv
BOT_TOKEN=
BOT_USERNAME=
```

`.env` игнорируется Git. Не добавляйте секреты в исходники, README, screenshots или переменные `VITE_*`: всё с префиксом `VITE_` может попасть в браузерную сборку. Frontend не требует `.env` или token.

В `apps/web/.env.example` это указано явно: копировать его необязательно. `VITE_BOT_USERNAME` сейчас не нужен — ссылки строит бот. Новые публичные frontend-параметры в будущем должны иметь префикс `VITE_` и читаться через `import.meta.env`; значения подставляются при сборке. Не добавляйте загрузку `apps/bot/.env` в Vite config. Встроенный `import.meta.env.DEV` включает debug-блок только при разработке; в production его код исключается из JavaScript.

Бот читает `.env` относительно своего модуля, поэтому путь корректен и при запуске собранного `dist/index.js`. Уже заданные переменные окружения имеют приоритет над файлом.

## A. Local development — frontend

```bash
pnpm install
pnpm dev:web
```

Откройте адрес из вывода Vite, обычно `http://127.0.0.1:5173`. В обычном браузере появится **Development Mode**, даже если официальный SDK доступен: наличие SDK само по себе не означает запуск из Telegram. При отсутствии SDK приложение также работает. В Telegram показываются «Открыто в Telegram», имя и доступный `@username`.

В dev-сборке ниже кнопок виден небольшой блок `Telegram: yes/no`, `User: yes/no`, `start_param: ...`. Он не содержит `initData`, идентификаторов или секретов. Для локальной проверки параметра можно открыть `http://127.0.0.1:5173/?tgWebAppStartParam=party`: debug покажет `party`, а режим останется Development Mode.

Интерфейс адаптирован под мобильную ширину 320–500 px, учитывает safe-area телефона и Telegram, поддерживает клавиатуру и уменьшение анимаций. При недостаточной высоте экран прокручивается.

## Запуск bot

После заполнения `apps/bot/.env`:

```bash
pnpm dev:bot
```

При успешном подключении появится:

```text
DONER GAME BOT started
```

Команды:

- `/start` — приветствие и кнопка «🎮 Открыть DONER GAME».
- `/help` — список команд.
- `/game` — кнопка «🎮 Открыть игру» в личном чате, группе или супергруппе.

Бот автоматически регистрирует эти команды в Telegram. В группе с несколькими ботами используйте `/game@your_doner_game_bot`, чтобы адресовать команду нужному боту. Бот должен быть добавлен в группу и иметь возможность отвечать сообщениями. Для команд отключать privacy mode не требуется.

Используется long polling: отдельный HTTP-сервер и webhook на этом этапе не нужны. Запускайте только один polling-процесс для одного token. `Ctrl+C`, `SIGINT` и `SIGTERM` останавливают получение обновлений и дают текущим обработчикам завершиться.

Без token бот завершится с понятным сообщением. Это не мешает запускать frontend отдельно.

## Запуск всего проекта

```bash
pnpm dev
```

Команда средствами pnpm параллельно запускает web и bot. Сначала заполните `.env`. Остановка — `Ctrl+C`.

## B. Production build и проверки

```bash
pnpm typecheck
pnpm test
pnpm build
```

- `typecheck` проверяет bot, web и shared.
- `test` запускает тесты бота и frontend: команды, кнопки в личных и групповых чатах, deep links, launch params, отображение пользователя и lifecycle Telegram theme. Telegram API подменяется локально, реальный token не нужен.
- `build` собирает все workspace-пакеты в правильном порядке.

Для сборки **только frontend**, в том числе на Vercel:

```bash
pnpm build:web
```

Это точный эквивалент `pnpm --filter @doner-game/web build`. Результат — `apps/web/dist`. Команда не запускает и не собирает бота, не читает его `.env`; общий пакет содержит только типы и не требует предварительной сборки.

Результат:

- `apps/web/dist` — статический frontend для размещения по HTTPS.
- `apps/bot/dist` — скомпилированный бот для Node.js.
- `packages/shared/dist` — декларации общих типов.

Локально посмотреть frontend после сборки:

```bash
pnpm --filter @doner-game/web preview
```

Запустить собранного бота:

```bash
pnpm --filter @doner-game/bot start
```

Vite preview предназначен для проверки сборки, а не для production-хостинга. При развёртывании бота нужны установленные production-зависимости и переменные окружения.

## C. Deployment на Vercel через Dashboard

Размещается обычный статический Vite frontend. Vercel Functions, SSR и отдельный `vercel.json` на этом этапе не нужны: приложение открывается по `/`, а Telegram передаёт параметры через query/hash. URL-маршрутов `/solo` и `/party` пока нет.

1. Разместите проект в Git-репозитории поддерживаемого провайдера, например GitHub. В корне репозитория должны находиться `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `apps/` и `packages/`. `.env`, `node_modules` и `dist` не добавляйте в Git.
2. В Vercel Dashboard выберите **Add New → Project**, импортируйте этот репозиторий.
3. Укажите настройки ниже. Если Vercel автоматически выбрал `apps/web` как Root Directory, измените его на корень monorepo и включите Override у команд/выходной папки.

| Настройка | Значение |
| --- | --- |
| Framework Preset | `Vite` |
| Root Directory | корень репозитория (`.` / пустое поле) |
| Node.js Version | `24.x` |
| Install Command | `pnpm install --frozen-lockfile` |
| Build Command | `pnpm build:web` |
| Output Directory | `apps/web/dist` |

`apps/web/dist` — это папка `dist` frontend, указанная относительно выбранного **корня monorepo**. Здесь нельзя вводить просто `dist`: такой папки в корне сборки нет. Этот вариант также сохраняет доступ к `packages/shared` и общему TypeScript config без дополнительных настроек доступа за пределы Root Directory.

4. В **Environment Variables** добавьте `ENABLE_EXPERIMENTAL_COREPACK=1` для **Production** и **Preview**. Это служебная настройка Vercel для выбора закреплённого `pnpm@10.34.6` из `packageManager`, не frontend-параметр и не секрет. **Других env variables не требуется**: не добавляйте `BOT_TOKEN`, `BOT_USERNAME` или `VITE_BOT_USERNAME` в этот Vercel project.
5. Нажмите **Deploy** и дождитесь успешной сборки. Если настройки изменены после первой попытки, выполните Redeploy.
6. Скопируйте постоянный **Production URL** проекта, например `https://doner-game-xxxxx.vercel.app`. Это пример, а не уже созданный адрес. Откройте его в обычном браузере: должны быть Development Mode, рабочие заглушки кнопок и `v0.2 Telegram Prototype`, без debug-блока.
7. Проверьте URL в приватном окне без входа в Vercel. Для Telegram нужен публично доступный frontend; адрес с требованием Vercel Authentication не подойдёт. Используйте production-домен с доступом без авторизации.

Бот продолжает работать отдельным Node.js-процессом, например через `pnpm dev:bot` на компьютере для тестирования. Публикация web на Vercel не запускает grammY polling. Для ответа на `/start` и `/game` процесс бота должен быть запущен.

Настройки сверены с документацией: [Vite на Vercel](https://vercel.com/docs/frameworks/frontend/vite), [настройка сборки и Corepack](https://vercel.com/docs/builds/configure-a-build), [pnpm workspaces](https://vercel.com/docs/monorepos), [Node.js 24](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

## Этап 2 — подключение Main Mini App

1. Разместите `apps/web` на Vercel по инструкции выше и получите публичный HTTPS Production URL.
2. Откройте официальный **@BotFather**, выберите своего существующего DONER GAME Bot в списке ботов.
3. В меню его настроек найдите **Main Mini App / Configure Mini App**. Включите Main Mini App, если он ещё не включён, и задайте **Web App URL** равным вашему URL, например `https://doner-game-xxxxx.vercel.app/`. Названия пунктов могут зависеть от текущего интерфейса BotFather. Одного Menu Button недостаточно.
4. В BotFather вставляется **HTTPS URL frontend**, не `t.me` ссылка и не localhost. В URL frontend не нужно вручную добавлять user data, `startapp` или секреты.
5. Откройте в Telegram `https://t.me/<BOT_USERNAME>?startapp=home`. Должен появиться экран DONER GAME с «Открыто в Telegram», `Привет, <first_name>`, доступным `@username`, `Launch: home` и `v0.2 Telegram Prototype`.
6. Дополнительно откройте ссылки с `?startapp=solo`, `?startapp=party`, `?startapp=lobby_test123`: изменится только строка `Launch`, экран и кнопки останутся заглушками.
7. Убедитесь, что процесс бота запущен, отправьте `/start`, `/help` и `/game` в личном чате. Кнопки `/start` и `/game` должны открыть тот же Main Mini App.
8. Добавьте бота в Telegram-группу, разрешите ему отвечать сообщениями и отправьте `/game@<BOT_USERNAME>` (подставьте username без угловых скобок). Ответ должен содержать обычную URL-кнопку `https://t.me/<BOT_USERNAME>?startapp=home`. Нажмите её и проверьте тот же экран и своего пользователя. Можно также проверить `/game`; адресная форма однозначно выбирает бота при нескольких ботах в группе.

Настройка Vercel account и BotFather выполняется вручную. После смены домена обновите Web App URL в BotFather; код deep-link builder менять не нужно. [Telegram: Main Mini App и startapp](https://core.telegram.org/bots/webapps#launching-the-main-mini-app).

## Настройка Telegram через BotFather

1. Откройте официальный [@BotFather](https://t.me/BotFather).
2. Создайте бота через `/newbot`, задайте имя и уникальный username. Сохраните выданный token только в `apps/bot/.env`, в поле `BOT_TOKEN`.
3. Запишите выбранный username в `BOT_USERNAME` в том же файле.
4. Разместите содержимое `apps/web/dist` на хостинге с публичным **HTTPS URL**.
5. В BotFather выберите своего бота через `/mybots`, откройте настройки **Main Mini App** и задайте HTTPS URL frontend. В интерфейсе это может называться **Bot Settings → Configure Mini App → Enable Mini App**. Нужен именно Main Mini App; одна настройка Menu Button его не заменяет.
6. Запустите бота, отправьте `/start` в личном чате и нажмите кнопку. После настройки Main Mini App ссылка ниже должна открывать приложение:

```text
https://t.me/<BOT_USERNAME>?startapp=home
```

`localhost` и `127.0.0.1` вашего компьютера напрямую недоступны Telegram на телефоне. Для запуска через бота потребуется публичный HTTPS URL — размещённый frontend или HTTPS-туннель к локальному Vite для разработки. Размещение и настройка BotFather выполняются вручную; сборка проекта их не делает.

Обе кнопки бота используют обычный `InlineKeyboardButton.url`, поэтому `/game` подходит и для групп. `web_app` inline-кнопки в группах не используются.

`apps/bot/src/deep-link.ts` содержит:

```ts
getMiniAppDeepLink();               // ?startapp=home
getMiniAppDeepLink('solo');         // ?startapp=solo
getMiniAppDeepLink('party');        // ?startapp=party
getMiniAppDeepLink('lobby_test123'); // ?startapp=lobby_test123
```

На этапе 2 любой параметр ведёт на стартовый экран. Frontend-функция `getTelegramStartParam()` читает первое допустимое значение в порядке: `WebApp.initDataUnsafe.start_param`, `start_param` из сырого `initData`, `tgWebAppStartParam` из query, затем из hash. Если значений нет или они некорректны, возвращает `home`. Допускаются 1–512 символов `A–Z`, `a–z`, `0–9`, `_`, `-`, как в builder бота. Это чтение для отображения, не проверка подписи. Навигации в режимы и лобби нет.

Источники: [создание бота](https://core.telegram.org/bots/tutorial#obtain-your-bot-token), [Main Mini App и ссылки startapp](https://core.telegram.org/bots/webapps#launching-the-main-mini-app), [инициализация WebApp](https://core.telegram.org/bots/webapps#initializing-mini-apps).

## Telegram data и границы этапа

Если API доступен, `Telegram.WebApp.ready()` вызывается после отрисовки интерфейса, затем `expand()`, в том числе при доступном SDK в обычном браузере. SDK подключён из официального источника в `index.html`.

Тема использует `themeParams.accent_text_color` или `button_color` для небольшой отметки Telegram. Основной фон и игровые кнопки сохраняют фирменные цвета при light/dark теме; цвет шапки и фона Telegram задаётся с проверкой версии API. Изменения темы обрабатываются через `themeChanged`, обработчик снимается при размонтировании. Учитываются системные `env(safe-area-inset-*)`, Telegram safe area и content safe area.

`initDataUnsafe.user` используется **только для отображения** имени. Эти данные не являются доверенными и не подтверждают личность пользователя. На следующем этапе backend должен получать сырую строку `Telegram.WebApp.initData` и [проверять подпись Telegram](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app). Сейчас никакой авторизации нет.

Отметка «Открыто в Telegram» определяется по наличию `initData` и служит только отображению окружения. Её можно имитировать в браузере — она не является доказательством личности. Полная строка `initData` не выводится ни в UI, ни в debug-блок.

Будущий SOLO будет хранить прогресс и открытых персонажей. Будущий PARTY должен разрешать только уже открытых персонажей и показывать остальных как визуальных ghost без коллизий, общей физики и влияния на объекты. Эти правила здесь только зафиксированы; системы игры, хранения и синхронизации не реализованы.

## Ручная проверка после настройки

1. Откройте localhost: видны `DONER GAME`, `Development Mode`, `v0.2 Telegram Prototype` и dev-only debug-блок. Проверьте ширины 320, 375, 390, 430 и 500 px: горизонтальной прокрутки нет.
2. Нажмите обе кнопки: появляется «Скоро», настоящие режимы не запускаются.
3. В Telegram проверьте `/start`, `/help`, `/game` в личном чате.
4. Добавьте бота в группу, отправьте `/game@<BOT_USERNAME>` и проверьте URL-кнопку.
5. Откройте Mini App: отображаются отметка Telegram, имя, доступный username и `Launch: home`. Интерфейс не перекрыт вырезом экрана или элементами Telegram; при смене light/dark темы текст остаётся читаемым. В production debug-блок отсутствует.
6. Остановите процесс бота через `Ctrl+C`: приложение завершится без вывода token.
