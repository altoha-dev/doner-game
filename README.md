# DONER GAME

Telegram Bot + Telegram Mini App + API. **Этап 5, v0.5 Playable Prototype:** первый игровой уровень на Phaser с движением, прыжком, платформами и тремя мирами. Сервер проверяет Telegram initData, сохраняет игрока и прогресс в PostgreSQL, выдаёт JWT на один час. Frontend получает профиль через `/me` и показывает «Аккаунт подключён ✓», Doners и Golden Doners.

«СЮЖЕТ» открывает Campaign → Character Select → игру. Altoha выдаётся бесплатно; Aigerim и Temik открываются независимо за 1 Doner. Выбранный открытый персонаж определяет оформление уровня 1. Party и уровни 2/3 пока «Скоро». Награды, сохранение прохождения, способности, Lobby и multiplayer не реализованы.

Все новые экраны DONER GAME должны следовать **Hi-Bit Lo-Fi Pixel Art**: [единая art direction](docs/ART_DIRECTION.md), tokens — `apps/web/src/tokens.css`.

## Структура

```text
apps/
  bot/                         # существующий grammY bot, /start /help /game
  api/
    src/
      index.ts                 # запуск и завершение Fastify + PostgreSQL
      app.ts                   # routes, CORS, headers, rate limit, errors
      config.ts                # проверка environment и чтение apps/api/.env
      telegram-auth.ts         # официальный Telegram HMAC + auth_date
      auth.ts                  # JWT guard, user из sub
      players.ts               # транзакционный upsert и DTO
      db.ts                    # Prisma + PostgreSQL adapter
      errors.ts
      generated/prisma/        # генерируется автоматически, исключено из Git
    prisma/
      schema.prisma
      migrations/20261012000000_init/migration.sql
    prisma.config.ts
    test/                      # auth, API, config, отдельная DB integration
    .env.example
  web/
    src/
      App.tsx                  # Home / Campaign / Character Select / Game, навигация
      api.ts                   # HTTP client, access token только в памяти
      usePlayerAuth.ts         # loading / authenticated / error / browser
      telegram.ts              # SDK lifecycle, theme, launch params
      CharacterSelect.tsx      # открытие и выбор персонажа
      CampaignScreen.tsx       # карта главы, запуск первого уровня
      GameScreen.tsx           # React HUD, pause, controls, Phaser lifecycle
      game/                    # level, launch, input, textures, createGame, lifecycle
      game.css                 # мобильный HUD и canvas с целым масштабом
      PlayerPanel.tsx          # аккаунт + компактный HUD
      PixelArt.tsx             # оригинальные prototype portraits/icons
      DonerMark.tsx
      tokens.css               # центральные дизайн-токены
      styles.css
    test/                      # Telegram, HTTP client, game logic; browser/game.mjs
    .env.example
packages/shared/               # runtime character/world theme catalogs и DTO, без Prisma
```

## Требования и установка

Node.js **24 LTS, >=24.11 <25**, pnpm **10.34.6** (закреплены в корневом `package.json`, Node также в `.nvmrc`). Для API нужна PostgreSQL; Docker не требуется. При наличии Corepack: `corepack enable pnpm`. Иначе: `npm install --global pnpm@10.34.6`.

```bash
pnpm install
pnpm db:generate
```

Prisma CLI, client и adapter закреплены на одной стабильной версии 7.10.0. Prisma 7 берёт URL базы из `apps/api/prisma.config.ts`. Генерация, typecheck, сборка и обычные unit tests работают без настоящих secrets и без подключения к БД.

## Environment

Создавайте локальные `.env` из `.env.example` только если файла ещё нет. **Не перезаписывайте заполненный `apps/bot/.env`.** Все `.env` исключены из Git; реальные ключи добавляются вручную. Bot и API читают свой файл относительно модуля, в том числе при запуске из `dist`. Уже заданные environment variables имеют приоритет над файлом.

| Где | Переменная | Значение |
| --- | --- | --- |
| `apps/bot/.env` | `BOT_TOKEN` | token существующего бота из BotFather |
| `apps/bot/.env` | `BOT_USERNAME` | username того же бота, без `@` |
| `apps/api/.env` | `DATABASE_URL` | URL локальной PostgreSQL, например `postgresql://USER:PASSWORD@localhost:5432/doner_game` (подставьте свои значения) |
| `apps/api/.env` | `BOT_TOKEN` | token **того же** бота, через которого открыт Mini App |
| `apps/api/.env` | `JWT_SECRET` | отдельный случайный секрет, минимум 32 байта |
| `apps/api/.env` | `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` |
| `apps/api/.env` | `NODE_ENV` | `development` |
| `apps/api/.env` | `PORT` | `3001` по умолчанию |
| `apps/api/.env` | `TELEGRAM_INIT_DATA_MAX_AGE_SECONDS` | `86400` по умолчанию, 24 часа |
| `apps/api/.env` | `TRUST_PROXY_HOPS` | `0` локально, без reverse proxy |
| `apps/web/.env` | `VITE_API_URL` | `http://localhost:3001` |

`CORS_ORIGINS` — точные origins через запятую: протокол, хост и при необходимости порт; без пути, завершающего `/` и wildcard. `localhost` и `127.0.0.1` — разные origins. Если меняете порт Vite, обновите список.

Сгенерировать сильный JWT secret локально:

```bash
openssl rand -hex 32
```

Команда использует системный криптографический генератор и возвращает 32 случайных байта в hex. Скопируйте результат только в API `.env` или Railway Variables. Не вставляйте его в README, Git или `VITE_*`. При смене секрета старые JWT становятся недействительными.

`BOT_TOKEN`, `JWT_SECRET` и `DATABASE_URL` нужны только серверной стороне. **В Vercel frontend project их добавлять нельзя.** `VITE_API_URL` — публичный URL, попадает в JavaScript при сборке. После его изменения нужны перезапуск Vite или production redeploy.

## Локальный запуск

Создайте локальную базу PostgreSQL `doner_game` своим PostgreSQL client/`createdb` и заполните API environment. Примените включённую в репозиторий миграцию:

```bash
pnpm db:deploy
pnpm dev:api
```

В логах появится `DONER GAME API started on http://localhost:3001`. API слушает `0.0.0.0` и `PORT`; при старте проверяет соединение с PostgreSQL. При ошибке конфигурации выводится понятное сообщение без значений secrets. `SIGINT`/`SIGTERM` закрывают сервер и соединения.

В другом терминале:

```bash
curl http://localhost:3001/health
# {"status":"ok"}
pnpm dev:web
```

Откройте URL Vite (обычно `http://127.0.0.1:5173`). Без `initData` остаётся **Development Mode**, запросы авторизации не выполняются. Fake Telegram login endpoint отсутствует. Реальный вход проверяется внутри Telegram через публичные HTTPS frontend и API; телефон не может обратиться к localhost вашего компьютера.

Бот запускается отдельно после настройки его `.env`:

```bash
pnpm dev:bot
```

`pnpm dev` запускает **web + api + bot** параллельно. Сначала настройте обе серверные конфигурации и примените миграцию. Остановка — `Ctrl+C`. Бот использует long polling; на один bot token должен работать один polling-процесс. API не запускает polling и может использовать тот же token для проверки подписей.

## Prisma schema и миграции

| Модель | Поля и связи |
| --- | --- |
| `User` | UUID `id`; unique BigInt `telegramId`; `firstName`; nullable `username`, `lastName`, `photoUrl`, `languageCode`; `createdAt`, `updatedAt`, `lastLoginAt` |
| `PlayerProgress` | UUID `id`; unique `userId` → User; `doners`, `goldenDoners`, `campaignStage` по умолчанию 0; nullable `selectedCharacterId`; timestamps |
| `UnlockedCharacter` | UUID `id`; `userId` → User; строковый `characterId`; `unlockedAt`; unique `(userId, characterId)` |

У игрока один `PlayerProgress` и произвольное число `UnlockedCharacter`. Foreign keys используют cascade при удалении User. На уровне БД пустой список допустим; API гарантирует starter при входе и загрузке профиля. Таблиц персонажей/кампании пока нет; строковый `characterId` оставляет возможность добавить каталог позже. В API `telegramId` всегда строка, BigInt в JSON не сериализуется напрямую.

Первый login транзакционно создаёт User и прогресс. Следующие обновляют Telegram profile и `lastLoginAt`, сохраняя валюту, campaignStage и персонажей. Отсутствующая строка прогресса восстанавливается. API идемпотентно добавляет starter и задаёт его как selected только при пустом выборе. Unique constraints и upsert защищают от дубликатов при одновременных входах.

```bash
pnpm db:generate                       # Prisma Client без соединения с БД
pnpm db:deploy                         # применить существующие миграции
pnpm db:migrate --name describe_change # создать миграцию при разработке schema
```

`db:migrate` предназначен для development DB (нужны права Prisma на shadow database). В production используйте только `db:deploy`, не `migrate dev`, `db push` или reset. Миграции включаются в Git, generated client — нет. Production build сам выполняет generate.

## API и граница доверия

| Endpoint | Доступ | Результат |
| --- | --- | --- |
| `GET /health` | публичный | `{ "status": "ok" }`, liveness; не раскрывает конфигурацию |
| `POST /auth/telegram` | публичный, 10 запросов/мин/IP | тело `{ "initData": "оригинальная строка WebApp.initData" }`; `{ accessToken, expiresIn: 3600, user, progress }` |
| `POST /characters/:characterId/unlock` | Bearer JWT, без request body | `{ result: "unlocked" или "already_unlocked", progress }` |
| `PUT /me/character` | Bearer JWT, `{ "characterId": "altoha" }` | `{ progress }` |
| `GET /me` | `Authorization: Bearer <accessToken>` | `{ user, progress }` пользователя из JWT `sub` |

`user`: `id`, `telegramId` (строка), `firstName`, nullable `lastName`, `username`, `photoUrl`, `languageCode`. `progress`: `doners`, `goldenDoners`, `campaignStage`, `unlockedCharacterIds`, nullable `selectedCharacterId`.

Проверка использует [официальный алгоритм Telegram HMAC](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app): из decoded полей удаляется `hash`, остальные сортируются и объединяются через `\n`; secret key — HMAC-SHA256 от BOT_TOKEN с ключом `WebAppData`. Сравнение hash выполняется за постоянное время. Если Telegram прислал поле `signature`, оно участвует в этом HMAC; отдельный Ed25519 flow здесь не используется. Только после проверки подписи и `auth_date` разбирается JSON user. Дубликаты полей, повреждённые данные и небезопасные числовые IDs отклоняются. Допустимое отклонение времени вперёд — 30 секунд.

JWT HS256 содержит внутренний UUID в `sub`, `iat`, `exp`, issuer и audience. Срок — час, refresh tokens отсутствуют. `/me` проверяет подпись/срок/issuer/audience и существование User; переданные клиентом `userId`/`telegramId` не определяют пользователя.

Единый формат ошибок: `{ "error": { "code": "INVALID_TELEGRAM_AUTH", "message": "..." } }`. Статусы: 400 — неверное тело, 401 — Telegram auth/JWT, 403 — locked character, 409 — недостаточно Doners, 404 — неизвестный endpoint, 413 — слишком большое тело, 429 — лимит входов, 500 — внутренняя ошибка без stack trace. HTTP body limit — 32 KiB, initData — до 16 KiB. Включены Helmet, CORS и `Cache-Control: no-store`. CORS ограничивает браузерный доступ и не заменяет авторизацию.

Rate limit хранится в памяти одного процесса, без Redis. Для этого этапа используйте одну API replica. `TRUST_PROXY_HOPS=0` игнорирует поддельный `X-Forwarded-For` при прямом локальном доступе; `1` предназначен для Railway public HTTP proxy. Не увеличивайте число доверенных proxy без проверки своей схемы размещения.

Логи содержат method, зарегистрированный route, request ID и статус. Raw URL, тела, initData, access token и ошибки драйвера с connection string не логируются. `/health` проверяет живой HTTP process; первоначальное подключение к БД проверяется на startup, постоянным database health monitor endpoint не является.

## Frontend и Telegram

Официальный SDK вызывает `ready()`/`expand()`. Если есть `WebApp.initData`, frontend отправляет **исходную строку**, получает JWT в память HTTP client, затем выполняет `/me`. Имя и прогресс на экране берутся из `/me`; `initDataUnsafe.user` не используется как доказательство личности. JWT не сохраняется в localStorage, sessionStorage или cookies. После reload выполняется новый Telegram login. После истечения сессии «Повторить» повторяет вход; если initData уже устарел, нужно закрыть Mini App и открыть заново через бота.

Состояния: «Подключаем аккаунт...», подключённый профиль, понятная ошибка с кнопкой «Повторить», Development Mode без auth. Неудачный запрос прерывается по таймауту 12 секунд; размонтирование/повтор отменяет старые запросы. Debug-блок есть только в dev-сборке, без tokens и initData.

Сохранены тема Telegram, safe areas, мобильные ширины 320–500 px и `Launch: ...`. Кнопка «СЮЖЕТ» открывает Campaign, «ИГРАТЬ С ДРУЗЬЯМИ» — панель «Скоро». `getTelegramStartParam()` читает первое допустимое значение: `initDataUnsafe.start_param`, сырой `initData`, query, hash; fallback `home`. Это параметр отображения, не авторизация. Разрешены 1–512 символов `A–Z a–z 0–9 _ -`.

Существующий Main Mini App в BotFather продолжает указывать на **HTTPS frontend URL Vercel**. Бот использует обычные URL-кнопки, работающие в личных и групповых чатах:

- `/start`, `/game` → `https://t.me/<BOT_USERNAME>?startapp=home`.
- `/help` → список команд.
- В группе при нескольких ботах: `/game@<BOT_USERNAME>`; бот должен иметь право отправлять сообщения. Отключать privacy mode для команд не требуется.
- `getMiniAppDeepLink('solo' | 'party' | 'lobby_test123')` сохраняет соответствующий startapp; параметры пока только отображаются; Campaign открывается кнопкой меню.

[Telegram: Main Mini App и startapp](https://core.telegram.org/bots/webapps#launching-the-main-mini-app).

## Сборка и тесты

```bash
pnpm typecheck
pnpm test
pnpm build
```

Проверяются все workspace-пакеты. Unit tests используют синтетические ключи: 15 bot/deep-link, 21 frontend/Telegram/HTTP/Campaign, 18 API/config/auth/catalog/routes. Они не требуют реального bot token или БД. Два API integration-набора (в том числе 11 сценариев character economy) включаются через `TEST_DATABASE_URL`; без неё явно пропускаются.

Чтобы проверить настоящую PostgreSQL, создайте **отдельную пустую тестовую** базу с именем, заканчивающимся на `_test`, затем:

```bash
DATABASE_URL='postgresql://USER:PASSWORD@localhost:5432/doner_game_test' pnpm db:deploy
TEST_DATABASE_URL='postgresql://USER:PASSWORD@localhost:5432/doner_game_test' pnpm test
```

Подставьте параметры только тестовой БД. Тест проверяет POST login → `/me`, хранение через другое соединение, BigInt, обновление profile/lastLoginAt, сохранение прогресса/персонажей, восстановление progress, concurrent upsert и все три unique constraints. Он удаляет только созданные им записи; тестовых персонажей приложение само не создаёт.

```bash
pnpm build:web   # только Vite → apps/web/dist
pnpm build:api   # generate + TypeScript → apps/api/dist
pnpm start:api   # production API после build и db:deploy
pnpm --filter @doner-game/web preview
pnpm --filter @doner-game/bot start
```

`build:web` не читает API/bot `.env`. Shared теперь содержит runtime catalog; `build:web` и `build:api` сначала собирают shared через pnpm workspace dependency graph. Root dev/test scripts также готовят shared; при изменении catalog в запущенном dev выполните `pnpm --filter @doner-game/shared build`. API build генерирует Prisma Client, но не применяет миграции. Vite preview предназначен для локальной проверки, не для production hosting.

## Этап 3 — Backend на Railway

Действия ниже выполняются вручную в вашем Railway account. Используется существующий GitHub repository с monorepo в корне; новый проект DONER GAME создавать в коде не нужно.

1. Отправьте изменения кода и первую миграцию в GitHub. `.env`, `node_modules`, `dist` и generated client не коммитьте.
2. В Railway Dashboard создайте **New Project → Empty Project**. Внутри проекта выберите **New → Database → PostgreSQL** (также можно найти PostgreSQL в меню New). Дождитесь запуска PostgreSQL service с постоянным volume. Оставьте database private; API будет обращаться к ней внутри того же проекта/environment.
3. В этом же проекте выберите **New → GitHub Repo**, подключите существующий репозиторий и нужную ветку; при необходимости разрешите Railway доступ к GitHub. Назовите новый сервис `api`. Если автоматический первый deploy начался до настройки variables, настройте их и выполните redeploy.
4. В API **Settings** оставьте корень monorepo (`/`, не `apps/api`) и builder **Railpack**. Установите:

| Настройка API service | Значение |
| --- | --- |
| Root Directory | `/` — корень репозитория |
| Build Command | `pnpm install --frozen-lockfile --prod=false && pnpm build:api` |
| Pre-deploy Command | `pnpm db:deploy` |
| Start Command | `pnpm start:api` |
| Healthcheck Path | `/health` |
| Replicas | `1` |

Railpack определяет Node 24 и pnpm из корневого package.json. Сохраняйте devDependencies в runtime image: Prisma CLI нужен для pre-deploy. Добавьте `RAILPACK_PRUNE_DEPS=false`; build с `--prod=false` также устанавливает TypeScript/Prisma при `NODE_ENV=production`. Не выбирайте `pnpm dev`: он запускает все три приложения. [Railpack: Node и pnpm monorepo](https://railpack.com/languages/node/).

5. В **API → Variables** добавьте:

| Переменная Railway API | Значение |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | reference на PostgreSQL service: `${{Postgres.DATABASE_URL}}` |
| `BOT_TOKEN` | настоящий token существующего DONER GAME bot |
| `JWT_SECRET` | результат `openssl rand -hex 32`, отдельный от bot token |
| `CORS_ORIGINS` | точный production origin Vercel, например `https://doner-game.vercel.app` |
| `TELEGRAM_INIT_DATA_MAX_AGE_SECONDS` | `86400` |
| `TRUST_PROXY_HOPS` | `1` |
| `RAILPACK_PRUNE_DEPS` | `false` |

Используйте **Add Reference / Reference Variable** для `DATABASE_URL`, чтобы Railway подставил реальное имя PostgreSQL service. Если сервис назван не `Postgres`, reference должно содержать его имя. Не копируйте URL/пароль в repository. `PORT` Railway задаёт автоматически; API читает его и слушает `0.0.0.0`. Для локального frontend при необходимости добавьте его origin через запятую; preview-домены Vercel тоже нужно разрешать явно. [Railway PostgreSQL и подключение](https://docs.railway.com/databases/postgresql).

6. Запустите deploy. Build генерирует Prisma Client. **Pre-deploy `pnpm db:deploy`** применяет включённую миграцию и создаёт `User`, `PlayerProgress`, `UnlockedCharacter`. Затем запускается API. Повторный deploy уже применённую миграцию не повторяет. Не переносите миграцию в build: Railway private network доступна pre-deploy, а не обычной build-фазе. Если migration завершится ошибкой, deployment остановится; исправьте причину и повторите. [Railway pre-deploy](https://docs.railway.com/deployments/pre-deploy-command).
7. В **API → Settings → Networking → Public Networking → Generate Domain** получите HTTPS URL, например `https://YOUR-API.up.railway.app`. Если Railway просит target port, выберите порт, на котором API слушает `PORT` (виден в startup log). Публичный домен нужен API service, не PostgreSQL. [Railway public networking](https://docs.railway.com/networking/public-networking).
8. Проверьте с вашего компьютера:

```bash
curl -i https://YOUR-API.up.railway.app/health
```

Ожидается HTTP 200 и `{"status":"ok"}`. `/me` без Bearer token должен вернуть HTTP 401. Если `/health` не отвечает, проверьте deployment/startup log, PORT и применение migration; не публикуйте secrets или полные auth запросы при диагностике.

## Vercel: подключить API и пересобрать frontend

Для существующего Vercel project сохраняются настройки monorepo:

| Настройка | Значение |
| --- | --- |
| Framework Preset | `Vite` |
| Root Directory | корень репозитория (`.` / пусто) |
| Node.js Version | `24.x` |
| Install Command | `pnpm install --frozen-lockfile` |
| Build Command | `pnpm build:web` |
| Output Directory | `apps/web/dist` |

1. В **Settings → Environment Variables** добавьте `VITE_API_URL=https://YOUR-API.up.railway.app` для **Production** (и Preview, если нужен). Это URL API без `/health` и `/auth/telegram`.
2. Сохраните `ENABLE_EXPERIMENTAL_COREPACK=1` для выбора закреплённого pnpm. **BOT_TOKEN, JWT_SECRET, DATABASE_URL в Vercel не добавляйте.**
3. Выполните **Redeploy**: изменение variable без сборки не меняет уже опубликованный JavaScript.
4. Откройте постоянный публичный production URL в обычном браузере: должен появиться Development Mode, версия `v0.5 Playable Prototype`, без debug-блока. Frontend должен открываться без Vercel Authentication.
5. В Railway `CORS_ORIGINS` должен совпадать именно с этим frontend origin. В BotFather Main Mini App URL остаётся URL frontend; API URL туда не вставляйте.

[Настройка Vite в Vercel](https://vercel.com/docs/frameworks/frontend/vite), [сборка и Corepack](https://vercel.com/docs/builds/configure-a-build).

## Проверка настоящего Telegram login и PostgreSQL

1. Откройте Mini App заново через `/start`, `/game` или `https://t.me/<BOT_USERNAME>?startapp=home` **в Telegram**. Должно появиться «Подключаем аккаунт...», затем ваше имя, username (если есть), «Аккаунт подключён ✓», Doners: 0 и Golden Doners: 0 для нового аккаунта.
2. Если доступен WebView inspector, проверьте последовательность `POST /auth/telegram` 200 → `GET /me` 200. Не копируйте initData или JWT в screenshots/issues. Надпись «Открыто в Telegram» сама по себе не доказывает успешную авторизацию.
3. В Railway выберите **PostgreSQL → Database / Data** и таблицу `User`: найдите ваш `telegramId`, проверьте `firstName`, `lastLoginAt`. В `PlayerProgress` должна быть одна строка с тем же внутренним `userId`, валютами и campaignStage 0. `UnlockedCharacter` содержит `altoha`, а `PlayerProgress.selectedCharacterId` — `altoha` при первом выборе. Имена вкладок зависят от Dashboard; также можно открыть SQL client через подключение PostgreSQL из Railway.
4. Закройте и откройте Mini App снова: внутренний `User.id` остаётся прежним, `lastLoginAt` обновляется; лишние User/PlayerProgress не появляются. Существующий прогресс сохраняется (автоматическая integration-проверка покрывает ненулевые значения).
5. Проверьте `startapp=solo`, `party`, `lobby_test123`, а также `/game@<BOT_USERNAME>` в группе: Launch меняется, «СЮЖЕТ» открывает Campaign, а Party и запуск уровня остаются «Скоро».
6. Если API недоступен, остаётся экран с «Не удалось подключиться к серверу» и «Повторить». При 401 Telegram проверьте совпадение BOT_TOKEN, свежесть запуска и время сервера; не отключайте проверку подписи. При 429 подождите минуту. При CORS error сверяйте точный frontend origin.

Настоящий вход через ваш bot и облачная база требуют ваших secrets и ручного deployment. Локальные тесты используют отдельную PostgreSQL и синтетические подписанные данные; это не замена финальной проверке в Telegram.

## Stage 4 — Campaign & Characters

Описание завершённого Stage 4 ниже сохранено как история backend/economy изменений. Актуальный запуск уровня и инструкции обновления frontend — в разделе Stage 5.

Весь Mini App использует Hi-Bit Lo-Fi design system: тёмный фон, оранжевый DONER, cream text, ступенчатые рамки, жёсткие pixel shadows, компактный HUD, лёгкий dithering и scanlines. Home, Campaign, Character Select, loading/error/retry и Party placeholder оформлены единообразно. Правила для следующих этапов — [docs/ART_DIRECTION.md](docs/ART_DIRECTION.md). Персонажи и эмблема — оригинальные SVG на пиксельной сетке, без внешних art/font CDN.

Каталог — **`packages/shared/src/characters.ts`**, одинаковый для API и frontend:

| ID | Имя | Starter | Цена |
| --- | --- | --- | --- |
| `altoha` | Altoha | да | 0 |
| `aigerim` | Aigerim | нет | 1 Doner |
| `temik` | Temik | нет | 1 Doner |

Стоимость, порядок, имя, описание и starter-флаг задаются в каталоге. Здесь нет способностей. Aigerim и Temik можно открыть в любом порядке. При смене starter в будущем каталог должен сохранять хотя бы одного starter; прежние разблокировки не удаляются.

**Existing users / backfill.** После успешного `/auth/telegram` и при загрузке через `/me` API в транзакции обеспечивает запись starter через `createMany(skipDuplicates)`. Если selection пуст, устанавливается starter из catalog. Уже выбранный персонаж, валюты, campaignStage и все прежние unlocks сохраняются. Таким образом, пользователь Stage 3 с пустыми unlocks получит Altoha при первом обращении к обновлённому API, в том числе со старым действующим JWT. Массовый SQL backfill и отдельный ручной script не нужны; до первого обращения неактивные строки могут оставаться с NULL.

**Открытие.** `POST /characters/:characterId/unlock` использует только current user из JWT. Request body не принимается: клиент не передаёт цену, баланс или userId. Неизвестный character — 400 `INVALID_CHARACTER`, недостаточно средств — 409 `INSUFFICIENT_DONERS`. Повторное открытие, включая starter, возвращает 200 `already_unlocked` без списания.

API блокирует строку User через параметризованный `SELECT ... FOR UPDATE`, проверяет ownership, условно уменьшает Doners (`doners >= catalog.unlockCost`) и создаёт unlock в **одной Prisma transaction**. Все изменения персонажей используют одинаковый порядок блокировок. Конкурирующие операции одного игрока выполняются последовательно даже в разных API process; unique constraint `(userId, characterId)` остаётся дополнительной защитой. Ошибка после списания откатывает и баланс, и unlock. Проверены одинаковые покупки и конкуренция разных персонажей за последний Doner. [PostgreSQL row locks](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS), [Prisma transactions](https://www.prisma.io/docs/orm/fundamentals/transactions).

**Выбор.** `PUT /me/character` принимает только `{ "characterId": "altoha" }`. Locked character → 403 `CHARACTER_LOCKED`. Выбор сохраняется в `PlayerProgress.selectedCharacterId` и возвращается в `/me`. Unlock не переключает персонажа автоматически. Frontend обновляет progress исключительно ответом сервера; во время операции кнопки блокируются. При потерянном ответе профиль перечитывается; повторный unlock безопасен. JWT по-прежнему только в памяти.

**Campaign.** Home → Campaign → Character Select управляются небольшим state (`campaign.ts`), без React Router. Есть видимый Back и Telegram BackButton. При `campaignStage=0` уровень 1 доступен, 2/3 закрыты. Сохранённое значение используется для отображения: предыдущие узлы отмечаются пройденными, следующий доступным. Самих уровней и endpoint изменения campaignStage нет. Запуск отключён («СКОРО»); награды Doner/Golden Doner не начисляются. Новый игрок с нулевым балансом пока может выбирать только Altoha. Production endpoints выдачи валюты отсутствуют.

**Портреты.** Внешность всех трёх персонажей временная, с меткой «ПРОТОТИП». Точка замены на будущие локальные PNG/WebP — `CharacterPortrait` в `apps/web/src/PixelArt.tsx`. Карточки и HUD менять не нужно. Игровые sprite sheets подключаются на следующих этапах; текущие placeholders не определяют финальную внешность/способности.

**Production migration и deployment:**

1. Отправьте изменения в существующий Git repository. Новая миграция: `apps/api/prisma/migrations/20261013000000_selected_character/migration.sql`. Она только добавляет nullable TEXT `PlayerProgress.selectedCharacterId`, без удаления данных и сброса валюты.
2. На Railway сначала redeploy **API** с существующим pre-deploy **`pnpm db:deploy`**. Должна примениться `20261013000000_selected_character`; начальную миграцию не изменяйте. Root Directory и архитектура остаются прежними. Сохраните Build `pnpm install --frozen-lockfile --prod=false && pnpm build:api`, Start `pnpm start:api`, Healthcheck `/health`.
3. **Environment variables менять не нужно.** Существующие DATABASE_URL/BOT_TOKEN/JWT_SECRET остаются только на backend; `VITE_API_URL` остаётся прежним. Shared теперь имеет runtime JS, поэтому используйте обновлённые root build scripts, которые собирают его перед API/web.
4. После успешного API deploy проверьте `/health`, затем в **Vercel** выполните redeploy новой версии с прежним `pnpm build:web` и `apps/web/dist`. Порядок API → frontend предотвращает запросы к отсутствующим новым endpoint.
5. Заново откройте Mini App. Версия — `v0.4 Campaign Prototype`. У существующего аккаунта должен появиться Altoha, выбор сохранится. В PostgreSQL проверьте одну строку `UnlockedCharacter(altoha)`, поле `selectedCharacterId` и прежний баланс. Повторный вход не должен добавлять дубликаты.
6. Проверьте Home → Campaign → Character Select → Back, locked Aigerim/Temik по 1 Doner, disabled запуск уровня и Party «Скоро». Покупки с достаточным балансом, double unlock и rollback проверяются на отдельной тестовой PostgreSQL; начислять деньги через production API невозможно.

Для автоматической проверки экономики: `TEST_DATABASE_URL=... pnpm test` после миграции отдельной базы с суффиксом `_test`. Набор включает starter новых/существующих игроков, идемпотентность, locked selection, оба независимых unlock, сохранение выбора, недостаточный баланс, конкуренцию через два подключения, rollback после ошибки вставки и реальные HTTP responses. Ни один тест не подключается к production автоматически.

## Stage 5 — First Playable Phaser Prototype

Первый playable vertical slice: **Home → Сюжет → Играть · Уровень 1** с текущим персонажем. Если выбор отсутствует, откройте «Выбрать персонажа». На Character Select после подтверждённого выбора также есть кнопка игры. При выходе видимая Back и Telegram BackButton возвращают на экран, откуда уровень запущен.

**Проверка доступа.** `game/launch.ts` получает `selectedCharacterId` и `unlockedCharacterIds` из authenticated profile. Известный персонаж должен одновременно быть выбран и открыт; баланс не даёт права запуска locked character. Во время выбора запуск запрещён до ответа существующего `PUT /me/character`. Auth flow, JWT в памяти и `/me` сохранены. Игровой runtime вообще не импортирует API client и не отправляет запросов о прохождении.

**Phaser и React.** `GameScreen.tsx` отвечает за заголовок, HUD, паузу, подсказки, loading/error/retry и мобильные controls. Engine **Phaser 4.2.1** импортируется динамически только при входе в игру; Home/Campaign не загружают его. `game/createGame.ts` создаёт одну scene с Arcade Physics, Canvas renderer, `pixelArt` и `roundPixels`. Canvas отображается в целочисленном 2×; ResizeObserver изменяет viewport без изменения уровня. При выходе снимаются DOM/Telegram listeners и ResizeObserver, сбрасывается ввод, вызывается `game.destroy(true, false)`, canvas удаляется. Поздний результат lazy import не создаёт игру после unmount, включая React StrictMode. Phaser завершает собственное уничтожение на следующем кадре; core plugins оставлены доступными для повторного запуска. [Phaser game lifecycle](https://docs.phaser.io/phaser/concepts/game).

**Уровень и управление.** `game/level.ts` задаёт LevelDefinition: id, name, availability, world bounds, spawn, goal, массив прямоугольных платформ. Пока доступен один уровень 1200×344 logical px; два следующих остаются заглушками. Непрерывная земля, уступы и верхние площадки позволяют исследовать короткий участок без смерти/respawn. Камера следует за игроком и ограничена миром. Ускорение/торможение, gravity, небольшой jump buffer 100 ms и coyote time 80 ms делают управление мягче; удержание прыжка не вызывает автоматические повторные прыжки.

- Desktop: **A/D или ←/→**, прыжок **Space/W/↑**, пауза **P/Escape**.
- Mobile: **Влево / Вправо / Прыжок** под игровым полем; поддержаны несколько пальцев, pointer capture, отмена касания и release.
- Потеря фокуса/скрытие вкладки ставит игру на паузу и очищает ввод; продолжение явное. На Telegram 7.7+ жесты сворачивания при игре временно отключаются и восстанавливаются при выходе. [Telegram Mini Apps API](https://core.telegram.org/bots/webapps#initializing-mini-apps).
- У флага появляется подсказка. **Completion rewards, Doner/Golden Doner и campaign progression не реализованы.** Выход не обновляет production progress.

**Три мира.** `packages/shared/src/worldThemes.ts` содержит типизированный catalog: themeId, characterId, displayName, palette, background/platform/decor styles и player colors. Mapper по выбранному ID даёт:

| selectedCharacterId | themeId | Представление |
| --- | --- | --- |
| `altoha` | `altoha-city` | night city, небоскрёбы, neon signs, orange/cyan, металлические платформы |
| `aigerim` | `aigerim-imperial` | violet imperial courtyard, арки, колонны, gold/burgundy banners, камень |
| `temik` | `temik-bazaar` | desert bazaar, песчаные крыши, арки, навесы, terracotta/red/teal |

Геометрия и физика общие, визуальные генераторы выбираются через catalog. `game/textures.ts` программно создаёт собственные tiles 32×32, два слоя фона 256×512, тематический декор, флаг и четыре кадра персонажа 16×24. Чужих или скачанных изображений нет. Позже достаточно заменить источник текстур/кадров на собственные sprite sheets, сохранив согласованный body и размеры. Parallax двух фонов (0.14/0.38) отключается при reduced motion; обязательное движение игрока/камеры сохраняется. Правила подробно описаны в [ART_DIRECTION.md](docs/ART_DIRECTION.md#15-in-game-worlds--stage-5).

**Локальная игра без Telegram.** Запустите `pnpm dev:web`, откройте браузер → Сюжет → `LOCAL DEVELOPMENT PREVIEW` → Altoha/Aigerim/Temik. Можно проверить все миры без API/БД/credentials. Это отдельный просмотр, а не покупка или fake account: он требует `import.meta.env.DEV` и browser state без initData. В production и при Telegram auth error кнопок preview нет; обычный browser shell остаётся доступным. Реальный аккаунт играет только открытым персонажем.

**Проверки:**

```bash
pnpm typecheck
pnpm build
pnpm test
# Для полного regression экономики вместо пропуска DB integration:
TEST_DATABASE_URL=postgresql://user:password@localhost:5432/doner_test pnpm test
```

Новые unit tests: все три mapping, запуск открытого/отказ locked, отсутствие selection, dev gating, Back origin, geometry, несколько источников ввода, jump edge, unmount во время import, destroy, ошибки загрузки и lifecycle жестов Telegram. Старые тесты авторизации/API/бота остаются в общем запуске. DB integration требует отдельную мигрированную `*_test` базу, не production.

Воспроизводимые браузерные тесты используют настоящий Phaser/Chromium и синтетические HTTP/Telegram fixtures. Они не покупают персонажей реального пользователя и не обращаются к production API:

```bash
pnpm --filter @doner-game/web exec playwright install chromium
# Терминал 1: сначала собрать runtime shared, затем запустить web
pnpm --filter @doner-game/shared build
VITE_API_URL=http://127.0.0.1:3013 pnpm --filter @doner-game/web dev --port 5185 --strictPort
# Терминал 2
pnpm --filter @doner-game/web test:browser
```

Для production UI: собрать `VITE_API_URL=http://127.0.0.1:3013 pnpm build:web`, запустить `pnpm --filter @doner-game/web preview --port 4185 --strictPort`, затем `BROWSER_TEST_URL=http://127.0.0.1:4185 BROWSER_TEST_PRODUCTION=1 pnpm --filter @doner-game/web test:browser`. URL localhost здесь только тестовая подстановка; production собирается с прежним настоящим `VITE_API_URL` из Vercel. `BROWSER_SCREENSHOT_DIR` опционально сохраняет три скриншота в существующий каталог.

Browser suite проверяет запуск из Campaign и Character Select, три темы, locked/missing selection, server-confirmed выбор, reload/auth hook, UI/Telegram Back, повторные входы, cleanup keyboard/canvas, все controls и отсутствие overflow на **320/375/390/430/500 px**. Dev suite дополнительно проверяет реальную физику: движение, прыжок, landing, collision, camera, bounds, флаг, pause и native multi-touch/cancel. Production suite проверяет отсутствие local preview. Это эмуляция браузера: финальная проверка внутри настоящих Telegram iOS/Android остаётся ручной.

**Ручной production deployment Stage 5:**

1. После review отправьте изменения в свой Git repository и вручную запустите frontend deploy в Vercel. Автоматический deployment в рамках работы над Stage 5 не выполняется.
2. Используйте существующие параметры: `pnpm install --frozen-lockfile`, Build **`pnpm build:web`**, Output **`apps/web/dist`**, текущий `VITE_API_URL`. Новых env variables нет; `.env` менять не нужно.
3. **Новых migrations/backend endpoints нет.** Если Stage 4 API уже развёрнут, для Stage 5 не нужны redeploy API/бота и изменения PostgreSQL. Shared остаётся частью root build graph.
4. Откройте Mini App заново: версия **v0.5 Playable Prototype**. Проверьте вход, Campaign → level 1, A/D/прыжок, mobile controls, pause, UI и Telegram Back, повторный запуск. Для уже открытых персонажей проверьте соответствующие миры; locked персонажи недоступны для игры.
5. После выхода баланс и campaignStage должны остаться прежними. Проверьте safe-area и touch на реальных Telegram iOS/Android. Убедитесь, что local preview и диагностические координаты отсутствуют в production.

**Ограничения.** Один короткий уровень и временные спрайты, без звука, врагов, урона, смерти, checkpoints, rewards, inventory, abilities и multiplayer. Пауза локальная, перезагрузка начинает уровень со spawn. Phaser загружается отдельным chunk около 1.38 MB (360 kB gzip); Vite сообщает ожидаемое предупреждение >500 kB. Он не входит в начальную загрузку меню. Производительность на реальных устройствах ещё требует ручной проверки. Stage 6 не начат.
