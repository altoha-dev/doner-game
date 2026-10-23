# Stage 6.3 — Doner Economy & Trap Shop

Версия: `v0.6.3 Doner Economy & Trap Shop`. Финализация: **2026-10-23**. Stage6.3 завершён и **READY для локальной разработки Stage6.4**; Stage6.4 не начат. Предыдущая разработка шла с незакоммиченным Stage6.2, но после перерыва GitHub уже содержит общий commit `af126c7` с обоими этапами. В этой сессии изменена только документация; commit/push/deployment/production migrations/reset не выполнялись. Реальные `.env` не изменялись. Все SQL-проверки выполнены только на изолированной localhost PostgreSQL. Подтверждённые публикации и неизвестные состояния production перечислены ниже.

## Состояние до продолжения и завершённая работа

До возобновления уже существовали цены/два слота, атомарная покупка с ledger, persisted settlement, накопительный score, магазин/RESULTS, пять раундов и разделённая победа. Эти решения сохранены. Продолжение завершило интеграционные и браузерные проверки, совместимость миграций и эксплуатационную документацию. При финализации повторно изучены сохранённые логи и JSON, выполнена оставшаяся SQL-проверка; тяжёлые тесты без изменения кода повторно не запускались.

Ключевые файлы: `packages/shared/src/economy.ts`, `traps.ts`, `online.ts`, `party.ts`; `apps/api/prisma/schema.prisma`, новая economy migration; `apps/api/src/multiplayer/{economy,store,manager,socket,previews,race}.ts`; `apps/web/src/{GameScreen,PartyScreen,App,usePlayerAuth}.tsx/ts`, `game.css`; economy unit/integration/migration/browser tests и обновлённые прежние regression scripts. Изменения физики/ловушек Stage6.2 уже присутствовали до этого продолжения и сохранены.

Точечные исправления: PENDING settlement не теряется при истечении комнаты во время retry backoff; RESUME освежает баланс без лишнего изменения revision; свой preview очищается после собственного placement, чужой placement только перевалидирует его; недоступные платные карточки не получают ошибочную ARIA-цену «бесплатно». Прежние сценарии с одним блоком теперь явно завершают BUILD через SKIP после бесплатного блока и проверяют баланс с учётом ledger. Тесты не удалены.

## Начисление, защита от повторов и покупки

Один существующий `PlayerProgress.doners`. `goldenDoners`, campaignStage, ownership и выбранный персонаж не переписываются. Runtime цены и награды централизованы в shared/economy.ts.

| Серверное место | Очки матча | Doner |
| --- | ---: | ---: |
|1|3|0|
|2|2|1|
|3|1|2|
|4+|0|3|
|DNF / не играл|0|0|

Нужны минимум два разных authenticated аккаунта, подключённых к началу RACE и отправивших принятый свежий input с движением/прыжком. Training и solo/idle не награждаются. После restart незавершённый RACE получает ABORTED и весь прерванный раунд не оплачивается. Финиш/место вычисляет сервер из авторитетной физики; клиент не отправляет награды, цену, slot или баланс.

RESULTS сохраняет PENDING. В одной SQL transaction с блокировками Room → MatchRound обновляются ledger, баланс, RoundFinish rewards, RoomPlayer.score и SETTLED. Unique reward key и отдельный unique index(room,round,user) исключают второе начисление; winner amount0 также записывается. Повторный SETTLED — no-op. Ошибка откатывает transaction целиком, оставляет PENDING; сервер повторяет через2s, в том числе после restart. NEXT недоступен до подтверждения. UI показывает ожидание и только подтверждённые суммы.

Покупка: в одной transaction выполняются Room revision CAS, проверка persisted slots, conditional debit `doners >= cost`, ledger и placement. При ошибке любой записи всё откатывается; публикуется только committed snapshot. Unique placement ID/ledger key делают lost ACK и повторную доставку безопасными. Даже при конкурентном списании другим существующим endpoint баланс не уходит ниже0. Preview/cancel/invalid/stale request не списывают деньги. Повтор с тем же ID и иным содержимым отклоняется.

| Выбор | Цена | Завершение BUILD |
| --- | ---: | --- |
|Первый BASIC BLOCK|0|Остаётся выбор EXTRA или завершения|
|EXTRA BLOCK после BASIC|1|Ход завершён|
|FAN в первом слоте|2|Ход завершён|
|CROSSBOW в первом слоте|3|Ход завершён|

Максимум два basic placements за раунд; FAN/CROSSBOW не совмещаются с EXTRA. SKIP/таймаут не покупают дополнительный блок. Общий лимит карты20 объектов сохранён независимо от двух слотов. Недостаточный баланс блокирует платную карточку, бесплатный первый блок остаётся доступным. Training: все три типа бесплатны, надпись TRAINING MODE — NO REWARDS.

## Матч, сохранённые возможности

Пять раундов, после пятого RESULTS host завершает матч. Score хранится отдельно от денег в RoomPlayer и суммируется между раундами. Максимум определяет победителя; равный максимум — общая победа, нулевые очки у всех — без победителя. Полностью закрытый матч больше не является active room: reload возвращает Home, история сохраняется в SQL.

Сохранены Altoha, Aigerim, Temik, Ayazhan, Lobby, live previews, RACE/RESULTS/NEXT, reconnect, серверные контакты/толкания/head-standing, FAN/CROSSBOW/respawn и Training. В RaceSimulation добавлен только возврат признака принятого input для однократной записи активности; solver/параметры движения Stage6.1.6 не переписывались. Нет SQL на каждом физическом тике.

## Миграции и старая БД

Все пять migrations:

1. `20261012000000_init`
2. `20261013000000_selected_character`
3. `20261020000000_party_rooms`
4. `20261021000000_trap_orientation` — предыдущий Stage6.2.
5. `20261022000000_doner_economy` — ledger, slot/cost, settlement/participation, score/rewards.

Новая migration не обнуляет/не пересоздаёт User или PlayerProgress. Старые rounds получают LEGACY и не награждаются задним числом, старые placements — slot1/cost0. Unique room/round/user заменён на room/round/user/slot; добавлены ограничения ledger/slot/cost.

Проверены две новые тестовые БД на127.0.0.1:55436: `doner_stage63_test` (все migrations с нуля) и `doner_stage63_upgrade_test` (сначала только три старые migrations, затем заполнение synthetic User/PlayerProgress/Room/placement, затем pending6.2+6.3). Upgrade test сохранил Doner17, Golden9, campaign4 и selectedCharacterId; old round LEGACY, ledger пуст, placement сохранён. Ни reset, ни production DATABASE_URL не использовались. Скрипт `apps/api/test/migration-upgrade.mjs` требует новую пустую localhost `*_upgrade_test`; существующую БД для повторного запуска не очищать.

### SQL-проверка после перерыва

Сохранившаяся `doner_stage63_upgrade_test` на127.0.0.1:55436 проверена через `psql -X`, `BEGIN READ ONLY` и SELECT. Существующий fixture User `aa000000-0000-4000-8000-000000000001`, Telegram ID6000000000000001, имя Legacy user сохранён. Его PlayerProgress: Doner17, Golden9, campaignStage4, selectedCharacterId=temik — точно как до upgrade. Сохранился legacy-placement с orientation=none, slot1, cost0; MatchRound=LEGACY; ledger_rows=0.

Все5 migrations имеют finished_at, не имеют rolled_back_at и применены в порядке списка выше: первые три22 октября10:10:25+05, trap_orientation10:10:26.271356+05, doner_economy10:10:26.273631+05. На проверенной upgrade-test БД **ожидающих миграций нет**. Никаких User/PlayerProgress/balance writes, reset или повторного migration deploy в этой финализации не выполнялось. Production DB не читалась и не менялась; её pending migrations по тестовой БД определить нельзя. После проверки остановлены собственные QA web-сервисы5186/4186 и test PostgreSQL; данные в `/private/tmp/doner-stage6-test-pg` сохранены.

## Проверки

| Проверка | Подтверждённый результат |
| --- | --- |
| typecheck / build | PASS последовательно; web пересобран после последних подсказок |
| pnpm test с test PG | PASS145: API101/web29/bot15, skipped0 |
| Миграции fresh / legacy upgrade | PASS на двух отдельных test DB |
| Economy browser DEV / production preview | PASS в обоих режимах, полный матч5 раундов,2 клиента |
| Training regression | PASS DEV37 / production34 |
| Multiplayer regression DEV / production | PASS20 /21 |
| Interactions DEV | PASS13,4 клиента |
| Training traps DEV / production preview | PASS в обоих режимах |
| Network browser DEV | PASS5 profiles:40/80/150ms,jitter,stall-loss |
| Trap browser DEV | PASS40/80/150ms после исправления reconnect barrier |
| Trap browser production preview | PASS80ms |
| Network physics benchmark | PASS50; все числовые results совпали со Stage6.2 |
| FAN/CROSSBOW benchmark | PASS15; все числовые results совпали со Stage6.2 |
| SQL-проверка после перерыва,2026-10-23 | PASS, только READ ONLY на localhost upgrade-test |
| git diff --check | PASS при финализации |

8 новых economy integration scenarios проверяют valid/invalid/free/paid/extra, preview/cancel, конкурентные запросы и profile debit, повторный ACK, четыре реальных input-финиша, Golden preservation, потерянный ответ/restart, полный rollback placement после debit, полный rollback reward и durable retry. Fake reward/price/slot/client results отклоняются unit-проверками.

Economy browser использует real HTTP auth/JWT/API/PG/Socket.IO и два отдельных Chromium mobile contexts; только Telegram SDK/initData — synthetic fixtures. Присылает каждый настоящий PLACE повторно через WebSocket, затем сверяет SQL:5 placements,3 purchase ledger rows,8 reward rows (включая четыре0 winner), всего11 unique keys. Счёт по раундам3:2 →6:4 →8:7 →10:10 →10:10; пятый раунд оба DNF, итог общая победа. Начальные балансы5/0, конечные2/1, Golden7/7. Widths320/375/390/430/500, без overflow, кнопки≥44px; screenshots просмотрены.

Первые попытки не считаются PASS: старые tests предполагали auto-end после basic; первый browser fixture выбрал запрещённый y160, затем имел недетерминированный порядок финишей по задержке. После исправления сценариев реальные игроки проходят по очереди с native input. Первый trap browser run прошёл40ms, но получил finish timeout80ms: reconnect barrier допускал старый snapshot и управление могло начаться до завершения ready effects. После ожидания нового snapshot и двух animation frames полный DEV run40/80/150 прошёл. Физика по этому тестовому сбою не менялась. Первый одновременный build/typecheck столкнулся на Prisma generate (EEXIST); оба повторены последовательно. Все перечисленные финальные runs завершились. Сохранённые логи: `artifacts/stage-6.3/logs/`; economy JSON/screenshots: `development/` и `production/`; numeric JSON: `network-regression.json`, `trap-network.json`. В финализации2026-10-23 повторно проверены все PASS-логи и точное совпадение50+15 numeric results с baseline Stage6.2. Игровой код соответствует проверенному `af126c7`; незавершённых TODO/FIXME в runtime не найдено.

## Ограничения

- Два настоящих телефона, реальные Telegram accounts/Internet, safe areas и фон приложения требуют ручного smoke. Chromium mobile contexts с signed fixture auth не заменяют телефоны.
- Один активный API instance. CAS/ledger защищают транзакции, но распределённого room ownership нет. Общая очередь и lifecycle SQL ограничивают масштаб; нагрузки production не измерялись.
- Два друга могут договориться о финишах и копить Doner. Разные IDs, факт участия, DNF0 и серверный finish предотвращают простые подделки, но не сговор/несколько аккаунтов. Суточные лимиты, device/IP anti-farm, платёжная система не добавлялись.
- Известная коррекция верхнего игрока16–26px при неожиданном прыжке опоры и RTT80–150ms сохраняется. Это не верхняя граница любого visible frame step. В текущем browser run максимальный rendered frame step при прыжке опоры27.12px (включает обычное движение плюс коррекцию), при push≤1.92px; head-standing21px. Side FAN в прежнем стенде давал единичную raw correction12.11px при150ms. Геометрический guard не доказывает динамическую проходимость комбинаций ловушек.
- Restart прерывает активный RACE; projectiles/позиции не восстанавливаются из SQL. Training локален. Завершённые SQL rows не имеют автоматической retention policy. Временные sprites и прежнее предупреждение Vite о lazy Phaser chunk >500kB сохранены.

## GitHub и фактическая публикация — аудит2026-10-23

На входе рабочее дерево было чистым. `git branch --show-current`=main, HEAD и cached origin/main=`af126c74a2ba502530b47db2f8874a3685903cdc`. Независимое чтение `git ls-remote origin refs/heads/main` подтвердило этот же SHA на GitHub; факт push не выведен только из локального tracking ref.

| Этап / среда | Фактическое состояние |
| --- | --- |
| Stage6.1.6 | Commit9448612, предок GitHub main; локальные regressions сохранены |
| Stage6.2 | Включён в общий commitaf126c7 (traps,orientation migration,tests,report); отдельного6.2 commit нет |
| Stage6.3 | В том же af126c7: ledger/shop/rewards/score/slots и tests; опубликован в GitHub main |
| Vercel Stage6.1.6 | GitHub deployment7231813522: Production,9448612,success2026-10-21T16:47:18Z |
| Vercel Stage6.2+6.3 | GitHub deployment7257499810: Production,af126c7,success2026-10-22T16:19:34Z; это реальная запись провайдера, не localhost preview |
| Railway API | Последняя доступная запись7217390126: environment `exciting-determination / production`, commitb51c9e9,success2026-10-21T04:06:03Z. Deployment API6.1.6–6.3 не подтверждён. Отсутствие записи не доказывает отсутствие ручного deployment |
| Production Prisma | Не проверялась и не менялась. Нельзя утверждать, что orientation/economy уже применены или точно ожидают применения |
| Локальные изменения после финализации | Только README.md,docs/STAGE_6_3_PROGRESS.md,docs/STAGE_6_3_REPORT.md; не закоммичены и не отправлены |

Источники: [GitHub main commit](https://github.com/altoha-dev/doner-game/commit/af126c74a2ba502530b47db2f8874a3685903cdc), [список deployments](https://api.github.com/repos/altoha-dev/doner-game/deployments?per_page=10), [Vercel6.3 status](https://api.github.com/repos/altoha-dev/doner-game/deployments/7257499810/statuses), [Vercel6.1.6 status](https://api.github.com/repos/altoha-dev/doner-game/deployments/7231813522/statuses), [последний Railway status](https://api.github.com/repos/altoha-dev/doner-game/deployments/7217390126/statuses). Deployment URL из Vercel status: https://doner-game-h1q5785hl-altoha.vercel.app. Маршрут текущего BotFather/production alias и end-to-end работу нового web со старым/новым API этим metadata audit не проверяли.

**READY относится к дальнейшей локальной разработке**, а не к подтверждённой работоспособности всего production. Перед публичным тестированием нужно отдельно сверить Railway deployed SHA, выполнить migration status в целевом окружении, при необходимости согласованно обновить API/web и пройти smoke на двух телефонах. Для этого здесь не выполнялись production операции.

План Stage6.4 без начала реализации:1) согласовать конкретный scope и критерии приёмки;2) перед тестированием на телефонах подтвердить согласованные API/web/schema;3) выполнять изменения небольшими порциями, сохраняя145 tests и regression экономики/контактов. Полный тяжёлый browser набор повторять при затрагивании соответствующего поведения.

## Environment и безопасное применение после восстановления Railway

Новых runtime env variables нет. Сохраняются DATABASE_URL, BOT_TOKEN, BOT_USERNAME, JWT_SECRET, CORS_ORIGINS, PORT и production VITE_API_URL. TEST_DATABASE_URL, TEST_UPGRADE_DATABASE_URL, BROWSER_* и NETWORK_BENCH_OUTPUT используются только локальными проверками; production их не требует.

Следующие действия — инструкция для отдельной будущей разрешённой синхронизации production. Vercel уже имеет успешный6.3 deployment по metadata выше; не считать API/schema автоматически обновлёнными. В этой сессии действия ниже не выполнялись:

1. Проверить окончательный diff/report; сделать backup текущей PostgreSQL и проверить его восстановление в отдельном staging. Убедиться, что DATABASE_URL целевого окружения указывает на прежнюю пользовательскую БД; сравнить migration status и контрольные профили/балансы. Не публиковать автоматически web раньше API/schema.
2. Завершить активные матчи и выделить окно обслуживания. Остановить прежний API до старта нового: один RoomManager, без rolling overlap. Обычные environment variables/домены/бот сохраняются.
3. В исходниках этой версии собрать API: `pnpm install --frozen-lockfile --prod=false`, затем `pnpm build:api` (Node24, pnpm10.34.6). Сохранить dev dependencies для Prisma CLI migration hook.
4. В целевом окружении выполнить `pnpm --filter @doner-game/api exec prisma migrate status`, затем **`pnpm db:deploy`** и снова status. Команда применяет все ожидающие migrations по порядку, включая trap_orientation и doner_economy; не применять только последнюю вручную. Если ранние migrations ещё ожидают, они также должны примениться. Не использовать reset, db push или ручное удаление таблиц. При ошибке остановить rollout и диагностировать migration history, не продолжать запуск несовместимого API.
5. Запустить один API: `pnpm start:api`; проверить `/health`, Telegram login, `/me`, старые балансы, новую комнату и Socket.IO на прежнем API domain. `/health` — liveness, поэтому отдельно нужна реальная auth/DB/room проверка.
6. В существующем Vercel project собрать web с сохранённым **production VITE_API_URL**: install `pnpm install --frozen-lockfile`, build `pnpm build:web`, output `apps/web/dist`. Локальный QA dist содержит127.0.0.1:3014 и для публикации непригоден. Root monorepo/Node24 остаются по текущему hosting contract.
7. Перезагрузить открытые Mini Apps, проверить footer v0.6.3. Старый frontend6.2 обещает бесплатные ловушки и не показывает settlement/EXTRA; API и web обновлять согласованно. BotFather URLs и polling-бот не требуют изменения.
8. Пройти сценарий с другом ниже. При проблеме остановить новые матчи, сохранить ledger/профили и предпочесть roll-forward. Не откатывать на старый API с активной экономикой: он не умеет два slots/settlement и может рассинхронизировать историю. Не удалять ledger и пользовательские данные ради отката.

## Ручная проверка с другом

Два Telegram account, желательно iOS+Android и разные сети; записать Doner/Golden до начала.

1. Создать/join комнату, выбрать разных героев (включая Ayazhan), READY/START. Проверить цены и оба live previews: перемещение, поворот, отмена без списания.
2. Игрок с достаточным балансом ставит FAN; деньги уменьшаются ровно на2 после подтверждения. Второй ставит бесплатный BLOCK, затем EXTRA за1 или завершает ход. Проверить недостаточный баланс и запрещённое место.
3. Отключить/включить сеть сразу после покупки и reload: одна ловушка/одно списание. Проверить CANCEL, double tap и stale placement. Потрогать FAN, CROSSBOW, respawn, толкания и head jumps, native multi-touch и pointer cancel.
4. Оба действительно двигаются и финишируют по очереди. RESULTS у обоих одинаковы: первый+3points/+0Doner, второй+2/+1. Следующий раунд сохраняет объекты и score. Купить CROSSBOW за3. Проверить DNF0.
5. Пройти все5 раундов и завершить матч. Сверить scoreboard/победителя (при равенстве — общая победа), итоговый Home баланс и неизменный Golden. Шестого раунда нет.
6. Training со всеми типами: бесплатно и NO REWARDS. Telegram BackButton, background/resume, safe areas, клавиши/два пальца; новая комната начинается пустой. Записать устройство/OS/Telegram/network и шаг ошибки без token/initData.
