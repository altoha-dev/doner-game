# Stage 6.1 — карта прогресса

Обновлено 2026-10-20. Техническая реализация и локальная проверка завершены после возобновления прерванной сессии. Существующие изменения сохранены в dirty tree, без отката/commit/push/deploy. Production, реальные `.env`, балансы и старые миграции не изменялись.

## DONE — реализовано и подтверждено проверками

- Shared contracts (`packages/shared/src/online.ts`), Socket.IO 4.8.3 на существующем Fastify HTTP server, JWT handshake, проверенная сервером identity, origin/payload/rate limits.
- Rooms / capacity 2–4 / membership / host / ready / room-only выбор всех трёх персонажей; публичный code и Main Mini App invite.
- Серверные BUILD/RACE/RESULTS/NEXT; один бесплатный блок за раунд, skip, валидация, revision, сериализация и idempotency. Блоки сохраняются.
- Один Phaser engine для training и online; 15 Hz movement, interpolation, имена и непрозрачные remote sprites, проверки допустимости движения и серверный порядок финишей.
- Disconnect/reconnect/refresh без дубликатов, server snapshots, таймауты, сохранение в PostgreSQL и безопасное прерывание RACE после restart.
- Additive migration `20261020000000_party_rooms`: Room, RoomPlayer, MatchRound, TrapPlacement, RoundFinish. Применена только к новой локальной `doner_stage61_test` на порту 55436.
- Browser QA: **20 checks PASS в dev и 20 в production preview**. Два отдельных Chromium contexts + настоящий fixture API/PostgreSQL/Socket.IO, два полных раунда, reconnect/refresh, одинаковые результаты, 2 → 4 блока, native multi-touch/remote motion, touchCancel, Telegram BackButton; ширины 320/375/390/430/500.
- Training browser regression: **31 checks PASS в dev и 28 в production preview**.
- `pnpm typecheck` и `pnpm build` PASS. Единственное предупреждение build — размер лениво загружаемого Phaser chunk.
- `pnpm test`: **90 tests PASS, 0 failures, 0 skips** (API 46, web 29, bot 15). Проверены host migration, finish commit, restart, unchanged balances.
- Исправлены перекрытие имён на старте, явный polling fallback, устаревшие HOW TO/online finish texts. Удалён fixture debug.
- Исправлено сохранение чужого commandId: конфликт откатывает transaction и не публикует несохранённый блок. Добавлен integration regression; duplicate placement проверяется при любом победителе конкурентных запросов.
- README/GAME_DESIGN/MULTIPLAYER_ARCHITECTURE/ART_DIRECTION обновлены. Готовы [отчёт](STAGE_6_1_REPORT.md) и [deployment/two-phone plan](TELEGRAM_MULTIPLAYER_TEST_PLAN.md).
- Screenshots RACE/RESULTS просмотрены; подписи читаются. Удалён старый failure screenshot. 7 QA logs сохранены в `artifacts/stage-6.1/logs/`.
- `git diff --check` PASS. QA Vite 5185/5186, preview 4186 и временная PostgreSQL 55436 остановлены; посторонние процессы не останавливались.

## PARTIAL — внешняя ручная приёмка

- Критических незавершённых частей локально проверенного сценария нет.
- Реальные Telegram navigation/share/WebViews и мобильные сети ещё требуют двух настоящих аккаунтов/телефонов. Automated fixtures не заменяют эту проверку.

## TODO — только после отдельно разрешённой публикации

- Пользовательский review, разрешённый rollout API + additive migration, затем frontend.
- Пройти [сценарий двух телефонов](TELEGRAM_MULTIPLAYER_TEST_PLAN.md), зафиксировать реальные device/network результаты.
- Stage 6.2 не начинать без нового задания.

## Следующие команды / точки продолжения

1. Прочитать report/progress; не начинать реализацию заново.
2. Для повторного QA поднять отдельную локальную `*_test` PostgreSQL. Данные использованного кластера оставлены в `/private/tmp/doner-stage6-test-pg`; во время проверки DB `doner_stage61_test` слушала 55436.
3. Команды повторения — в README; не запускать API integration и browser fixture одновременно на одной БД.
4. Screenshots/logs: `artifacts/stage-6.1/`; fixture: `apps/api/test/browser-server.ts`; browser scenario: `apps/web/test/browser/party.mjs`.

## Ограничения реализации

Один активный API instance, включая rollout. Movement — клиентская физика с server plausibility checks, не полная server-authoritative physics. Результаты без наград/Doner/очков аккаунта. Техническая готовность для ручного теста подтверждена отчётом; физический Telegram smoke пока не выполнен.
