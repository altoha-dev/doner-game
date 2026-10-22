# Stage 6.2 — v0.6.2 Chaos Building Prototype

Продолжение работы от commit `9448612`, проверено 2026-10-22. Production, реальные `.env`, Doner/PlayerProgress не менялись. Git push, Railway/Vercel deployment, production migrations и Stage 6.3 не выполнялись.

## 1. Состояние до продолжения и что завершено

К началу continuation уже существовали shared catalog, три типа placement, FAN forces, authoritative CROSSBOW/HIT/respawn, SQL orientation, live previews, BUILD picker и Training. Backend integration и первые browser проверки были запущены. Код сохранён; сетевой solver Stage 6.1.6 не переписывался.

Завершены двухклиентные browser проверки ловушек при RTT 40/80/150 ms, production preview, Training с ловушками, старые regression suites и итоговые проверки. Уточнены: отображение имени/статуса построенной ловушки, доступность picker, остановка визуального снаряда/линии у solid, использование `maxWind` из каталога. Версия UI/root — 0.6.2. Обновлены README, game design, multiplayer architecture, art direction и progress.

Новые файлы:

- `packages/shared/src/traps.ts`, `trapSimulation.ts`, `solvability.ts`;
- `apps/web/src/game/trapVisuals.ts`;
- `apps/api/prisma/migrations/20261021000000_trap_orientation/migration.sql`;
- `apps/api/test/traps.test.ts`, `trap-network.bench.ts`;
- `apps/web/test/browser/traps.mjs`, `training-traps.mjs`;
- `docs/STAGE_6_2_PROGRESS.md`, этот отчёт.

Основные изменения существующих файлов: shared party/online/physics/index; API validation/previews/manager/race/store/schema и multiplayer integration; web GameScreen/CSS/createGame/localSession, connection/prediction/presentation, App; package scripts/version. Четыре character IDs и sprites сохранены.

## 2. Реально работающие объекты и каталог

| ID | Название | Действие | Направления |
| --- | --- | --- | --- |
| `basic-platform` | PLATFORM BLOCK | Прежняя твёрдая платформа | none |
| `fan` | FAN | Подъём или боковой воздушный поток | up/right/left |
| `arcade-crossbow` | ARCADE CROSSBOW | Периодический снежный болт, попадание и respawn | right/left |

Все основания 32×16, solid. `traps.ts` задаёт размеры/collision/orientations/restrictions/visual ID/activation parameters/futureDonerPrice. Render registry отделён от симуляции. Цены 0/2/3 — только будущая metadata. Server `TRAP_TEST_LOADOUT` бесплатно разрешает все три типа; UI явно сообщает об этом. Нет покупки, списания, rewards или новых money endpoints.

FAN: up-зона 32×96, боковая 96×32; horizontal acceleration 360px/s², wind speed ≤70px/s поверх input, затухание вне потока 240px/s². Lift 900px/s² против gravity 660; вертикальная скорость ограничена −280…420px/s. Overlapping forces ограничены, значения конечны. Сервер и prediction используют одну функцию `fanForces` внутри прежнего fixed-step solver.

CROSSBOW: warning 24 ticks (400ms), выстрел каждые 120 ticks (2s), speed 180px/s, TTL 180 ticks (3s), radius 2. Максимум 2 снаряда от ловушки и 32 в мире. Swept collision проверяет ближайшее пересечение с solid или активным player body; solid выигрывает точное совпадение. Владелец не исключён из попаданий.

## 3. BUILD, previews и сохранение

Выбрать тип → положение касанием или стрелками по grid 16 → направление → valid/invalid preview → подтвердить. Cancel убирает preview; online SKIP завершает ход. Один объект на участника за раунд, лимит 20 online / 12 Training. Старые placements остаются в NEXT, новая комната начинается пустой.

Сервер проверяет ID/orientation, identity/room/phase/round/revision, лимиты, bounds/grid, protected zones, overlap и geometric route. Повтор PLACE idempotent только при тех же координатах, типе и направлении. Конкурирующие команды сериализованы; при устаревшей revision игрок видит ошибку и подтверждает актуальную карту заново.

Существующий live preview расширен типом/направлением; владелец/имя/validity задаются сервером. До 12Hz input, 15Hz broadcast, heartbeat/TTL/cancel/commit/SKIP/reconnect как прежде. Preview не меняет SQL, room revision или collider.

Spawn x<128 и finish x≥1024 защищены от placement. Route guard проверяет clearance тела 10×21 и подъём до 36px на grid 4; запрещает сплошную стену 48px. Это геометрический фильтр, не доказательство полной временной проходимости с игроками, воздухом и снарядами. Timeout/DNF сохранены.

SQL сохраняет objectType/position/owner/round/orientation; store восстанавливает тип по каталогу. Reconnect текущей RACE получает актуальные layout/tick/projectiles/life. NEXT сохраняет layout, но запускает новый hazard clock. Restart API по прежним правилам прерывает RACE с ABORTED; ephemeral projectiles/life не восстанавливаются из SQL.

## 4. Authority, Phaser и respawn

Сервер считает движение, body contacts, силы FAN, fire clock, движение/столкновения снарядов, HIT/respawn/immunity и finish. Tick 60Hz, snapshots 15Hz; SQL в physics tick отсутствует. Клиент отправляет input, а не позиции/hit/силу.

Phaser рисует каталог, ghost, направление, воздух, warning, снаряды и короткий HIT effect. Снаряд визуально продвигается не более 66.7ms после snapshot и останавливается у solid. Попадания клиент самостоятельно не объявляет. Reduced motion отключает декоративную анимацию, сохраняя игровые сигналы.

Попадание: HIT 8 ticks (~133ms) → RESPAWNING 24 ticks (400ms) → свой spawn + 60 ticks (1s) защиты. HIT/RESPAWNING не сталкиваются с игроками и не финишируют. Life serial на hit/spawn сбрасывает pending input и render offset; remote interpolation не смешивает разные generations. Возврат на старт — намеренное игровое событие. Крови/HP/травм нет.

Training с FAN/CROSSBOW использует тот же shared trap world локально, без API/экономики; pause замораживает симуляцию. Прежний block-only Arcade path сохранён.

## 5. Найденные проблемы и точечные исправления

- В старом store тип всегда восстанавливался как block: load/save теперь используют каталог и orientation.
- Replay через hit/spawn мог переносить старые inputs: добавлен life serial reset, сохраняется монотонный input clock/jump edge.
- Proximity blend удалённого героя мог смешивать прошлую life из delayed buffer с новым spawn. Добавлена проверка serial перед blend; отдельный тест проверяет HIT/RESPAWNING/ALIVE.
- Визуальная экстраполяция могла показывать bolt за solid: ограничена swept пересечением; warning lane тоже обрезается.
- Decorative glyph менял accessible name BLOCK: помечен `aria-hidden`, прежний selector/доступное имя сохранены.
- Первые browser harness попытки посылали второй PLACE до доставки revision и удерживали движение сразу после reload до ready Phaser. Исправлены ожидания теста, без ослабления серверной валидации. Training запуск во время HMR был повторён на стабильном коде. Неуспешные попытки не учитываются как PASS.

## 6. Задержки и сохранность Stage 6.1.6

65 deterministic сценариев через два реальных localhost Socket.IO клиента: 50 прежних + 15 новых (fan-up, fan-side, hit-respawn × 40/80/150/jitter/stall-loss). Доставка планируется виртуальными задержками; это не измерение Internet/телефона.

| Добавленный RTT | FAN up raw error max | FAN side raw error max | FAN side p95 | HIT/respawn |
| --- | ---: | ---: | ---: | --- |
| 40ms | 0px | 3.94px | 0px | PASS |
| 80ms | 0px | 5.11px | 0px | PASS |
| 150ms | 0px | 12.11px | 0px | PASS |
| 80ms + jitter | 0px | 6.28px | 0px | PASS |
| 80ms + delayed/lost snapshots | 0px | 5.11px | 0px | PASS |

На боковом потоке при неизвестной смене remote input наблюдалась одиночная correction >4px в каждом профиле кроме40ms. На150ms один raw physics step достиг13.28px; не выдаём это за нулевые snaps. Таблица измеряет state reconciliation до render smoothing. Явные life/input-history resets считаются отдельно от обычных ошибок; hit-respawn сценарий подтвердил повторяемые циклы и отсутствие повторного урона во время immunity.

Все 50 старых результатов **точно совпали** с сохранённым `artifacts/stage-6.1.6/network-after.json`; head-standing distance `[21,21]`. Прежнее ограничение неожиданного прыжка нижнего игрока — одиночная коррекция верхнего 16–26px при RTT80–150ms — сохраняется. В текущем browser trace максимальный rendered frame step при движущейся/прыгающей опоре — 27.06px (включает обычное движение и коррекцию), при обычных толканиях — ≤1.59px. Это не обещание верхней границы26px для любого видимого шага. Рискованного переписывания физики не было.

Настоящие wall-clock browser задержки на обоих клиентах: DEV40/80/150ms, production80ms. Подтверждены одинаковые shots при одинаковой sequence, HIT/защищённый spawn, FAN lift, reconnect, финиши/NEXT и баланс42. В DEV foot y при подъёме над FAN зафиксирован199.83/201.23/198.00 при floor272 (не обычный прыжок). Результаты лежат в `artifacts/stage-6.2/{development,production}/traps-browser.json`; benchmark — `trap-network.json` и `network-regression.json`.

## 7. Завершённые проверки

| Проверка | Результат |
| --- | --- |
| `pnpm typecheck` | PASS |
| `pnpm build` | PASS; прежнее предупреждение Vite о lazy Phaser chunk >500kB |
| `TEST_DATABASE_URL=… pnpm test` | PASS: 133 (API89/web29/bot15), 0 skipped |
| `git diff --check` | PASS |
| Training regression | DEV37 / production34 PASS |
| Multiplayer regression | DEV20 / production21 PASS |
| Interactions regression | 13 PASS: 4 characters, native multitouch push/head jump, BUILD/RACE reconnect, NEXT, BackButton, balance |
| Network browser | 5 profiles PASS: 40/80/150ms, jitter, stall-loss; head contact21px |
| New multiplayer trap browser | DEV3 profiles / production1 profile PASS |
| New Training traps | DEV/prod PASS: три типа, последовательные раунды/finish, без account HTTP; DEV дополнительно измеряет lift/life/pause |
| Socket.IO benches | Existing50 / new15 PASS; ограничены и p95, и максимальные corrections |

Mobile picker: 320/375/390/430/500px, кнопки≥44px, overflow нет. Скриншоты просмотрены. Browser использует fixture Telegram SDK, но multiplayer HTTP auth/JWT/API/Socket.IO/PostgreSQL настоящие. Использовалась только отдельная localhost `doner_stage62_test` на55436. Не объявляем проверенными физические телефоны, реальные Telegram accounts, настоящий Internet или production.

## 8. Migrations / env

Нужна одна additive migration `20261021000000_trap_orientation`:

```sql
ALTER TABLE "TrapPlacement" ADD COLUMN "orientation" TEXT NOT NULL DEFAULT 'none';
```

Старые platforms получают `none`. В тестовой БД все четыре migrations применены. Новых runtime env variables нет. `.env` и production DB не менялись; PlayerProgress schema/данные не менялись. Тестовый `VITE_API_URL=http://127.0.0.1:3014` задавался только процессу локальной QA сборки.

## 9. Безопасная публикация — инструкция, не выполнено

1. Проверить diff и этот отчёт, подготовить backup PostgreSQL и сначала пройти staging. Сохранить существующие production env/domain и настройки бота. Публикацию выполнять только отдельным решением владельца проекта.
2. Выделить окно обслуживания: один активный API instance, без одновременного запуска двух RoomManager. Завершить текущие матчи; автоматический frontend release отложить до готовности API/schema.
3. Собрать существующий API: `pnpm install --frozen-lockfile --prod=false && pnpm build:api`. Node24, pnpm10.34.6. Prisma CLI должен быть доступен migration hook.
4. В **целевом окружении** до старта API выполнить `pnpm db:deploy`; должна примениться `20261021000000_trap_orientation`. Не использовать reset/db push. При ошибке миграции остановить rollout.
5. Запустить один API через `pnpm start:api`. Проверить `/health`, затем настоящую Telegram auth, `/me` и Socket.IO на прежнем API domain. Сохранить DATABASE_URL/BOT_TOKEN/BOT_USERNAME/JWT_SECRET/CORS_ORIGINS/PORT.
6. В существующем frontend project: install `pnpm install --frozen-lockfile`, build `pnpm build:web`, output `apps/web/dist`. Сохранить **production VITE_API_URL**; не публиковать локальный dist с3014 и не копировать тестовые URL.
7. Перезагрузить открытые Mini Apps, убедиться в версии `v0.6.2 Chaos Building Prototype`. Согласованно обновлять API/web; старый frontend не умеет показывать новые ловушки. Bot token/settings не требуют изменений.
8. Выполнить ручной сценарий ниже. При проблеме сначала остановить новые матчи и диагностировать; не удалять additive column/пользовательские данные. Старый API6.1.6 считает сохранённые объекты blocks, поэтому откат на активных hazard rooms не является безопасным продолжением текущего матча — требуется согласованное обслуживание, предпочтителен roll-forward.

## 10. Проверка с другом / ещё не выполнено вручную

Два разных Telegram account, желательно iOS + Android и разные сети. Записать Doner/Golden Doner до начала.

1. Открыть существующего бота → DONER GAME → создать комнату на2 → друг вводит код/открывает invitation → оба выбрать героя и READY → host START.
2. В BUILD A выбирает FAN, вращает, двигает, отменяет и ставит; B видит type/direction/owner/validity. B ставит CROSSBOW. Проверить запрет spawn/finish/overlap и повторного объекта за ход.
3. RACE: встать в поток, прыгнуть через него; подойти к траектории bolt, получить один HIT и быстрый spawn. Проверить короткую защиту, отсутствие застревания input и одинаковую видимую реакцию друга. Потолкаться, встать на голову и прыгнуть с неё.
4. Поочерёдно финишировать → одинаковые RESULTS → NEXT → старые FAN/CROSSBOW остаются → добавить BLOCK и SKIP второго игрока → следующий RACE.
5. Во время BUILD/RACE отключить сеть на10–20s и вернуть её; reload должен вернуть ту же комнату, карту, life и текущие effects. Нет дубликатов героя.
6. Проверить left/right+jump двумя пальцами, pointer cancel, background/resume, Telegram BackButton и safe areas. Проверить все 4 персонажа, включая Ayazhan.
7. Выйти → проверить неизменность балансов/ownership → Training с каждым типом → новый матч с пустой картой.

Записать device/OS/Telegram/network и шаг проблемы без JWT/initData. Эти проверки на телефонах остаются открытыми.

## 11. Ограничения и следующий этап

Один API process, без distributed room ownership/rollback/lag compensation/load test. Сохраняются указанные коррекции remote contacts, возможна задержка HIT на downlink. Проходимость комбинаций hazards не доказана. Placement защищает spawn/finish, но bolt может прилететь в spawn извне; после respawn есть1s immunity. Часы снарядов сбрасываются при новом раунде, restart RACE прерывается. Временные original pixel sprites, без звука/character abilities.

Stage 6.3 остаётся отдельной задачей: магазин/entitlements, транзакционные покупки и settlement, idempotency/anti-farm, баланс цен/наград. Ничего из этого в данном этапе не включалось.


Итоговая перепроверка после serial guard: `pnpm typecheck`, `pnpm build`, full133 tests, trap browser DEV40/80/150 и production80 завершились с exit0. Логи сохранены в `artifacts/stage-6.2/logs/` (gitignored); JSON и screenshots рядом. Незапущенные или прерванные попытки в итоговые PASS не включены.
