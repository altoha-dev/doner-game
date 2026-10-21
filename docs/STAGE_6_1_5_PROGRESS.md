# Stage 6.1.5 — Player Interactions + Ayazhan

Задание 6.1.5: `/Users/altoha/.codex/attachments/e17ed4ce-724d-4546-bd46-487c5fdb3a2f/pasted-text.txt`; продолжение + Аяжан: `/Users/altoha/.codex/attachments/ea3e2cf9-36a1-40df-8d8c-6a79a4a5bd18/pasted-text.txt`.
На старте первоначальной реализации дерево было чистым; при продолжении незакоммиченные изменения сохранены. Итог 21 октября 2026: реализация и локальные проверки завершены. Полный [отчёт и ручной план](STAGE_6_1_5_REPORT.md).

## DONE

- Audit: online RACE использовал клиентскую Arcade physics + серверную проверку координат; remote sprites интерполировались без физических тел. Фазы/placements/results — серверные. Training использует тот же Phaser renderer, отдельную local session.
- Выбран общий небольшой fixed-step AABB solver для online: сервер принимает только input, рассчитывает world/player contacts и finish. Клиент prediction/reconciliation, remote interpolation. Никакой доверенной клиентской позиции или локального collider как единственной authority.
- Live preview реализован как ephemeral state с verified identity, sequence/throttle/expiry, server placement validity, room-only broadcast и очисткой по lifecycle. BUILD status выводится из placements/buildDone/previews/presence; migration не нужна.
- Реализованы shared `physics.ts` config/solver и 5 PASS physics tests (встречное движение, push/wall/bounds, head/carry/jump, simultaneous jumps/ceiling/disconnect, four-player chain).
- API `race.ts`: fixed 60 Hz authoritative world, 20 Hz input, 15 Hz snapshots; input expiry 300ms, inactive disconnected bodies; серверный finish. Старый coordinate event больше не обрабатывается.
- API `previews.ts`: ephemeral preview + sequence + validity + TTL 1800ms, не пишет в SQL. Socket runtime validators и 16/s gate; updates по комнатам. Reconnect/replacement сбрасывает старую preview sequence.
- Client `prediction.ts` + существующий Phaser renderer: shared solver, pending input replay, correction smoothing, remote interpolation/near-contact prediction, pixel impacts/reduced motion.
- Typed preview connection throttle 12 Hz, heartbeat 500ms, cancel/expiry; remote ghosts/owner colors/names/validity и BUILD status HUD.
- `pnpm typecheck` PASS на подключённой реализации.
- Real Socket.IO + test PostgreSQL: **22 tests PASS** (старый scenario адаптирован на input без удаления проверок, плюс preview/contact/head/wall/reconnect/finish, catalog и replacement suites).
- Существующий двухраундовый browser scenario: **20 checks PASS**, новая physics, оба финиша/next/reconnect.
- Отдельная `doner_stage615_test` создана на 55436; применены только 3 существующие migrations, новых нет.
- Добавлена Аяжан (`ayazhan`) в shared catalog, портрет и Phaser palette/четыре prototype frames; сиреневое пальто, голубой шарф/шапка. Body/скорость/прыжок общие, способностей нет.
- Character Select показывает четыре карточки и позволяет local training для любого профиля; legacy selection API вызывается только для уже owned персонажей. Room CHARACTER использует общий catalog; бесплатно, без требования уникальности. Lobby — одинаковая сетка 2×2, баланс/ownership не менялись.
- Финальные `pnpm typecheck`, `pnpm build`, `git diff --check` PASS.
- Полный `pnpm test` с TEST_DATABASE_URL: **108 PASS, 0 fail, 0 skipped** (API 64, web 29, bot 15), включая 22 multiplayer tests и replacement-socket preview regression.
- Four-context browser: **13 scenarios PASS** с Аяжан, actual BUILD/RACE offline/reload, 120ms added RTT у B, touch push/head jump, одинаковыми RESULTS/NEXT, балансом 42 и cleanup. Character Select/Lobby/BUILD/RACE проверены на всех пяти ширинах. Headless FPS 60/60/60/60; реальные телефоны этим не измерены.
- Continuous delayed push: 72 кадра, max frame displacement 5.763 logical px (<8), `latency.json`. Нет повторяющихся крупных телепортаций в проверенном сценарии; произвольная плохая сеть не гарантируется.
- Training browser: **37 development / 34 production PASS**. Multiplayer production: **20 checks PASS**. Все браузеры и fixture APIs корректно закрыты.
- Ошибка persistence LEAVE больше не удаляет physical body до commit. `room-failure.test.ts` сначала воспроизвёл проблему, затем PASS; успешный retry удаляет тело и membership согласованно.
- `pnpm build` оставляет только известное предупреждение размера lazy Phaser chunk. README/design/architecture/art direction/report/manual plan обновлены. Версия UI `v0.6.1.5 Player Interactions + Ayazhan`, root SemVer `0.6.1-5`.
- Остановлены только QA Vite 5186/4186 и отдельный PostgreSQL 55436; production/user services не менялись. Данные test cluster сохранены, reset/delete не выполнялись.

## PARTIAL

Незавершённых задач реализации нет. Проверки используют реальные API/Socket.IO/DB и Phaser, но Telegram SDK в браузерном QA синтетический. Performance и offline/reconnect на настоящих телефонах пока не проверены.

## TODO — только ручная проверка после отдельного разрешения на публикацию

- Два телефона/аккаунта, реальная мобильная сеть и frame rate по плану из отчёта. Deployment в текущую задачу не входит и не выполнялся.
- Новых migrations/env, способностей, экономики или Stage 6.2 нет. Работа остановлена на 6.1.5.

## Ограничения / продолжение

Реальные `.env`, прежняя БД/балансы и production не менялись. Test cluster `/private/tmp/doner-stage6-test-pg`, port 55436, **остановлен**; QA Vite также остановлен. Browser binaries: `/private/tmp/doner-game-playwright`. API integration и browser fixture нельзя запускать одновременно на одной test DB.
Логи `/private/tmp/doner-stage615-*.log`; screenshots `artifacts/stage-6.1.5/`. New browser script — `apps/web/test/browser/interactions.mjs`, fixture — `apps/api/test/browser-server.ts`.
Реальное отключение интернета на телефонах не проверено; потребуется ручной тест после отдельно разрешённого rollout. Один активный API instance остаётся ограничением.
