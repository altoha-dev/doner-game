# DONER GAME — v0.6 Party Reboot Prototype

Telegram Mini App + Bot. Новая концепция — **Winter Party Edition**, multiplayer party platformer на одной общей карте. Stage 6.0 реализует локальную тренировку BUILD → RACE → RESULTS. Сетевые комнаты и магазин пока не реализованы; их кнопки сообщают о Stage 6.1.

[Итоговый отчёт Stage 6.0: изменения, проверки, архив и скриншоты](docs/STAGE_6_REPORT.md).

## Попробовать

Node 24 (>=24.11 <25), pnpm 10.34.6. В установленном проекте:

```bash
pnpm dev:web
```

Открыть URL Vite → **ТРЕНИРОВКА** → **ПЛАТФОРМА** → выбрать место касанием или стрелками → **ПОСТАВИТЬ БЛОК** → **НАЧАТЬ ЗАБЕГ** → дойти до финиша → **СЛЕДУЮЩИЙ РАУНД**. Старый блок остаётся. **НОВЫЙ МАТЧ** сбрасывает карту; выход в меню/reload также завершает локальную сессию. Для тренировки API, Bot и Telegram-аккаунт не нужны.

На клавиатуре A/D или ←/→, W/↑/Space для прыжка, P/Escape для паузы. На телефоне отдельные кнопки. BUILD использует касание, точные стрелки и ползунок обзора карты. До 12 бесплатных блоков/раундов; реальные Doner не начисляются и не списываются.

Для чистой установки: `pnpm install`, затем `pnpm db:generate`. Существующие заполненные `.env` сохраняются. API можно запустить `pnpm dev:api` с уже подготовленной локальной БД, бот — `pnpm dev:bot`. `pnpm dev` запускает все приложения; на одном bot token не запускайте второй polling-процесс. Stage 6.0 не требует новых миграций.

## Архитектура

```text
apps/web/src/
  App.tsx, WinterScene.tsx          зимний Home и навигация
  CharacterSelect.tsx             выбор без покупки; browser training selection
  PlayerPanel.tsx                 Telegram identity/avatar, Doner, выбранный герой
  GameScreen.tsx                  BUILD/RACE/RESULTS UI, input и lifecycle
  game/localSession.ts            immutable состояние локального матча
  game/createGame.ts              Phaser, collisions, camera, phase presentation
  game/arenaPresentation.ts       визуальная сборка общей зимней карты
  game/textures.ts                оригинальные code-native pixel textures
  game/playerVisual.ts            replaceable sprite descriptor
  game/level.ts                   visual regions и существующие movement constants
  game/input.ts, lifecycle.ts     удержание кнопок, безопасный lazy mount/cleanup
packages/shared/src/
  arena.ts                       единая geometry/spawns/finish/placement areas
  party.ts                       contracts, placement validation, future rules
  characters.ts, index.ts         стабильные IDs, существующие account DTO
apps/api/                        существующие Fastify/auth/Prisma/PostgreSQL
apps/bot/                        существующие grammY /start /help /game
```

`selectedCharacterId` выбирает только героя. `SNOWY_CHAOS` и MatchSnapshot общие. Geometry, визуальные плитки, spawn, finish и зоны строительства разделены. Phaser получает snapshot через runtime adapter; локальная session позже заменяется сетевой authority. Подробности: [game design](docs/GAME_DESIGN.md), [multiplayer plan](docs/MULTIPLAYER_ARCHITECTURE.md), [art direction](docs/ART_DIRECTION.md).

## Аккаунт и database safety

Сохранены Telegram initData HMAC → JWT → GET /me, Telegram user ID, имя/username/avatar, account connection/error/retry, selected character и balances. JWT остаётся только в памяти. initDataUnsafe не подтверждает личность. Старые startapp=solo не открывают удалённый Campaign.

Prisma schema и все migrations **не изменялись**. User, PlayerProgress, UnlockedCharacter сохранены, включая legacy campaignStage/goldenDoners и старый unlock endpoint для совместимости. Новый UI не вызывает покупки. Новых Room/Match таблиц, reward endpoint и WebSocket server нет. Сетевые entities пока только предложены в документации.

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

## Существующий hosting contract

Production configuration и variables не менялись. Этот этап не выполняет deploy, push, reset или migrations.

| Сервис | Сохранённые параметры |
| --- | --- |
| Vercel web | Root monorepo; install `pnpm install --frozen-lockfile`; build `pnpm build:web`; output `apps/web/dist`; Node 24; `ENABLE_EXPERIMENTAL_COREPACK=1`; публичный `VITE_API_URL` |
| Railway API | Root monorepo; build `pnpm install --frozen-lockfile --prod=false && pnpm build:api`; start `pnpm start:api`; health `/health`; 1 replica |
| Railway environment | DATABASE_URL, BOT_TOKEN, JWT_SECRET, CORS_ORIGINS, NODE_ENV, PORT, TELEGRAM_INIT_DATA_MAX_AGE_SECONDS, TRUST_PROXY_HOPS, RAILPACK_PRUNE_DEPS |
| Existing migration hook | `pnpm db:deploy` остаётся прежним hosting contract; в Stage 6.0 не запускался |
| BotFather | Main Mini App URL остаётся HTTPS frontend; bot `/start` и `/game` используют startapp=home |

Для реального Telegram нужны доступные по HTTPS web/API и совпадающий CORS origin. Production smoke на телефонах остаётся отдельной ручной проверкой после разрешённого будущего deploy. Текущий браузерный QA использует синтетический Telegram SDK/API, а API integration — только отдельную временную БД.

## Проверки

```bash
pnpm typecheck
pnpm build
pnpm test
git diff --check
```

`pnpm test` без TEST_DATABASE_URL явно пропускает PostgreSQL integration. Полная проверка требует отдельной fixture БД с текущей схемой, именем `*_test` и TEST_DATABASE_URL. Production DATABASE_URL использовать для этих тестов нельзя. Build/typecheck выполняют Prisma generate, но не migrations и не подключение к production.

Browser QA (Playwright Chromium):

```bash
VITE_API_URL=http://127.0.0.1:3013 pnpm --filter @doner-game/web dev --port 5185
pnpm --filter @doner-game/web test:browser
```

API на 3013 запускать не нужно: browser tests перехватывают запросы fixture-ответами. Если Chromium не установлен, `pnpm --filter @doner-game/web exec playwright install chromium`. При нестандартной папке браузеров задать PLAYWRIGHT_BROWSERS_PATH. Скриншоты: `artifacts/stage-6/`. Для production preview: собрать с fixture VITE_API_URL, поднять `preview --port 4185`, затем задать BROWSER_TEST_URL=http://127.0.0.1:4185 и BROWSER_TEST_PRODUCTION=1.

## Архив старого прототипа

Перед очисткой сохранены 136 файлов и git diff/status:

`/Users/altoha/Desktop/doner-game-archives/stage-5.6-before-party-reboot-2026-10-19/stage-5.6.tar.gz`

Рядом SHA256.json (каждый файл проверен чтением из архива), working-tree.patch и git-status.txt. Архив включает source/work/public assets, tools, старые screenshots, frontend/shared код и документацию. `.env` не включались и не менялись. До удаления файлы повторно сверены с hashes. Не использовался git clean.

Из активного дерева удалены старые asset-source/asset-work/game-assets, pack processing tools, manifests/world themes/previews, CampaignScreen/campaign/launch и устаревшие тесты/документы. Движение, input и Phaser cleanup сохранены и адаптированы. Sharp больше не нужен и удалён из root dependencies.

## Ограничения

Один локальный игрок; нет online room, abilities, rewards, магазина, врагов, death/respawn или сохранения карты после выхода. Сложное размещение может перекрыть маршрут вне защищённых зон; глобальный path validation ещё не реализован. Спрайты временные. Phaser загружается лениво при входе в арену; его chunk превышает стандартное предупреждение Vite 500 kB.

Следующий этап — общая серверная комната и настоящий BUILD/RACE с друзьями, authoritative finish, reconnect и mobile latency. Stage 6.1 в этой работе не начинался.
