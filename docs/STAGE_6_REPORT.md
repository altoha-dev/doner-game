# Stage 6.0 — итоговый отчёт

Дата: 2026-10-19. Версия: **v0.6 Party Reboot Prototype**. Реализован локальный party platformer reboot. Production deployment, GitHub push и Stage 6.1 не выполнялись.

## 1. Удалено

Из активного дерева удалены `asset-source/`, `asset-work/`, `apps/web/public/game-assets/`, `tools/assets/`, `game/assets/`, старые worldPresentation/worldLayout, worldThemes, game/launch, CampaignScreen, campaign, DonerMark. Убраны старые browser profile scripts, asset/campaign tests и ASSET_CATALOG/ASSET_LICENSES/ASSET_PROCESSING/REAL_ASSET_USAGE. Удалены прежние asset scripts и Sharp dependency. README и art direction заменены актуальной концепцией. Старые routes не активируются startapp=solo.

## 2. Резервная копия

`/Users/altoha/Desktop/doner-game-archives/stage-5.6-before-party-reboot-2026-10-19/stage-5.6.tar.gz`

136 файлов; исходные packs, рабочие материалы, runtime outputs, scripts, screenshots, frontend/shared код и документы. Рядом `SHA256.json`, `git-status.txt`, `working-tree.patch`. Все архивные файлы проверены чтением из tar по SHA-256; файлы для удаления повторно сверены перед удалением. Финальная повторная проверка архива прошла. `.env` не включались и не менялись. Незакоммиченный предыдущий прототип сохранён. `git clean` не использовался.

## 3. Сохранено

pnpm monorepo, React, Phaser, TypeScript, Fastify, Prisma, PostgreSQL, grammY bot, Telegram initData/JWT/user identity и GET /me. Прежние balances, ownership/selection и stable character IDs. API/bot code, migrations и production environment/hosting contract не менялись. Input aggregation, jump buffering/coyote time, movement constants, camera, bounds, touch controls и asynchronous Phaser lifecycle адаптированы к фазам.

## 4. Создано

- `apps/web/src/WinterScene.tsx` — оригинальная зимняя SVG-сцена Home.
- `apps/web/src/game/arenaPresentation.ts` — визуальная сборка арены.
- `apps/web/src/game/localSession.ts` — локальная authority, immutable snapshots.
- `packages/shared/src/arena.ts` — общая версионированная карта.
- `packages/shared/src/party.ts` — domain types, placement validator, будущие scoring rules/contracts.
- `apps/web/test/arena.test.ts` — проверки размещения, фаз, persistence, лимитов и сброса.
- `docs/GAME_DESIGN.md`, `docs/MULTIPLAYER_ARCHITECTURE.md`, этот отчёт.
- `artifacts/stage-6/` — фактические browser screenshots и QA logs (gitignored).

## 5. Изменено

App, CharacterSelect, GameScreen, PlayerPanel, PixelArt, tokens/styles/game.css, telegram theme colors; game/createGame, level, textures, существующий playerVisual adapter; shared index/characters; game/telegram/browser tests; README, ART_DIRECTION, root package.json и .gitignore. Lockfile пересчитан без Sharp и соответствует текущим зависимостям. В сравнении с HEAD он вернулся к прежнему составу зависимостей, поэтому может не отображаться в git diff.

## 6. Навигация

Home → Играть с друзьями / Создать комнату / Войти по коду → честный Stage 6.1 coming soon. Home → Тренировка → локальная арена. Персонажи, профиль, как играть и настройки открываются отдельными экранами. BackButton и обычный Back возвращают Home. Нет Campaign и character-specific worlds. Выбор существующего открытого персонажа сохраняется сервером; browser selection действует только локально. Покупки персонажей из UI убраны.

## 7. Home

Тёмное зимнее небо, крупная тёплая вывеска, WINTER PARTY EDITION, оригинальная снежная закусочная, фонари/ёлки/три героя. Оранжевая основная кнопка, холодная кнопка тренировки, пиксельные рамки. Профиль показывает серверные имя/username/avatar, Doner/Golden Doner и героя. Reduced motion учитывает OS и настройку интерфейса.

## 8. BUILD

Один бесплатный блок 32×16 за раунд. Выбор → grid preview → касание карты или стрелки → подтверждение → старт забега. Ползунок двигает камеру. Сетка 16, текст и цвет valid/invalid, отмена неподтверждённого preview. Блокируются overlap с геометрией/старыми блоками, nonfinite/off-grid/outside positions и защищённые start/finish. 12 блоков максимум.

## 9. RACE

Игрок появляется на старте; бег/прыжок/camera follow; построенный блок получает реальный static collider. Finish проверяет пересечение физического тела с финишной областью. RESULTS показывает время активной локальной симуляции, без аккаунтных rewards. Пауза/blur очищают input и останавливают локальную physics. BUILD и RACE controls не работают одновременно.

## 10. Persistence

Placements принадлежат MatchSnapshot в session, а не React UI или временному Phaser объекту. Следующий раунд меняет phase/round и сбрасывает героя, сохраняя массив. Проверены три последовательных финиша с 1/2/3 блоками. Новый матч создаёт новый session ID и пустой массив, старый Phaser уничтожается. Выход в меню и reload также завершают локальный матч; сохранения в БД/localStorage нет.

## 11. Arena architecture

Одна SNOWY_CHAOS для всех персонажей. Shared definition разделяет geometry, spawns, finish, placement/protected areas; web отдельно задаёт materials/tiles/decor. `selectedCharacterId` влияет только на PlayerVisual. Runtime boundary applySnapshot/setBuildView/setPaused отделяет rendering от local authority. Sprite sheets впоследствии заменяются через descriptor; текущее тело движения одинаковое для всех.

## 12. Multiplayer contracts

MatchPhase: LOBBY, BUILD, RACE, RESULTS, MATCH_FINISHED; ArenaSession, MatchSnapshot, TrapPlacement, RoomPlayer/RoomSnapshot, RaceInput/RaceSnapshot, PlacementRequest, CharacterAbilityDefinition. Scoring proposal: Doner 0/1/2/3 и points 3/2/1/0 по местам 1/2/3/4+. DNF/ties/disconnect не решены. План описывает identity, room code/deep link, ready/presence, server phases, validation, input sequence, finish authority, ledger settlement, reconnect и latency. FINISH_LOCAL никогда не должен приниматься online-сервером. Полного remote renderer/reconciliation пока нет.

## 13. Database

**Production database и Prisma schema не изменены. Новых миграций нет, Prisma migrate/reset не запускались.** User, PlayerProgress, UnlockedCharacter и прежние migration files сохранены. Интеграционные тесты выполнены в отдельном временном PostgreSQL на localhost:55436, БД `doner_stage6_test`. Для неё создана fixture текущей схемы; production DATABASE_URL не использовался. Тестовый экземпляр остановлен после QA.

## 14. Проверки

- `pnpm typecheck` — PASS.
- `pnpm build` — PASS; сохранено предупреждение о большом lazy Phaser chunk (~1.38 MB / 361 kB gzip).
- `TEST_DATABASE_URL=<isolated test database> pnpm test` — **75 PASS, 0 skipped**: bot 15, web 29, API 31.
- `git diff --check` — PASS.
- Chromium dev — **31 PASS**; production preview — **28 PASS**.
- Ширины Home/BUILD/RACE: 320, 375, 390, 430, 500; нет горизонтального overflow, targets ≥44px, canvas ×2. Проверены desktop, safe areas и reduced motion.
- Проверены navigation/old route absence, auth + GET /me identity, 42/3 fixture balances, server character selection/reload, no unlock/reward/purchase requests, no account requests in browser training.
- Placement finger tap, snapping, spawn/terrain overlap rejection/cancel, реальное приземление на блок, движение/прыжок/пауза, native multitouch/cancel, finish, три раунда, новый матч, BackButton/swipes restore, lazy-load cancellation и canvas/input cleanup.

Browser QA использует synthetic Telegram SDK/API. API tests отдельно используют реальные HMAC/JWT/Fastify/Prisma и временную PostgreSQL. Реальный Telegram на физических устройствах в этой работе не проверялся.

## 15. Скриншоты

Все снимки получены из работающего Chromium/Phaser; это не дизайн-макеты.

- [Home 390px](../artifacts/stage-6/home-390.png)
- [Home с synthetic Telegram identity](../artifacts/stage-6/home-telegram.png)
- [Desktop Home](../artifacts/stage-6/home-desktop.png)
- [BUILD preview](../artifacts/stage-6/build-390.png)
- [RACE 320px](../artifacts/stage-6/race-320.png)
- [Приземление на новый блок](../artifacts/stage-6/placed-block-collision.png)
- [RESULTS](../artifacts/stage-6/results.png)
- [Второй раунд, старый блок](../artifacts/stage-6/round-2-persistent.png)
- [Третий раунд, два старых блока](../artifacts/stage-6/round-3-persistent.png)

В папке также Home/BUILD/RACE для всех пяти ширин. QA logs сохранены рядом. Artifacts исключены из Git, их нужно отдельно приложить к review при необходимости.

## 16. Stage 6.1

Утвердить нерешённые round/reward правила; реализовать аутентифицированные комнаты, invite, presence/ready и WebSocket adapter; общие authoritative BUILD/RACE, remote players, проверенный finish, reconnect и mobile latency. Новые Room/RoomPlayer/Match/MatchRound/TrapCatalogItem/TrapPlacement/MatchResult/DonerTransaction пока только предложены. Экономика требует server settlement/anti-farm, а не переноса локального FINISH_LOCAL.

## 17. Ограничения

Один локальный игрок; временные спрайты; нет abilities, магазина, rewards, сети, врагов, death/respawn и долговременного сохранения. Защита start/finish и пересечений не доказывает проходимость произвольной комбинации блоков: при неудачной трассе выйти в меню и начать новый матч. Лимит 12 раундов — временное ограничение локального прототипа, не утверждённый online баланс. Нет реальных телефонных latency/FPS измерений. Lazy Phaser chunk остаётся крупным. Stage 6.1 не начат; production не опубликован.
