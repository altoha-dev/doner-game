# Stage 6.3 — Doner Economy & Trap Shop

## DONE — аудит 2026-10-22

- Задание a8d4d9b1-5f58-4216-8bb9-9c24dcfa8908 прочитано. Текущая ветка/репозиторий сохраняются, существующие незакоммиченные Stage6.2 изменения не откатываются. Commit/push/deploy/reset запрещены.
- Изучены schema/PlayerProgress, catalog, manager/store/BUILD/results, docs design/architecture/6.2 report/progress. Существующие4 migrations сохраняются; новая будет после trap_orientation.
- Physics60Hz/prediction/contacts/hazards не требуют переписывания. Экономика работает вне tick.

## Решения

- Один existing PlayerProgress.doners; GoldenDoner не меняется. Ledger unique key для reward(room,round,user) и purchase(placement); balance delta/ledger/placement атомарны.
- Central rules: points3/2/1/0, Doner0/1/2/3; DNF/ABORTED/не игравшие0. Минимум2 разных authenticated участников с игровым input; Training не вызывает economy.
- Первый slot: бесплатный block либо FAN2/CROSSBOW3. После block доступен ровно один extra block1 или завершение хода (SKIP). FAN/CROSSBOW завершают BUILD сразу. Оплата только successful placement, не preview.
- Сохраняем5 раундов; total points в RoomPlayer, одинаковые totals делят победу. PENDING settlement хранится в БД, retry на сервере, NEXT только после SETTLED. Старые раунды LEGACY не награждаются задним числом.

## DONE — восстановление и критические проверки

- Shared `economy.ts`, additive schema/migration `20261022000000_doner_economy`, purchase/settlement/store/manager, shop/results/scoreboard/profile balance реализованы. Согласованные правила двух слотов, пяти раундов и общей победы сохранены.
- Новая локальная `doner_stage63_test` на 127.0.0.1:55436: все пять миграций применены. Production env не читался/не использовался.
- `migration-upgrade.mjs`: PASS на отдельной `doner_stage63_upgrade_test`: три старые миграции → существующий User/PlayerProgress/placement → orientation + economy. Doner17, Golden9, campaign4 и выбор персонажа сохранены; старый раунд LEGACY, ledger пуст. Log `/private/tmp/doner-stage63-upgrade.log`.
- Новые 7 Socket.IO/PG economy scenarios PASS: бесплатный/extra/paid slot; invalid/preview/cancel; дубликаты; конкурентный debit; rank rewards; повторный settlement; lost ACK/restart; искусственный сбой SQL reward с полным rollback и восстановлением PENDING. Golden/progress сохранены.
- Typecheck PASS до последних малых правок; общий повторный запуск ещё выполняется. Предыдущий полный запуск FAIL: старые сценарии считали первый бесплатный блок концом BUILD. Сценарии теперь явно отказываются от EXTRA через SKIP; тесты не удалены.
- Исправлен retry pending-settlement: закрытая комната не удаляется во время backoff. ARIA-цена недоступной платной ловушки больше не говорит «бесплатно».

## PARTIAL

- Frontend реализован; browser regression scripts адаптированы к явному завершению BUILD и подтверждённым балансам. Browser Stage6.3 ещё НЕ запускался.
- Full tests повторяются после исправления legacy helpers; итог не подтверждён.

## TODO

1. Проверить `/private/tmp/doner-stage63-test.log`; точечно исправить реальные ошибки.
2. Новый browser economy QA: два клиента, FAN/CROSSBOW/EXTRA, недостаточный баланс, повтор, reconnect, rewards, пять раундов. Training и сохранённые regression suites DEV/production preview.
3. Финальные typecheck/build/test/diffcheck; README/design/architecture/REPORT; остановить свои QA процессы.

Следующее действие: дождаться общего test run, запустить локальный Vite5186 и создать economy browser scenario. Нельзя параллельно запускать RoomManager fixtures на одной БД (recovery завершает активные RACE).

## Checkpoint — core PASS, browser QA выполняется

- DONE: `pnpm test`144/144 (API100/web29/bot15), skipped0; log `/private/tmp/doner-stage63-test.log`. Новый дополнительный integration test SQL failure AFTER debit добавлен после этого run и пока TODO rerun (итог ожидается145).
- DONE: typecheck PASS; build PASS после последовательного запуска. Первоначальный параллельный запуск двух Prisma generators дал EEXIST; это не PASS и был повторён последовательно.
- DONE: Training DEV37/production34; real multiplayer regression DEV20. Logs `/private/tmp/doner-stage63-{training-dev,training-prod,party-dev}.log`.
- DONE: маленькая UI fix — чужое placement не очищает мой preview; собственное первое placement очищает ghost и открывает EXTRA. README/design/architecture описывают текущую экономику.
- PARTIAL: новый economy browser test. Первая попытка использовала запрещённый y160; исправлена на176. Вторая завершила4 раунда, но заданный по таймеру порядок финишей отличался от ожидания; теперь участники проходят по очереди с native input, race fixture40s. Эти попытки не объявлены PASS. Новый run выполняется, лог `doner-stage63-economy-dev.log`.
- Следующее действие: завершить economy DEV; заново build после preview fix; economy/party/traps production preview, interactions/network/traps DEV, Training traps DEV/prod, оба physics benches; финальные145 tests/typecheck/build/diffcheck и REPORT. На одной DB только один multiplayer fixture одновременно.

## Checkpoint — economy DEV DONE

- Economy browser DEV PASS: полный5-round матч двух Chromium клиентов,3 paid placements,5 duplicate command deliveries,8 unique reward ledger rows, score10:10/shared victory, final idle DNF0; Doner total3, Golden7 у обоих. Mobile320/375/390/430/500 без overflow, touch targets≥44. JSON/screenshots `artifacts/stage-6.3/development/`.
- Training traps DEV PASS: fan/bow/hit/respawn/finish,3 persistent types, no account HTTP.
- Создан REPORT с описанием транзакций/миграций/deployment/manual smoke; финальная verification section пока PARTIAL.
- Следующее действие: sequential verification runner: interactionsDEV → typecheck → build → full145tests → economy/party production → networkDEV → trapsDEV/prod → Training trapsprod → benches. При первом FAIL runner останавливается; читать точный log, исправлять причину и продолжать с этого шага.

## Checkpoint — core final145 PASS

- DONE: interactions DEV13, including4 clients, Ayazhan, live previews,120ms B, push/head/multitouch, BUILD/RACE reconnect, NEXT и подтверждённый Home balance.
- DONE: последовательно typecheck/build и full `pnpm test`:145 (API101/web29/bot15), skipped0. Добавленный SQL failure-after-debit тест PASS: wallet/ledger/room revision/slot полностью rollback.
- Исправлены две устаревшие подсказки Lobby/How («без списаний»/«Doner не меняются»); web заново собран с typecheck после правки, до production QA.
- PARTIAL: economy production сейчас выполняется. Остальной sequential runner ещё TODO. Script `/private/tmp/doner-stage63-verify.py`, живой exec session39314 (если сохранился). Logs `/private/tmp/doner-stage63-*.log`.

## Checkpoint — economy production DONE

- Economy production preview PASS: все5 раундов/3 покупки/5 duplicates/8 rewards/shared victory; SQL ledger11, final Doner2/1, Golden7/7. Screenshots shop/results/final просмотрены,320px readable без overflow.
- Следующее действие: дождаться sequential runner `party-prod` → network/traps/training-traps/benches, сравнить numeric regression с Stage6.2, финализировать REPORT/PROGRESS и собрать logs.

## Checkpoint — сохранённые regressions

- Party production21 PASS. Network browser5 профилей PASS: RTT40/80/150, jitter, stall-loss; push/moving support/head jump. Это headless Chromium, не замер FPS телефона.
- PARTIAL: traps DEV сейчас выполняется; затем trapsprod, Training trapsprod,50+15 numeric benches.

## Checkpoint — traps regression interrupted by failure

- Trap DEV first run:40ms PASS,80ms FAIL finish timeout. B after reload jumped at spawn with direction0; test reconnect barrier could accept a pre-reload packet. No physics changes made.
- Test now clears captured snapshots before reload and waits two animation frames after enabled controls before holding movement, so initial ready effects cannot clear that key. Full40/80/150 run being repeated. No PASS declared for failed attempt.
- Runner stopped at `traps-dev`; resume `/private/tmp/doner-stage63-verify.py traps-dev`.

## Checkpoint — traps DEV DONE

- Полный повторный trap DEV run40/80/150 PASS (exit0). Ожидание нового snapshot/ready после reload исправлено только в QA helper. Никаких physics changes.
- Текущий network browser: stable head height21px, push max frame step1.92px, support-jump max27.12px (motion+correction); известный snap не скрывается.
- Следующее действие: traps production / Training traps production / benches; runner session43596. Затем final report/evidence/checks, shutdown только своих процессов.
