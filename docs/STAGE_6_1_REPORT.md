# DONER GAME — Stage 6.1 report

2026-10-20 · **v0.6.1 Real Multiplayer Prototype**

Реализация технически готова для ручного тестирования на двух телефонах. Два независимых браузерных пользователя через настоящий API/Socket.IO/PostgreSQL прошли общий BUILD → RACE → одинаковые RESULTS → NEXT → второй раунд с сохранёнными блоками. Ручная приёмка на настоящих Telegram accounts/devices **ещё не выполнена**. Production не публиковался.

## 1. Что было готово до возобновления

В рабочем дереве сохранились Socket.IO server/client, shared contracts, JWT auth, RoomManager/store/movement validators, пять Prisma models и additive migration, PartyScreen с lobby/invites, online adapter общего Phaser engine, integration/browser tests. Изменения сохранены, реализация с нуля не начиналась.

Логи прерванной сессии подтвердили 19 multiplayer browser checks, 31 training browser checks, typecheck/build PASS. API integration до последних небольших изменений уже проходил; окончательный полный run ещё требовал проверки.

## 2. Что оставалось незавершённым

README и design/architecture documents описывали только Stage 6.0 и будущие rooms. Не было карты прогресса, итогового отчёта и manual deployment/test plan. Оставались fixture debug logging, устаревший failure screenshot, неподтверждённая финальная проверка host migration и нового порядка finish commit. Production frontend multiplayer QA не был зафиксирован.

## 3. Найденные ошибки

- Подписи игроков перекрывались при близких стартовых позициях.
- В Socket.IO client было перечисление websocket/polling, но отсутствовал `tryAllTransports`, необходимый для явного fallback при отказе первого transport.
- `skipDuplicates` при сохранении всех placements мог молча пропустить commandId, уже использованный в другой комнате: snapshot содержал бы несохранённый блок.
- HOW TO всё ещё говорил, что комнаты появятся позже; завершённый online матч назывался тренировкой.
- Проверка duplicate placement зависела от того, какой клиент победит в конкурентном запросе.

Предыдущая часть реализации уже исправила отклонение легального landing + buffered jump между 15 Hz packets; это исправление подтверждено unit/integration/browser тестами при возобновлении.

## 4. Что доделано

Имена близких игроков разнесены по высоте; dev diagnostics позволяют проверить фактическое движение remote sprite. Включён polling fallback. Сохранение новых placements теперь не подавляет конфликт чужого commandId: транзакция откатывается, snapshot не публикует фантомный блок. Добавлен regression test; проверка duplicate placement теперь работает при любом победителе гонки запросов.

Browser QA расширен native multi-touch с проверкой движения на втором клиенте, touchCancel, Telegram BackButton, локальной production-сборкой. Удалён временный fixture debug. Обновлены подсказки, финальный экран, документация; подготовлены deployment и two-phone steps. Stage 6.2 не начинался.

## 5. Файлы и зависимости

| Область | Создано / изменено |
| --- | --- |
| Shared | новый `packages/shared/src/online.ts`; exports в `index.ts`; параметр online placement limit в `party.ts` |
| Backend | новые `apps/api/src/multiplayer/{socket,manager,store,movement,validation}.ts`; подключение в `src/index.ts`; optional BOT_USERNAME в `src/config.ts` и `.env.example` |
| Database | `apps/api/prisma/schema.prisma`; новая `migrations/20261020000000_party_rooms/migration.sql` |
| Frontend | новые `PartyScreen.tsx`, `party.css`, `multiplayer/connection.ts`; изменения `App.tsx`, `GameScreen.tsx`, `api.ts`, `usePlayerAuth.ts`, `telegram.ts`, `game/createGame.ts`, `game/textures.ts` |
| Bot | `apps/bot/src/deep-link.ts` использует общий Main Mini App helper; добавлена workspace shared dependency |
| Tests | новые `apps/api/test/{multiplayer.test,movement.test,browser-server}.ts`, `apps/web/test/browser/party.mjs`; обновлён `game.mjs` |
| Build/dependencies | root/API/web/bot package.json и pnpm-lock.yaml; root version 0.6.1; `dev:bot` сначала собирает shared |
| Docs | README, GAME_DESIGN, MULTIPLAYER_ARCHITECTURE, ART_DIRECTION; новые STAGE_6_1_PROGRESS, этот report, TELEGRAM_MULTIPLAYER_TEST_PLAN |

Добавлены `socket.io@4.8.3` в API, `socket.io-client@4.8.3` в web и API devDependencies. Backend/client versions совпадают. Существующие React/Phaser/Fastify/Prisma/PostgreSQL/grammY сохранены. Stage 6.0 report остаётся историческим документом.

## 6. Комнаты, transport, авторизация, приглашения

Socket.IO подключён к существующему Fastify `app.server`, без отдельного сервиса/порта. Frontend использует прежний VITE_API_URL. JWT передаётся в handshake auth payload, остаётся в памяти; signature/issuer/audience/exp/sub/User проверяются сервером. Имена/avatars приходят из DB profile. Payload не может назначить userId/telegramId/name. Origin, размер сообщений и rate limits проверяются отдельно.

CREATE задаёт capacity 2–4, default 4. Host — создатель. Code — шесть cryptographically random символов, unique DB index; TTL 2h. Один пользователь занимает одно активное место. JOIN проверяет существование/capacity/phase; повторный JOIN сохраняет seat. Все три героя бесплатны **в комнате**, без изменения account ownership/selected character.

Invite использует общий с ботом helper `https://t.me/<существующий BOT_USERNAME>?startapp=room_<CODE>`. Main Mini App формат соответствует [Telegram docs](https://core.telegram.org/bots/webapps#launching-the-main-mini-app). Room hint не авторизует пользователя: сначала auth, затем явное подтверждение JOIN. Есть copy code/link/share; при отсутствии clipboard выводится поле для ручного копирования. Если API BOT_USERNAME не задан, остаётся вход по коду.

Lobby показывает реальные server players, имя/avatar/character/host/presence/ready. START разрешён host при ≥2 игроках и connected+ready у всех.

## 7. Совместный BUILD

Один бесплатный 32×16 блок либо SKIP на игрока/раунд. Server checks: membership, phase, round, expectedRevision, commandId, free slot, finite/grid/bounds/protected areas/overlaps/max20. State mutations сериализованы, transaction commit предшествует публикации. Повтор того же placement не добавляет блок, конфликтующие запросы не создают overlap.

Preview не становится коллизией до authoritative snapshot. Все получают одинаковые placements. BUILD заканчивается после всех ходов или 60s. NEXT сохраняет блоки.

## 8. Совместный RACE и фазы

Серверная последовательность: LOBBY → BUILD → RACE → RESULTS → BUILD, после пятого раунда MATCH_FINISHED. RACE начинается сразу после завершения BUILD; spawn определяется seat. Все используют одну SNOWY_CHAOS geometry и placements.

На 90s deadline незавершившие получают DNF; если все закончили раньше, RESULTS появляются сразу. Pause останавливает управление только своего клиента. Матч друзей и server deadline продолжаются.

## 9. Remote players

Один существующий Phaser renderer/physics/input для training и online. Примерно 15 Hz coordinates/velocity packets, sequence и round; remote sprites интерполируются. Они непрозрачные, без player-player collisions, с поддержкой кириллицы в именах. Native touch A подтверждён наблюдаемым движением его remote sprite на B.

Movement хранится в памяти, не записывается в PostgreSQL каждый кадр. Volatile packets допустимы, следующие snapshots обновляют позиции. В основе fallback и ack/reconnect стратегии — [Socket.IO client options](https://socket.io/docs/v4/client-options/#tryalltransports) и [delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/).

## 10. Финиш и граница authority

Сервер проверяет bounds, speed/displacement, accumulated path, stale sequence, swept collisions, высоту/длительность прыжка и reachable landing. Только принятое пересечение body/finish создаёт FINISHED. Rank — порядок серверной обработки, time — серверное время от старта. Клиент не присылает finish position/rank/time.

Unique result keys и сериализация защищают от повторного финиша/ранга. Snapshot публикуется после commit. Все видят одинаковые RESULTS; NEXT — только host. Doner/Golden Doner/permanent points не начисляются и не списываются.

Server-authoritative: identity, membership/host, ready/character-in-room, phases/deadlines, placements, results/rank. Client-side: Arcade physics, input, camera, animation, interpolation, preview. **Полной server-authoritative physics и полного античита нет.** Правдоподобный искусственный путь может пройти проверки; задержка влияет на rank, latency compensation отсутствует.

## 11. Reconnect и restart

При реальной потере socket UI блокирует input, показывает reconnect. После восстановления выдаются full room/map/phase/results snapshot и accepted movement, тот же seat/sequence. Refresh повторяет auth и RESUME. SessionStorage содержит только публичный code. Новое окно того же аккаунта отключает старое.

При disconnect снимается READY; seat сохраняется. Через 30s отсутствия host переходит подключённому участнику, при LEAVE — сразу. Вышедший во время RACE получает DNF.

После restart сохранённый BUILD/deadline восстанавливается. Незавершённый RACE становится RESULTS: ранее принятые финиши сохраняются, остальные ABORTED, blocks остаются. Host может NEXT. Это проверено закрытием и созданием нового настоящего Fastify/Socket.IO server поверх той же тестовой БД.

## 12. Prisma migration и данные

Одна additive migration: `20261020000000_party_rooms`. Созданы **пять** models: Room, RoomPlayer, MatchRound, TrapPlacement, RoundFinish. Room одновременно служит match, matchId=roomId.

Новые constraints: unique room code, room/user membership, nullable unique activeUserId, one placement per room/round/user, one result per room/round/user и unique rank. User получает только Prisma relation; прежние User/PlayerProgress/UnlockedCharacter columns и две старые migrations сохранены.

Migration применена только к новой локальной `doner_stage61_test` на loopback PostgreSQL port 55436. `migrate reset`, production migration и сброс данных не выполнялись. Multiplayer store не меняет PlayerProgress; интеграция подтверждает сохранение Doner 42/Golden 3 и прежней ownership после матчей.

## 13. Успешные тесты

| Проверка | Результат |
| --- | --- |
| API unit/integration, реальная test PostgreSQL | 46 PASS |
| Web unit tests | 29 PASS |
| Bot tests | 15 PASS |
| Итого `pnpm test` | **90 PASS, 0 FAIL, 0 SKIP** |
| Multiplayer Chromium development | **20 checks PASS** |
| Multiplayer Chromium production preview | **20 checks PASS** |
| Training Chromium development | **31 checks PASS** |
| Training Chromium production preview | **28 checks PASS** |

Integration покрывает JWT errors/expired/nonexistent User, create/join/capacity/readiness/host, свободный room character без account mutation, spoofed payload, конкурирующие/повторные placements, общий snapshot, teleport rejection/movement fanout, два валидных финиша/порядок/no duplicates, NEXT, real disconnect/reconnect/host transfer, API restart/persistence/ABORTED, phase timeout/DNF, cross-room commandId rollback, неизменные balances, `/health`/`me`.

Browser scenario — два Chromium contexts и разных fixture users, настоящий HTTP auth/JWT/API/Socket.IO/PostgreSQL; подменён только Telegram SDK. Нет production fake-auth routes. Проверены lobby/ready, 2 → 4 blocks за два полных раунда, одинаковые RESULTS, real offline/reconnect+refresh, names/remote rendering, touch/cancel, BackButton и cleanup. На 320/375/390/430/500px проверены overflow и tap targets. В production недоступны dev-only coordinate diagnostics, поэтому они проверены отдельно в dev.

Training browser suite использует свои HTTP fixtures; проверяет local loop, physics/input/cleanup и прежний profile flow. Полные команды — в README. API integration и browser fixture нельзя запускать одновременно против одной test DB.

Локальные gitignored screenshots: [lobby 320](../artifacts/stage-6.1/lobby-320.png), [BUILD](../artifacts/stage-6.1/build-390.png), [два игрока](../artifacts/stage-6.1/two-players.png), [общие результаты](../artifacts/stage-6.1/results.png), [второй раунд](../artifacts/stage-6.1/round-two.png), [production results](../artifacts/stage-6.1/production/results.png).

## 14. Финальные команды

`pnpm typecheck` — PASS. `pnpm build` — PASS; единственное предупреждение — лениво загружаемый Phaser chunk >500 kB (~1.39 MB / ~362 kB gzip). Оно не блокирует build.

`TEST_DATABASE_URL=<изолированная локальная БД> pnpm test` — 90 PASS. `git diff --check` — PASS. Build/typecheck выполняют Prisma generate, не production migrations. Production preview был локальным, с fixture API URL только в окружении команды; `.env` не переписан.

## 15. Оставшиеся ограничения

- Настоящие Telegram invite navigation/share/WebView/network/safe-area особенности ещё проверить на двух физических телефонах. Автоматические fixtures не подтверждают эту часть приёмки.
- Основной browser match проверен для двух игроков. Capacity до четырёх реализована, но четыре физических устройства ещё не проверялись.
- Один активный API instance. Общая state queue, in-memory movement/rate limits; нет distributed ownership/lease/Redis adapter и load testing.
- Сервер проверяет правдоподобность движения, не симулирует его полностью. Нет rank latency compensation. При плохой связи возможны corrections.
- Комбинация блоков может сделать трассу непроходимой; есть timeout/DNF, нет global path validator.
- Clock UI использует часы клиента; phase deadline применяет сервер. Completed room rows не очищаются автоматически.
- Временные sprites, нет abilities/shop/rewards/score settlement. Stage 6.2 не начинался; следующий функционал требует отдельного задания и усиления серверных гарантий перед экономикой.

## 16. Что нужно для production deployment

Проверить diff/backup, затем отдельно разрешённый commit/push. Сначала Railway API build + additive migration **до старта новой версии**, затем проверка REST/socket и только потом Vercel frontend. Сохранить прежние domains/PORT/VITE_API_URL/CORS/secrets. Единственное дополнение конфигурации — публичный **BOT_USERNAME в API** для invite links, тот же, что у существующего бота.

Не допускать два активных RoomManager при rollout; после 6.1 обновления требуют остановки старого instance перед новым. Пошаговый порядок, hook и проверка proxy описаны в [deployment plan](TELEGRAM_MULTIPLAYER_TEST_PLAN.md).

## 17. Как проверить с другом через Telegram

A создаёт room на 2 места → отправляет invite → B открывает и подтверждает JOIN → оба выбирают героя и READY → host START → каждый ставит блок → оба видят два блока и друг друга в RACE → финишируют → сравнивают RESULTS → NEXT → добавляют ещё два блока и проходят второй раунд.

Затем отключить сеть на B, восстановить до deadline, проверить тот же seat/map/phase без копии игрока; повторить refresh и сверить balances. Полная таблица ожидаемых результатов, тест host migration/DNF и дополнительных устройств — в [two-phone test plan](TELEGRAM_MULTIPLAYER_TEST_PLAN.md#два-реальных-телефона--два-аккаунта).

Production не изменён; commit/push/deploy/production migration не выполнялись. Техническая реализация и локальная автоматическая проверка завершены; ручная Telegram приёмка остаётся пользователю после разрешённой публикации.
