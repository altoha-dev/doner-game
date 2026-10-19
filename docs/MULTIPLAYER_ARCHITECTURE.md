# Multiplayer architecture — предложение для Stage 6.1+

Stage 6.0 не содержит WebSocket server, сетевых rooms, наград или новых Prisma моделей. Это план границы ответственности, а не описание уже работающего multiplayer.

## Текущая граница

`packages/shared/src/party.ts` определяет MatchPhase, ArenaDefinition, TrapPlacement, MatchSnapshot, RoundResult, ArenaCommand, ArenaSession, RoomPlayer/RoomSnapshot, RaceInput/RaceSnapshot, PlacementRequest и будущий ability descriptor. `arena.ts` содержит общую геометрию SNOWY CHAOS с revision. Нельзя выбирать арену по selectedCharacterId.

`GameScreen` связывает UI и `ArenaSession` через useSyncExternalStore. `createLocalSession` — единственная локальная authority: валидирует команды, публикует immutable snapshots, сохраняет placements между раундами. `createGame` получает snapshot и поддерживает applySnapshot, setBuildView, setPaused; создаёт физические объекты и выдаёт локальное событие finish. React не хранит дубликат массива платформ. Physics/lifecycle/input отделены от session.

Для сети нужен новый session adapter и расширение renderer для remote players и reconciliation. Текущий render adapter умеет добавлять блоки одного локального матча; online adapter должен добавить удаление/полную замену при reconnect или новом match ID. Это запланированное расширение, не уже реализованная синхронизация. Сохранятся сцена, исходная геометрия, ввод, коллизии, tile renderer и lifecycle.

**FINISH_LOCAL нельзя принимать по сети.** Времена, координаты и finish клиента не являются основанием rewards. Локальная пауза также не должна останавливать сетевой матч.

## Комнаты, identity и соединение

- Внутренний Room ID — UUID; короткий room code служит поиском и приглашением, не авторизацией. Нужны уникальность, TTL, лимиты попыток и максимум 4 участника.
- Telegram initData → существующий HTTP auth → JWT → серверный User ID. Identity берётся только из проверенного токена; не из room payload, username или initDataUnsafe.
- Будущий Mini App deep link передаёт непривилегированный room token/start parameter. Точный формат и поведение повторного приглашения согласовать перед реализацией. Текущий startapp=home остаётся рабочим; старые solo-параметры не открывают Campaign.
- WebSocket аутентифицируется короткоживущим одноразовым ticket, полученным по защищённому HTTP endpoint. Не помещать долгоживущий JWT в URL/логи. Проверять origin, истечение ticket, membership, размер и форму сообщений, rate limit.
- Presence: connected / reconnecting / disconnected; heartbeat, last seen, явный выход. Ready привязан к игроку и текущему lobby revision; сервер начинает матч, когда выполнены условия комнаты.

## Сервер владеет фазами и картой

LOBBY → BUILD → RACE → RESULTS → BUILD или MATCH_FINISHED. Сервер хранит phase/round/deadline, выбирает одну arena revision на матч и сериализует изменения одной комнаты. Клиенты только показывают authoritative snapshot.

PlacementRequest несёт commandId, matchId, round, expectedRevision, catalogId, position. Сервер проверяет phase, membership, идентичность карты, grid/bounds/protected zones/overlaps, количество бесплатных объектов, владение дополнительным объектом, лимит матча. Повтор commandId возвращает прежний результат. Два одновременных placement в одном месте: одно принятие, другому явный отказ и свежая revision. UI не превращает preview в коллизию до ack.

Успешный placement добавляется в единый snapshot комнаты, остаётся в следующих раундах и рассылается всем. Новый матч получает новый ID и пустую изменяемую часть карты. Базовая геометрия не изменяется purchases/character selection.

## Забег и мобильная задержка

Предпочтение для MVP — серверная симуляция с фиксированным timestep и обработкой input, а не доверие клиентским координатам. Предварительные значения 30 ticks/s и snapshots 10–20/s требуют измерений на телефонах; это не гарантии производительности. Извлечь/реализовать совместимую headless physics и проверить одинаковые units, body dimensions, collision ordering и movement constants до запуска ranked rewards. Phaser остаётся renderer и локальной prediction.

RaceInput: sequence, clientTick, direction -1/0/1, jumpPressed. Сервер ограничивает частоту/диапазоны, отбрасывает повторы и слишком старые/будущие inputs; не принимает ускорение или скорость произвольного клиента. RaceSnapshot: serverTick, player positions/velocities, acknowledged input sequence, finishOrder. Для своего игрока — prediction + reconciliation; для остальных — interpolation с небольшим буфером. Не выполнять тяжёлый rollback на каждом кадре телефона.

Финиш и порядок определяет сервер по пересечению finish в авторитетной симуляции. Clock sync/latency используются для отображения и bounded input buffering, а не права клиента выбирать время финиша. Ничья внутри tick, round timeout, DNF, background/throttling, disconnect и компенсация задержки — открытые решения. Проверки невозможной скорости, прыжка и телепортации дополняют server ownership, не заменяют его.

## Reconnection и устойчивость

Reconnect с новой аутентификацией, room ID, match ID и последней revision. Сервер выдаёт полный snapshot: карта + placements + phase + deadline + scores + race state. Старые client commands не проигрываются автоматически. Нужны grace period, seat reservation, policy для второго устройства/вкладки и истёкшей комнаты. При потерянном connection UI очищает удерживаемые кнопки, показывает состояние и не начисляет локальные финиши.

Один room actor/последовательная очередь на комнату в первой версии; стратегия распределения rooms между процессами определяется перед горизонтальным масштабированием. Состояние в памяти нуждается в recovery strategy; завершённые результаты и экономика хранятся транзакционно. Выбор hosted transport/брокера не зафиксирован.

## Settlement и fair play

Сервер рассчитывает результаты после закрытия раунда. Одна транзакция сохраняет результат, ledger и изменение PlayerProgress. Уникальный settlement key (match, round, player, reward kind) предотвращает повторное начисление после retry/reconnect. Баланс не приходит от клиента. Покупка ловушки: проверка цены/баланса/phase → debit ledger → entitlement; расход entitlement при placement также идемпотентен.

Локальные training match IDs не допускаются к settlement. Нужно решить минимальный состав матча, DNF/disconnect, tie breaks, anti-farm лимиты и eligibility до включения реальных Doner. Базовый объект бесплатен; дополнительные объекты ограничены и не должны закрывать start/finish. Глобальная проходимость и баланс трёх MVP ловушек требуют отдельной проверки.

## Предложение данных — без миграций

| Сущность | Назначение и предполагаемые ключи |
| --- | --- |
| Room | UUID, unique code, ownerUserId, status, expiresAt |
| RoomPlayer | roomId + userId unique, characterId, ready, presence, joinedAt |
| Match | roomId, arenaId/revision, rulesVersion, status, startedAt, finishedAt |
| MatchRound | matchId + roundNumber unique, phase, deadlines, simulation seed/version |
| TrapCatalogItem | stable ID, type, price, dimensions, limits, enabled, version |
| TrapPlacement | matchId, originatingRound, ownerUserId, catalogVersion, grid x/y, commandId unique |
| MatchResult | match/round/user unique, server finish rank/time, status, points, settlement status |
| DonerTransaction | userId, signed amount, kind, settlement/purchase key unique, match/round refs, timestamp |

User, PlayerProgress, UnlockedCharacter и существующие migrations сохраняются. Не удалять старый campaignStage или переписывать Telegram IDs ради новой концепции. Новые связи/индексы и их additive migration проектируются только перед реализацией хранилища; никаких schema changes Stage 6.0.

## Stage 6.1: следующий небольшой вертикальный срез

1. Утвердить room lifecycle, DNF/ties/disconnect, race authority и local-to-network transport contract.
2. Реализовать auth connection, создание/join комнаты, invite, presence и ready для 2–4 реальных Telegram пользователей.
3. Передавать одну arena revision и общий BUILD с server validation + command idempotency.
4. Синхронизировать RACE, других игроков и finish, добавить reconnect и измерить mobile latency.
5. Показывать одинаковый следующий раунд с сохранёнными блоками. Реальную экономику включать отдельным шагом после корректного settlement и anti-farm правил.

Stage 6.1 и production deployment в текущей работе не выполнялись.
