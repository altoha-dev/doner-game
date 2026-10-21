# Stage 6.1.6 — Network Physics Smoothing

**Итог: Stage 6.1.6 завершён локально.** Финальные typecheck/build/test/diff check и все четыре DEV/production browser suites прошли. Известное ограничение 16–26 px сохранено и описано в [отчёте](STAGE_6_1_6_REPORT.md). Ниже сохранена история checkpoints; прежние PARTIAL/TODO закрыты заключительным блоком.

Задание: `/Users/altoha/.codex/attachments/00154520-ec65-414d-9b89-a04d3c0e9b7d/pasted-text.txt`. На старте git clean; имя Ayazhan уже сохранено. Production/real env/balances не трогать, Stage 6.2 не начинать.

## DONE — аудит

- Online Arcade world paused: двойного Phaser/server solver не обнаружено. Body общий 10×21, artwork 16×24; разница намеренная.
- `prediction.ts` создаёт sequence на каждом 60Hz step, `createGame.ts` отправляет только последний на 20Hz. `race.ts` держит последний input несколько ticks, но sequence подтверждает сразу. Replay считает каждую unacked sequence ровно одним шагом: разные значения времени у ack и истории.
- Replay предсказывает всех remote игроков по последнему direction на весь pending window; меняющееся намерение другого клиента неизвестно.
- `receiveMovement` принудительно сбрасывает correction offset в 0 при любом близком контакте. Remote rendering прыгает между snapshot interpolation и predicted world по proximity threshold без общего временного буфера.
- Interpolation начинается заново от текущего sprite при каждом arrival, не имеет timestamp buffer/jitter handling. Camera follows резко исправляемый sprite.
- Snapshot sequence guard есть; нужно также контролировать round/tick и диагностировать stale/gaps.
- Support carry: верхний наследует vertical velocity нижнего и затем получает дополнительный перенос по delta нижнего; также горизонтальный carry считается до окончательного pair resolution. Нужны воспроизводящие tests до исправления.

## DONE — baseline и физическая причина

- Два настоящих Socket.IO clients, production solver/server/predictor, виртуальное расписание доставки 1ms: 50 сценариев (10 действий × RTT40/80/150, jitter, stall/loss). Baseline `artifacts/stage-6.1.6/network-before.json`: 173 corrections >4px, 45 физических frame steps >8px. Это не измерение visible snaps или настоящего интернета.
- Исходный browser interactions: 13 scenarios PASS, четыре независимых Chromium contexts, B +120ms RTT, FPS 60/60/60/60. Baseline latency/performance сохранены в artifacts/stage-6.1.6.
- Два новых physics regression воспроизвели потерю поддержки при прыжке нижнего и отставание верхнего после толчка. После исправления vertical carry и final horizontal carry все 7 physics tests PASS.

## Исторический checkpoint: DONE input/ack, PARTIAL presentation/QA

- Один input sequence = один 60Hz шаг; bounded FIFO на сервере, ack только после шага, redundant tail до 6 команд на прежних 20Hz, replay только unacked. Late new packet обновляет liveness, не повторяет движение. Сервер остаётся authority.
- Remote intent extrapolation ограничен 200ms; reset при устаревшей истории/reconnect. Добавлены tick/sequence guards.
- Повтор core benchmark: 27 corrections >4px, 14 физических steps >8px. По профилям corrections: 4/4/6/6/7 против 28/33/33/34/45. Остаточные ошибки — изменение направления опоры и подтверждение finish; максимумы не скрыты. JSON после измерений сохранён.
- Реализованы timestamp/jitter buffer 100–200ms, extrapolation ≤66.7ms, visual offset ≤6px с decay80ms, общий offset контактной группы и проверка стен. На этом этапе требовалось тестирование; результаты завершённых проверок ниже.
- DEV `?netdebug=1`: RTT/jitter/tick/rate/error/corrections/largest/stale/gaps/FPS. Никаких tokens/identity. `pnpm typecheck` PASS после интеграции.
- Изменены shared physics/contracts, API race/validation/socket/manager, client prediction/presentation/diagnostics/connection/createGame/CSS, тесты. БД: отдельная doner_stage616_test на порту55436, только существующие migrations. Реальные .env не читались/не менялись.

## Исторический TODO (закрыт заключительным блоком ниже)

1. Regression tests input/ack/prediction/presentation, адаптация существующих Socket.IO тестов к пакетам.
2. Browser QA взаимодействий/overlay/FPS и остальных систем, full typecheck/build/test/diff check.
3. Документация и отчёт до/после, остановить только собственные QA процессы. Нет новых migrations/env.

## Исторический checkpoint: DONE regression/browser, PARTIAL заключительная проверка

- Добавлены 9 networking tests (validation/FIFO/ack/dedupe/timeout/reconnect/replay/stale/history/buffer/render/diagnostics) и 2 support physics regressions. `pnpm test` с test DB: API75 + web29 + bot15 = 119 PASS, skipped0. Typecheck/build PASS; прежнее предупреждение большого Phaser chunk остаётся.
- Socket.IO benchmark повторён с assertions: 50/50 PASS. Обычные run/jump/opposing/push/landing/head-jump/wall не имеют corrections >4px после warm-up; finish и reversal опоры учитываются отдельно. Во всех пяти профилях оба игрока завершили finish.
- Исходный и новый browser interactions: 13/13 PASS, одинаковый push 72 кадра, B +120ms RTT. Max visible X step 6.3538 → 1.6315px; steps >4px: 2 → 0; >8px: 0 → 0; FPS60/60/60/60. Нельзя назвать физические steps из benchmark видимыми snaps.
- Новый `test:network`: 5/5 профилей, два браузера, реальные wall-clock задержки на обоих clients. Push max1.11–2.43px/frame, FPS≈60. Moving/jumping support держит высоту21px (floating-point epsilon), первый head jump проходит, overlay работает и удаляется при выходе.
- **Выявленное ограничение:** неизвестный заранее прыжок нижнего вызывает одиночные render steps у верхнего: 16.22px при80ms, 25.80px при150ms, до22.45px с jitter; support не теряется. Offset намеренно ограничен6px, поэтому большую коррекцию нельзя полностью скрыть. Это не полное устранение всех snaps и не подтверждение идеальной плавности; отразить в финальном отчёте.
- Завершённые JSON/screenshots: `artifacts/stage-6.1.6/`. Тестовый assertion RTT для jitter исправлен: две задержки могут каждая уменьшаться на15ms, поэтому измерение59ms при nominal80ms корректно.
- Следующее: production multiplayer/no-debug + training dev/prod, актуальная документация, final typecheck/tests/diff check, остановка своих Vite/preview/PG. Ни production, ни .env, ни assets/character stats/economy не изменялись.

## DONE — продолжение и финальные проверки 2026-10-21

- Пользователь разрешил завершить оставшиеся проверки и честно зафиксировать ограничение 16–26 px; рискованная переделка физики не выполнялась. Git status проверен, предыдущая работа сохранена.
- Логи прерванных Training DEV/production и Multiplayer production отсутствовали. Эти запуски не считались успешными: выполнены заново. До тестов PostgreSQL подтверждён SQL-запросом (doner_stage616_test, 3 applied migrations), DEV/preview отвечали HTTP 200.
- Training DEV: **37 PASS**; Training production: **34 PASS**. Multiplayer DEV: **20 PASS**; Multiplayer production: **21 PASS**, включая отсутствие overlay/DOM diagnostics с netdebug=1. Оба объединённых browser процесса завершились exit 0.
- Заключительные `pnpm typecheck`, `pnpm build`, `pnpm test` завершены exit 0. Tests **119 PASS: API75/web29/bot15; skipped0**. `git diff --check` PASS. Build сохраняет известное предупреждение большого Phaser chunk.
- Создан `docs/STAGE_6_1_6_REPORT.md`: причины/исправления, численные baseline/after, все browser tests, известные остаточные коррекции, ручная приёмка двух телефонов и точные команды/order deployment с совместимым API/frontend. README, multiplayer architecture и ссылка из исторического deployment plan актуализированы.
- Новых migrations/env/production writes нет. Push/deployment/Stage6.2 не выполнялись. Исходники готовы к review, изменения не закоммичены.
- Ручная проверка двух настоящих телефонов остаётся **не выполнена** до отдельно разрешённого deployment. Это не локальный TODO и не выдано за автоматический PASS.
- QA cleanup DONE: собственные Vite5186/preview4186 остановлены, PostgreSQL55436 корректно остановлен через pg_ctl. Fixture API3014 уже завершён тестами. Artifacts и тестовый cluster сохранены; остальные локальные процессы не затронуты.
