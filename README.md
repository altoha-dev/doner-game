# DONER GAME

Telegram Bot + Telegram Mini App + API. **Этап 3, v0.3 Account Prototype:** сервер проверяет Telegram initData, сохраняет игрока и прогресс в PostgreSQL, выдаёт JWT на один час. Frontend получает профиль через `/me` и показывает «Аккаунт подключён ✓», Doners и Golden Doners.

Кнопки «СЮЖЕТ» и «ИГРАТЬ С ДРУЗЬЯМИ» пока показывают «Скоро». Campaign, уровни, выбор/покупка персонажей, Lobby, Party, ghosts и WebSocket относятся к будущим этапам. При регистрации персонажи не открываются.

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
      App.tsx                  # экран аккаунта, заглушки режимов
      api.ts                   # HTTP client, access token только в памяти
      usePlayerAuth.ts         # loading / authenticated / error / browser
      telegram.ts              # SDK lifecycle, theme, launch params
      DonerMark.tsx
      styles.css
    test/                      # Telegram helpers и HTTP client
    .env.example
packages/shared/               # GameMode и DTO; только типы, без Prisma
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
| `PlayerProgress` | UUID `id`; unique `userId` → User; `doners`, `goldenDoners`, `campaignStage` по умолчанию 0; timestamps |
| `UnlockedCharacter` | UUID `id`; `userId` → User; строковый `characterId`; `unlockedAt`; unique `(userId, characterId)` |

У игрока один `PlayerProgress` и произвольное число `UnlockedCharacter`. Foreign keys используют cascade при удалении User. Пустой список персонажей допустим. Таблиц персонажей/кампании пока нет; строковый `characterId` оставляет возможность добавить каталог позже. В API `telegramId` всегда строка, BigInt в JSON не сериализуется напрямую.

Первый login транзакционно создаёт User и прогресс. Следующие обновляют Telegram profile и `lastLoginAt`, сохраняя валюту, campaignStage и персонажей. Отсутствующая строка прогресса восстанавливается. Unique constraints и upsert защищают от дубликатов при одновременных входах.

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
| `GET /me` | `Authorization: Bearer <accessToken>` | `{ user, progress }` пользователя из JWT `sub` |

`user`: `id`, `telegramId` (строка), `firstName`, nullable `lastName`, `username`, `photoUrl`, `languageCode`. `progress`: `doners`, `goldenDoners`, `campaignStage`, `unlockedCharacterIds`.

Проверка использует [официальный алгоритм Telegram HMAC](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app): из decoded полей удаляется `hash`, остальные сортируются и объединяются через `\n`; secret key — HMAC-SHA256 от BOT_TOKEN с ключом `WebAppData`. Сравнение hash выполняется за постоянное время. Если Telegram прислал поле `signature`, оно участвует в этом HMAC; отдельный Ed25519 flow здесь не используется. Только после проверки подписи и `auth_date` разбирается JSON user. Дубликаты полей, повреждённые данные и небезопасные числовые IDs отклоняются. Допустимое отклонение времени вперёд — 30 секунд.

JWT HS256 содержит внутренний UUID в `sub`, `iat`, `exp`, issuer и audience. Срок — час, refresh tokens отсутствуют. `/me` проверяет подпись/срок/issuer/audience и существование User; переданные клиентом `userId`/`telegramId` не определяют пользователя.

Единый формат ошибок: `{ "error": { "code": "INVALID_TELEGRAM_AUTH", "message": "..." } }`. Статусы: 400 — неверное тело, 401 — Telegram auth/JWT, 404 — неизвестный endpoint, 413 — слишком большое тело, 429 — лимит входов, 500 — внутренняя ошибка без stack trace. HTTP body limit — 32 KiB, initData — до 16 KiB. Включены Helmet, CORS и `Cache-Control: no-store`. CORS ограничивает браузерный доступ и не заменяет авторизацию.

Rate limit хранится в памяти одного процесса, без Redis. Для этого этапа используйте одну API replica. `TRUST_PROXY_HOPS=0` игнорирует поддельный `X-Forwarded-For` при прямом локальном доступе; `1` предназначен для Railway public HTTP proxy. Не увеличивайте число доверенных proxy без проверки своей схемы размещения.

Логи содержат method, зарегистрированный route, request ID и статус. Raw URL, тела, initData, access token и ошибки драйвера с connection string не логируются. `/health` проверяет живой HTTP process; первоначальное подключение к БД проверяется на startup, постоянным database health monitor endpoint не является.

## Frontend и Telegram

Официальный SDK вызывает `ready()`/`expand()`. Если есть `WebApp.initData`, frontend отправляет **исходную строку**, получает JWT в память HTTP client, затем выполняет `/me`. Имя и прогресс на экране берутся из `/me`; `initDataUnsafe.user` не используется как доказательство личности. JWT не сохраняется в localStorage, sessionStorage или cookies. После reload выполняется новый Telegram login. После истечения сессии «Повторить» повторяет вход; если initData уже устарел, нужно закрыть Mini App и открыть заново через бота.

Состояния: «Подключаем аккаунт...», подключённый профиль, понятная ошибка с кнопкой «Повторить», Development Mode без auth. Неудачный запрос прерывается по таймауту 12 секунд; размонтирование/повтор отменяет старые запросы. Debug-блок есть только в dev-сборке, без tokens и initData.

Сохранены тема Telegram, safe areas, мобильные ширины 320–500 px, кнопки-заглушки и `Launch: ...`. `getTelegramStartParam()` читает первое допустимое значение: `initDataUnsafe.start_param`, сырой `initData`, query, hash; fallback `home`. Это параметр отображения, не авторизация. Разрешены 1–512 символов `A–Z a–z 0–9 _ -`.

Существующий Main Mini App в BotFather продолжает указывать на **HTTPS frontend URL Vercel**. Бот использует обычные URL-кнопки, работающие в личных и групповых чатах:

- `/start`, `/game` → `https://t.me/<BOT_USERNAME>?startapp=home`.
- `/help` → список команд.
- В группе при нескольких ботах: `/game@<BOT_USERNAME>`; бот должен иметь право отправлять сообщения. Отключать privacy mode для команд не требуется.
- `getMiniAppDeepLink('solo' | 'party' | 'lobby_test123')` сохраняет соответствующий startapp; настоящие режимы пока не открываются.

[Telegram: Main Mini App и startapp](https://core.telegram.org/bots/webapps#launching-the-main-mini-app).

## Сборка и тесты

```bash
pnpm typecheck
pnpm test
pnpm build
```

Проверяются все workspace-пакеты. Unit tests используют синтетические ключи: 15 bot/deep-link, 17 frontend/Telegram/HTTP, 16 API/config/auth. Они не требуют реального bot token или БД. Ещё один API integration test включается через `TEST_DATABASE_URL`; без неё явно пропускается.

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

`build:web` не читает API/bot `.env`; shared содержит только type imports. API build генерирует Prisma Client, но не применяет миграции. Vite preview предназначен для локальной проверки, не для production hosting.

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
4. Откройте постоянный публичный production URL в обычном браузере: должен появиться Development Mode, версия `v0.3 Account Prototype`, без debug-блока. Frontend должен открываться без Vercel Authentication.
5. В Railway `CORS_ORIGINS` должен совпадать именно с этим frontend origin. В BotFather Main Mini App URL остаётся URL frontend; API URL туда не вставляйте.

[Настройка Vite в Vercel](https://vercel.com/docs/frameworks/frontend/vite), [сборка и Corepack](https://vercel.com/docs/builds/configure-a-build).

## Проверка настоящего Telegram login и PostgreSQL

1. Откройте Mini App заново через `/start`, `/game` или `https://t.me/<BOT_USERNAME>?startapp=home` **в Telegram**. Должно появиться «Подключаем аккаунт...», затем ваше имя, username (если есть), «Аккаунт подключён ✓», Doners: 0 и Golden Doners: 0 для нового аккаунта.
2. Если доступен WebView inspector, проверьте последовательность `POST /auth/telegram` 200 → `GET /me` 200. Не копируйте initData или JWT в screenshots/issues. Надпись «Открыто в Telegram» сама по себе не доказывает успешную авторизацию.
3. В Railway выберите **PostgreSQL → Database / Data** и таблицу `User`: найдите ваш `telegramId`, проверьте `firstName`, `lastLoginAt`. В `PlayerProgress` должна быть одна строка с тем же внутренним `userId`, валютами и campaignStage 0. `UnlockedCharacter` остаётся пустой. Имена вкладок зависят от Dashboard; также можно открыть SQL client через подключение PostgreSQL из Railway.
4. Закройте и откройте Mini App снова: внутренний `User.id` остаётся прежним, `lastLoginAt` обновляется; лишние User/PlayerProgress не появляются. Существующий прогресс сохраняется (автоматическая integration-проверка покрывает ненулевые значения).
5. Проверьте `startapp=solo`, `party`, `lobby_test123`, а также `/game@<BOT_USERNAME>` в группе: Launch меняется, кнопки по-прежнему показывают «Скоро».
6. Если API недоступен, остаётся экран с «Не удалось подключиться к серверу» и «Повторить». При 401 Telegram проверьте совпадение BOT_TOKEN, свежесть запуска и время сервера; не отключайте проверку подписи. При 429 подождите минуту. При CORS error сверяйте точный frontend origin.

Настоящий вход через ваш bot и облачная база требуют ваших secrets и ручного deployment. Локальные тесты используют отдельную PostgreSQL и синтетические подписанные данные; это не замена финальной проверке в Telegram.
