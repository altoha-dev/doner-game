# Stage 6.2 — Chaos Building Prototype

Задание: attachment c422c50d-9155-4bbc-ac04-ae3be58ceae7. Старт: чистый git, commit9448612 Stage6.1.6. Не выполнять push/deployment, не начинать6.3, не читать/менять реальные .env и PlayerProgress.

## DONE — аудит

- Stage6.1.6 завершён:119 tests, Training DEV37/prod34, Multiplayer DEV20/prod21, network50 scenarios/5 browser profiles. Повторять как будто прерванные не требуется; после изменений regression обязателен.
- Shared fixed-step60Hz, packet input/ack/replay и contact smoothing сохраняются. Ограничение неожиданного прыжка опоры16–26px остаётся.
- TrapPlacement уже имеет objectType в БД, но load всегда подставляет basic-platform. Нужны catalog-driven load/save и additive orientation field.
- Live previews/PLACE уже авторизованы/сериализованы/idempotent; расширяем существующий путь.

## Решения

- Stable IDs basic-platform / fan / arcade-crossbow, все bodies32×16, solid bases. Fan up/left/right, crossbow left/right, block none. Цены0/2/3 только metadata; server-controlled TRAP TEST LOADOUT бесплатен.
- Shared fan force применяется внутри существующего solver; bounded forces/velocity. Authoritative projectiles/lifecycle — отдельный deterministic trap world60Hz, snapshots15Hz, SQL только placements.
- HIT→RESPAWNING→ALIVE, spawn reset с generation counter и короткой защитой. Клиент не объявляет попадания. Respawn сбрасывает replay/render offset.
- Консервативный geometric route check учитывает body clearance и ограниченную высоту подъёма, защищает от непроходимых сплошных стен; не обещает solvability динамических hazards.
- Original code-native pixel textures/graphics продолжают существующий стиль (новые raster assets/внешние ассеты не нужны).

## Исходный план (выполнен; история ниже)

1. Shared catalog/contracts/validation/solvability/trap simulation + focused tests.
2. API persistence/preview/race/respawn и test DB migration/integration.
3. BUILD picker/rotation, rendering/effects/projectiles, Training gameplay.
4. Two-client latency/browser QA40/80/150 и regressions/mobile widths, final typecheck/build/test/diff.
5. README/design/architecture/art direction/report, version0.6.2, cleanup своих QA процессов.

## DONE — первый implementation block

- Catalog/contracts, placement+orientation validation, live preview extension, idempotent payload comparison. Additive migration20261021000000_trap_orientation, старые blocks default none.
- Bounded shared fanForces, authority TrapSimulation with tick projectiles/swept collisions/HIT8ticks→RESPAWNING24ticks→spawn+60tick immunity. Respawn serial resets client replay/render; remote snapshot interpolation не пересекает generations.
- BUILD picker3 types, direction button, test-loadout notice, code-native trap renderer/air particles/danger lane. Training с hazards использует shared trap world; старый block-only Arcade path сохранён.
- API/web typecheck PASS после интеграции. 16 прежних physics/network unit tests PASS. 7 новых traps tests PASS (catalog/validation/route/fans/hits/respawn/bounds/reconciliation).
- Геометрический guard защищает от48px solid wall и сохраняет floating platform placements. Он проверяет clearance и достижимую высоту подъёма, не полную временную solvability.
- Следующее: новую doner_stage62_test мигрировать, backend integration и real Socket.IO delay benches, browser QA новых traps + прежние regressions. Визуалы и lifecycle пока не считаются подтверждёнными браузером.

## DONE — восстановление 2026-10-22 и gameplay QA

- Прочитан continuation c94dcbe6-b452-4b15-8a91-24ebb50135fd. Изменения сохранены; pwd/status/diff/stat/check выполнены, diff-check чистый.
- DONE: shared catalog/validation/route, API preview/placement/persistence, authoritative fan/projectiles/lifecycle, Phaser/BUILD/Training. Новая отдельная localhost DB `doner_stage62_test:55436`, все4 migrations применены; production не использовался.
- DONE: pnpm test — API88/web29/bot15, всего132 PASS; typecheck/build PASS. Existing physics/network16 + new trap unit7 входят в этот запуск. Build предупреждает о размере lazy Phaser chunk.
- DONE: real two-client integration5 новых nested cases: type/rotation/preview, immutable turn/idempotence, одинаковые shots/hit/respawn, reconnect/finish, NEXT/newroom/Doner unchanged.
- DONE: Training DEV37 / production34; Multiplayer DEV20. Первый Training запуск пересёкся с HMR во время правок; повтор на стабильном source прошёл, прерванный запуск не считается PASS.
- DONE: new trap browser DEV40/80/150ms, оба клиента с реальным WebSocket delay: mobile picker320/375/390/430/500, rotation/cancel/remote previews, server shots/hit/respawn, actual fan lift, reload, finish/NEXT/block+skip/unchanged42Doner. Training new traps DEV PASS (fan/pause/bow/respawn/finish/persistent3types/no account HTTP).
- Найденные ошибки теста: второй PLACE до доставки новой revision (ожидаем подтверждённую карту), input сразу после reload до ready (ожидаем enabled control). Gameplay код ради этих ожиданий не изменяли.
- DONE: прежний50-case Socket.IO physics benchmark; new15-case fan-up/fan-side/hit-respawn benchmark40/80/150/jitter/stall-loss. FAN-up errorMax0; FAN-side единичные raw corrections3.94/5.11/12.11px, p95=0. Respawn resets учитываются отдельно, не выдаются за обычное движение.
- Визуальные projectile extrapolation и danger lane ограничены ближайшей стеной; версия UI/root0.6.2.
- PARTIAL: production trap browser + Training traps production, old interactions13 и network browser5profiles, final repeat checks, docs/report.
- TODO next: закончить эти браузерные проверки последовательно (каждый fixture поднимает RoomManager; не запускать с той же БД одновременно), обновить README/design/architecture/art/report; остановить только собственные QA процессы. Servers5186/4186 и testPG55436 проверены живыми.

## DONE — browser regressions и финальная life-граница

- Production traps80ms PASS; Training traps production PASS. Multiplayer production21 PASS; interactions13 PASS; network browser5 profiles PASS (40/80/150/jitter/stall-loss).
- Все50 старых benchmark rows точно совпадают с сохранённым Stage6.1.6 baseline. New15 benchmark PASS после подключения maxWind к каталогу; одиночная боковая correction12.11px на150ms задокументирована.
- Final full tests до последней render-защиты:132 PASS (API88/web29/bot15), typecheck/build/diff PASS.
- При final review найден corner case: RacePresentation мог смешать старый buffered remote и новую life при proximity blend. Точечная проверка serial теперь возвращает актуальное состояние, не проводя ghost через карту. Добавлен восьмой trap unit test с HIT/RESPAWNING/ALIVE; targeted8 PASS. Обновлённые typecheck/build выполняются; после них повторить full133 и trap browser DEV/prod, затем completion отчёта и cleanup.
- README, design, architecture, art direction и report заполнены; report пока содержит completion placeholders для окончательных команд. Не объявлять их готовыми до проверки exit codes.


## DONE — итог 2026-10-22

- DONE: все3 trap types в Training/Multiplayer; catalog, BUILD/rotation/validation, live preview, bounded FAN, server CROSSBOW/hit/respawn, persistence/NEXT/reconnect, mobile controls.
- DONE: final typecheck/build PASS, full133 tests PASS (API89/web29/bot15, skipped0), diff-check PASS;8 trap unit tests и5 новых nested integration cases.
- DONE: финальный repeat trap browser DEV40/80/150 + production80 PASS после life serial guard. Training DEV37/prod34; Multiplayer DEV20/prod21; interactions13; network browser5profiles; Training traps DEV/prod — PASS.
- DONE: physics benchmark50 совпал с baseline Stage6.1.6; trap benchmark15 PASS, p95 и maximum assertions. Известные remote-input corrections явно описаны в report, не скрыты за средними.
- DONE: README/design/architecture/art/report/progress, version0.6.2. Нужна только additive orientation migration, новых runtime env нет.
- Артефакты: artifacts/stage-6.2/logs (финальные команды), network-regression.json/trap-network.json, development/production JSON/screenshots. Графика просмотрена.
- Следующее действие: только отдельно разрешённая публикация по report и ручной smoke на двух настоящих телефонах. Manual phones/Telegram/Internet — TODO вне завершённого local QA. Stage6.3 не начат. Push/deployment/production migrations/reset/economy не выполнялись.
- Cleanup: собственные Vite5186/preview4186 и testPG55436 остановлены; cluster/data/artifacts сохранены. Пользовательские серверы, production и Git remote не затрагивались.
