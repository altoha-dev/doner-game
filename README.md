# DONER GAME — v0.6.3 Doner Economy & Trap Shop

Telegram Mini App + Bot. Зимний party platformer для 2–4 друзей: LOBBY → BUILD → RACE → RESULTS → NEXT. В BUILD доступны PLATFORM BLOCK, FAN и ARCADE CROSSBOW: общая карта, live previews с направлением, серверные силы воздуха, снаряды и быстрый respawn. Четыре персонажа, контакты и smoothing Stage 6.1.6 сохранены.

**DONER SHOP:** BLOCK бесплатно, EXTRA BLOCK1, FAN2, CROSSBOW3. Покупка списывает существующий Doner только вместе с подтверждённым размещением. За места1/2/3/4+ сервер даёт очки3/2/1/0 и Doner0/1/2/3; DNF и Training —0. Нужны минимум два действительно игравших аккаунта. Golden Doner и старый прогресс сохраняются.

[Отчёт Stage 6.3 и deployment](docs/STAGE_6_3_REPORT.md) · [Progress](docs/STAGE_6_3_PROGRESS.md) · [Deployment contract](docs/TELEGRAM_MULTIPLAYER_TEST_PLAN.md) · [Физика Stage 6.1.6](docs/STAGE_6_1_6_REPORT.md).

UI: `v0.6.3 Doner Economy & Trap Shop`; root SemVer: `0.6.3`.

## Попробовать

Node 24 (>=24.11 <25), pnpm 10.34.6. В установленном проекте:

```bash
pnpm dev:web
```

Открыть URL Vite → **ТРЕНИРОВКА** → **ПЛАТФОРМА / FAN / CROSSBOW** → выбрать место касанием или стрелками, при необходимости повернуть → **ПОСТАВИТЬ** → **НАЧАТЬ ЗАБЕГ** → дойти до финиша → **СЛЕДУЮЩИЙ РАУНД**. Все ранее поставленные объекты остаются. **НОВЫЙ МАТЧ** сбрасывает карту; выход в меню/reload также завершает локальную сессию. Для тренировки API, Bot и Telegram-аккаунт не нужны.

На клавиатуре A/D или ←/→, W/↑/Space для прыжка, P/Escape для паузы. На телефоне отдельные кнопки. BUILD использует касание, точные стрелки и ползунок обзора карты. До12 бесплатных объектов/раундов; реальные Doner не начисляются и не списываются.

Для чистой установки: `pnpm install`, затем `pnpm db:generate`. Существующие заполненные `.env` сохраняются. Для online примените `pnpm db:deploy` **только к подготовленной локальной БД**, затем `pnpm dev:api`; бот — `pnpm dev:bot`. `pnpm dev` запускает все приложения; на одном bot token не запускайте второй polling-процесс. Production migration выполняется отдельно по инструкции после разрешённого deployment.

Для комнат нужен настоящий Telegram auth. Создатель выбирает capacity, делится кодом/ссылкой; друг подтверждает вход, оба выбирают любого героя и нажимают ГОТОВ. Host запускает матч. Бесплатный BLOCK, затем необязательный EXTRA BLOCK за1 либо завершение хода; FAN2/CROSSBOW3 сразу завершают ход. SKIP бесплатен; BUILD 60s, RACE 90s, до 5 раундов. Без Telegram доступна тренировка, fake-auth endpoint в production отсутствует.

Altoha, Aigerim, Temik и Ayazhan доступны в комнате и тренировке бесплатно, с одинаковой физикой. Можно выбрать одинаковых героев. Ayazhan — оригинальный временный пиксельный образ в сиренево-голубой одежде; способности TBD. В BUILD видны цвет/имя владельца движущегося preview и ✓/× допустимости. В RACE можно толкать друзей, стоять на голове и прыгать с неё.

## Архитектура

```text
apps/web/src/
  App.tsx, WinterScene.tsx          зимний Home и навигация
  CharacterSelect.tsx             выбор без покупки; browser training selection
  PlayerPanel.tsx                 Telegram identity/avatar, Doner, выбранный герой
  PartyScreen.tsx, party.css      create/join, lobby, invite, ready, reconnect
  multiplayer/connection.ts      typed Socket.IO client, snapshot store/session adapter
  multiplayer/prediction.ts      shared solver prediction и replay после server snapshots
  multiplayer/presentation.ts    timestamp buffer и ограниченная render correction
  multiplayer/diagnostics.ts     DEV RTT/jitter/error/rate, без credentials
  GameScreen.tsx                  BUILD/RACE/RESULTS UI, input и lifecycle
  game/localSession.ts            immutable состояние локального матча
  game/createGame.ts              Phaser, collisions, camera, phase presentation
  game/arenaPresentation.ts       визуальная сборка общей зимней карты
  game/trapVisuals.ts             оригинальные trap graphics, зоны и bounded projectile rendering
  game/textures.ts                оригинальные code-native pixel textures
  game/playerVisual.ts            replaceable sprite descriptor
  game/level.ts                   visual regions и существующие movement constants
  game/input.ts, lifecycle.ts     удержание кнопок, безопасный lazy mount/cleanup
packages/shared/src/
  arena.ts                       единая geometry/spawns/finish/placement areas
  party.ts                       contracts, placement validation, legacy proposals
  online.ts                      socket events, room snapshots, online rules, invite helper
  traps.ts                       типы, параметры, цены из economy.ts
  economy.ts                     цены/слоты, награды и победители
  trapSimulation.ts              fan forces, swept projectiles, hit/respawn lifecycle
  solvability.ts                 геометрическая проверка маршрута
  physics.ts                     fixed-step AABB solver и общая PLAYER_PHYSICS config
  characters.ts, index.ts         стабильные IDs, существующие account DTO
apps/api/src/multiplayer/        Socket.IO, RoomManager, store, race simulation, ephemeral previews
apps/api/                        существующие Fastify/auth/Prisma/PostgreSQL + additive rooms
apps/bot/                        существующие grammY /start /help /game
```

`selectedCharacterId` выбирает только героя. `SNOWY_CHAOS` и MatchSnapshot общие. Geometry, visual tiles, spawn, finish и placement areas разделены. Один Phaser engine работает с local session или server snapshot adapter. Online сервер считает физику 60 Hz, принимает input 20 Hz и рассылает snapshots 15 Hz; клиент использует prediction/reconciliation и remote interpolation. Training с ловушками использует тот же shared trap world; block-only Training сохраняет прежний Arcade path. Previews до 12 Hz, ephemeral и room-only, без DB writes. Подробности: [game design](docs/GAME_DESIGN.md), [multiplayer architecture](docs/MULTIPLAYER_ARCHITECTURE.md), [art direction](docs/ART_DIRECTION.md).

## Аккаунт и database safety

Сохранены Telegram initData HMAC → JWT → GET /me, Telegram user ID, имя/username/avatar, account connection/error/retry, selected character и balances. JWT остаётся только в памяти. initDataUnsafe не подтверждает личность. Старые startapp=solo не открывают удалённый Campaign.

User, PlayerProgress, UnlockedCharacter сохранены, включая campaignStage/goldenDoners и совместимый unlock endpoint. Additive migration `20261020000000_party_rooms` создаёт Room, RoomPlayer, MatchRound, TrapPlacement, RoundFinish. Старые migrations не менялись. Multiplayer пишет в существующий Doner через атомарный ledger; ownership не меняется; room character selection не вызывает profile purchase/select endpoints.

Stage 6.2 добавляет migration `20261021000000_trap_orientation`: `TrapPlacement.orientation TEXT NOT NULL DEFAULT 'none'`; старые blocks совместимы. Новых env variables нет. `ayazhan` валидируется shared catalog и хранится существующим строковым chosenCharacterId. Выбор для тренировки не требует ownership; legacy profile selection API вызывается только для уже открытых персонажей, сохранённые selections не сбрасываются.

Stage 6.3 добавляет `20261022000000_doner_economy`: ledger, два placement slots, round settlement/participation и очки. Старые раунды получают LEGACY, без наград задним числом. Проверен upgrade с заполненной старой тестовой БД. Новых runtime env нет.

## Environment

Создавайте локальные `.env` из `.env.example` только если файла ещё нет. **Не перезаписывайте заполненный `apps/bot/.env`.** Все `.env` исключены из Git; реальные ключи добавляются вручную. Bot и API читают свой файл относительно модуля, в том числе при запуске из `dist`. Уже заданные environment variables имеют приоритет над файлом.

| Где | Переменная | Значение |
| --- | --- | --- |
| `apps/bot/.env` | `BOT_TOKEN` | token существующего бота из BotFather |
| `apps/bot/.env` | `BOT_USERNAME` | username того же бота, без `@` |
| `apps/api/.env` | `DATABASE_URL` | URL локальной PostgreSQL, например `postgresql://USER:PASSWORD@localhost:5432/doner_game` (подставьте свои значения) |
| `apps/api/.env` | `BOT_TOKEN` | token **того же** бота, через которого открыт Mini App |
| `apps/api/.env` | `BOT_USERNAME` | публичное имя существующего бота без `@`, как в bot config; нужно для invite links; без него доступен вход по коду |
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

Production configuration и variables не менялись. Deploy/push/reset/production migrations не выполнялись; новые orientation/economy migrations проверены только на изолированной локальной тестовой БД. Перед запуском нового API нужен `pnpm db:deploy` в целевом окружении при отдельно разрешённом deployment.

| Сервис | Сохранённые параметры |
| --- | --- |
| Vercel web | Root monorepo; install `pnpm install --frozen-lockfile`; build `pnpm build:web`; output `apps/web/dist`; Node 24; `ENABLE_EXPERIMENTAL_COREPACK=1`; публичный `VITE_API_URL` |
| Railway API | Root monorepo; build `pnpm install --frozen-lockfile --prod=false && pnpm build:api`; start `pnpm start:api`; health `/health`; 1 replica |
| Railway environment | существующие variables сохраняются; добавить публичный BOT_USERNAME для invite links, если его ещё нет |
| Existing migration hook | `pnpm db:deploy` должен применить все migrations, включая trap_orientation и doner_economy, до запуска нового API |
| BotFather | Main Mini App URL остаётся HTTPS frontend; bot `/start` и `/game` используют startapp=home |

Для Telegram нужны HTTPS web/API и точный CORS origin. Socket.IO использует тот же API domain/PORT; нового realtime service нет. Нужен один активный API instance, включая обновления: нет distributed ownership/leader lease. Для обновления после 6.1 остановить прежний API до старта нового, с коротким обслуживанием и безопасным abort активной гонки. Подробнее в [deployment plan](docs/TELEGRAM_MULTIPLAYER_TEST_PLAN.md).

Ручной smoke на двух телефонах остаётся после отдельно разрешённого deployment. Multiplayer browser QA использует fixture Telegram SDK, **настоящие HTTP auth/JWT/Socket.IO/API/PostgreSQL** и 2–4 разных fixture users. Только training browser QA подменяет HTTP ответы. Пакетный протокол input 6.1.6 несовместим с frontend 6.1.5 и старше: обновить API/frontend согласованно и перезагрузить открытые Mini Apps.

## Проверки

```bash
pnpm typecheck
pnpm build
pnpm test
git diff --check
```

`pnpm test` без TEST_DATABASE_URL явно пропускает PostgreSQL integration. Полная проверка требует отдельной fixture БД с текущей схемой, именем `*_test` и TEST_DATABASE_URL. Production DATABASE_URL использовать для этих тестов нельзя. Build/typecheck запускайте последовательно: оба выполняют Prisma generate, но не migrations и не подключение к production.

Browser QA (Playwright Chromium):

```bash
VITE_API_URL=http://127.0.0.1:3013 pnpm --filter @doner-game/web dev --port 5185
pnpm --filter @doner-game/web test:browser
```

API на 3013 запускать не нужно: browser tests перехватывают запросы fixture-ответами. Если Chromium не установлен, `pnpm --filter @doner-game/web exec playwright install chromium`. При нестандартной папке браузеров задать PLAYWRIGHT_BROWSERS_PATH. Скриншоты: `artifacts/stage-6/`. Для production preview: собрать с fixture VITE_API_URL, поднять `preview --port 4185`, затем задать BROWSER_TEST_URL=http://127.0.0.1:4185 и BROWSER_TEST_PRODUCTION=1.

Real multiplayer QA (другой терминал):

```bash
# Задайте TEST_DATABASE_URL для отдельной локальной PostgreSQL с именем *_test.
# Не подставляйте production DATABASE_URL.
DATABASE_URL="$TEST_DATABASE_URL" pnpm db:deploy
TEST_DATABASE_URL="$TEST_DATABASE_URL" pnpm test
VITE_API_URL=http://127.0.0.1:3014 pnpm --filter @doner-game/web dev --port 5186
# Пока Vite работает:
TEST_DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter @doner-game/web test:party
TEST_DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter @doner-game/web test:economy
# Последовательно, после предыдущего сценария:
TEST_DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter @doner-game/web test:interactions
TEST_DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter @doner-game/web test:network
TEST_DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter @doner-game/web test:traps
pnpm --filter @doner-game/web test:training-traps
# Отдельные Socket.IO стенды без БД:
pnpm --filter @doner-game/api test:network-bench
pnpm --filter @doner-game/api test:traps-bench
```

Browser script запускает fixture API 3014 через IPC, создаёт пользователей и подписанные test initData, затем удаляет свои записи и останавливает API. Fixture требует loopback `*_test` DB, не загружает `.env`; production fake-auth route не создаётся. Не запускайте одновременно два RoomManager/API integration против одной test DB. `test:interactions` использует dev diagnostics: четыре contexts, 120ms added RTT у B, push/head contacts, live previews, реальный offline/reconnect в BUILD/RACE, четыре персонажа и NEXT; artifacts в `artifacts/stage-6.1.5/`. FPS headless Chromium не является замером телефона.

Для локальной проверки production frontend: `VITE_API_URL=http://127.0.0.1:3014 pnpm build`, `pnpm --filter @doner-game/web preview --port 4186`, затем `BROWSER_TEST_URL=http://127.0.0.1:4186 BROWSER_TEST_PRODUCTION=1 TEST_DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter @doner-game/web test:party`. Это локальный preview, не deployment. Screenshots — `artifacts/stage-6.1/`.

В DEV `?netdebug=1` включает небольшой числовой overlay RTT/jitter/tick/snapshot rate/prediction error/corrections/stale/gaps/FPS; в production overlay и диагностический ping не создаются. `test:network` проверяет два Chromium contexts с 40/80/150ms RTT, jitter и delayed/lost snapshots, artifacts — `artifacts/stage-6.1.6/`. Протокол/метрики/ручная проверка описаны в [отчёте Stage 6.1.6](docs/STAGE_6_1_6_REPORT.md).

## Архив старого прототипа

Перед очисткой сохранены 136 файлов и git diff/status:

`/Users/altoha/Desktop/doner-game-archives/stage-5.6-before-party-reboot-2026-10-19/stage-5.6.tar.gz`

Рядом SHA256.json (каждый файл проверен чтением из архива), working-tree.patch и git-status.txt. Архив включает source/work/public assets, tools, старые screenshots, frontend/shared код и документацию. `.env` не включались и не менялись. До удаления файлы повторно сверены с hashes. Не использовался git clean.

Из активного дерева удалены старые asset-source/asset-work/game-assets, pack processing tools, manifests/world themes/previews, CampaignScreen/campaign/launch и устаревшие тесты/документы. Движение, input и Phaser cleanup сохранены и адаптированы. Sharp больше не нужен и удалён из root dependencies.

## Ограничения

Один активный API instance; online physics — небольшой authoritative AABB solver, без rollback/lag compensation. Replay ограничен 24 шагами, remote intent prediction — 12, server catch-up — 6. При неожиданном прыжке нижнего игрока наблюдалась одиночная коррекция верхнего 16–26px при RTT80–150ms; обычные толкания и head-standing улучшены. Полного устранения всех snaps при задержке нет. После 300ms без input тело не блокирует друзей. Нет распределённого room ownership, load tests, abilities и развитой защиты от сговора. Геометрический route guard отсекает сплошные непроходимые стены, но не доказывает временную проходимость комбинаций ловушек; RACE timeout остаётся. Боковой FAN при смене неизвестного remote input дал единичную raw correction до12.11px на RTT150ms; p95=0 в стенде. Спрайты временные. Phaser lazy chunk превышает предупреждение Vite 500 kB.

Реальные телефоны/Telegram accounts ещё требуют ручной проверки. Stage 6.3: economy browser artifacts в `artifacts/stage-6.3/`; результаты и точные команды — в отчёте. Browser fixture не заменяет два настоящих телефона.
