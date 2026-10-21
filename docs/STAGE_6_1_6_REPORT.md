# Stage 6.1.6 — Network Physics Smoothing & Collision Desync Fix

Версия: **v0.6.1.6 Network Physics Smoothing**, root SemVer `0.6.1-6`. Дата локальной проверки: 2026-10-21. Исходное состояние для сравнения — commit `b51c9e9` (Stage 6.1.5, displayName Ayazhan уже исправлен).

Основная причина регулярного rubber-banding исправлена: согласованы input/ack/replay и перенос игрока на опоре. Обычные толкания заметно плавнее, head-standing сохраняет расстояние 21 px. **Полного устранения всех corrections нет:** неожиданный прыжок нижнего игрока может дать верхнему одиночную коррекцию 16–26 px при RTT 80–150 ms. Это принятое ограничение этого этапа, а не скрытый успешным тестом дефект. По последнему указанию пользователя физика ради него заново не переписывалась.

Git push, production deployment, production migrations и Stage 6.2 не выполнялись. Реальные `.env`, секреты, аккаунты и баланс production не менялись.

## Причины и конкретные исправления

| Причина в исходном коде | Исправление |
| --- | --- |
| `prediction.ts` создавал sequence каждый 60 Hz step, `createGame.ts` отправлял лишь последний input на 20 Hz; `race.ts` держал его несколько ticks и подтверждал sequence после первого применения. Replay трактовал sequence как один шаг | `RaceInputBatch`: последовательные frames, один sequence = один fixed step. Серверная очередь потребляет один frame/tick; ack отражает обработанный frame clock. Клиент удаляет подтверждённые frames и воспроизводит оставшиеся |
| Потерянные между отправками команды и преждевременный ack приводили к повторным коррекциям даже без столкновений | Короткий повторяемый хвост до 6 frames, строгая валидация/deduplication, bounded queue/replay 24 steps. Пропущенный frame использует held intent; поздний новый input сохраняет liveness/edge, не перематывая мир |
| Верхний игрок интегрировал вертикальную скорость опоры и дополнительно получал её смещение | Вертикальный carry применяется один раз; `supportId`, grounded, velocities и jump/coyote/buffer state восстанавливаются из authoritative snapshot |
| Горизонтальный carry использовал положение нижнего до окончательного push/wall resolution | Итоговый горизонтальный перенос применяется снизу вверх по stack с проверкой стен и bounded повторной проверкой контактов |
| `receiveMovement` обнулял smoothing при любом контакте, camera следовала резко исправленному sprite | Отдельный `RacePresentation`: физика исправляется сразу, визуальный offset ≤6 px затухает за характерные 80 ms; camera следует rendered position. Контактная группа разделяет один offset, ограниченный геометрией |
| Remote rendering резко переключался между arrival-based interpolation и predicted contacts | Timestamp buffer 100–200 ms с учётом jitter, монотонный presentation clock, bounded extrapolation ≤66.7 ms. Переход к общей predicted contact timeline плавный |
| Replay предполагал неизменное направление другого игрока на всём горизонте | Remote intent prediction ограничен 12 steps/200 ms, после этого направление нейтральное. Состояние и контакты регулярно сверяются с сервером |

Двойного независимого Phaser/server contact solver **не было**: online Arcade world уже был приостановлен. Training по-прежнему использует Arcade. Collision body 10×21 и artwork 16×24 намеренно различаются; размеры и персонажные параметры не менялись. Старый sequence guard уже существовал; добавлены tick/round guards и диагностика, без приписывания прежнему коду отсутствовавшей ошибки.

Server остаётся authoritative: клиент не отправляет координаты, finish или rank; физика не записывается через SQL. Частоты 60 Hz physics /20 Hz input /15 Hz snapshots сохранены. Размер input payload вырос до нескольких frames для корректного replay и краткой избыточности; частота сообщений не повышена. Protocol 6.1.6 несовместим с input 6.1.5, поэтому API/frontend нужно обновлять согласованно.

## DEV diagnostics

Открыть development frontend с `?netdebug=1`. Overlay показывает RTT, arrival jitter, server tick, snapshot rate, prediction correction error, corrections/sec, largest correction, stale snapshots, estimated missing snapshots и FPS.

Error — расстояние между predicted position до и после authoritative state + unacked replay, то есть сравнение на согласованной временной шкале. Corrections/sec учитывает изменения >0.25 px; явные reset не включаются. Gaps — оценка по server tick, а не доказательство потери TCP-пакетов. История ограничена; только числа, без tokens/identity/URL. Ping отправляется раз в 2 s только DEV-клиентом. Production не создаёт overlay, диагностический ping или DOM metrics, включая URL с `?netdebug=1`. Выход очищает overlay/timers.

## Измерения до/после

### Два реальных Socket.IO clients, детерминированные задержки

`apps/api/test/network-physics.bench.ts` запускает настоящие localhost Socket.IO connections и production `RaceSimulation`/`RacePrediction`/shared solver. Доставка планируется виртуальными шагами 1 ms. Это **не** измерение настоящего интернета, мобильного устройства или видимых кадров.

50 сценариев: 10 действий ×5 профилей. Run, jump, opposing, push, landing, riding, head-jump, wall, placed-block contact, finish после контакта. Каждый сценарий 4 s виртуального времени, finish7 s. Первые 500 ms исключены из correction/frame-step статистики для старта; assertions и симуляция работают с начала. Исходный тест применял существующий sequence guard, поэтому baseline не завышен искусственно старыми snapshots. Крупные события при финише не исключены из таблицы.

| Профиль | Corrections >4 px до → после | Физические steps >8 px до → после | Max raw correction, px до → после |
| --- | ---: | ---: | ---: |
| RTT40 ms | 28 → 4 | 6 → 2 | 17.54 → 14.70 |
| RTT 80 ms | 33 → 4 | 7 → 2 | 19.73 → 17.97 |
| RTT150 ms | 33 → 6 | 9 → 4 | 35.20 → 34.28 |
| RTT 80 ms + jitter | 34 → 6 | 7 → 2 | 30.23 → 31.11 |
| RTT 80 ms + snapshot stall/loss | 45 → 7 | 16 → 4 | 31.28 → 35.60 |
| **Всего** | **173 → 27** | **45 → 14** | **35.20 → 35.60** |

Jitter добавляет `[0,13,-9,27,-15,6]`ms к односторонней задержке. Stall задерживает snapshots дополнительно 180 ms в окне 1800–2050 ms; каждый 11-й snapshot пропускается. Порядок доставки может меняться. После warm-up в run/jump/opposing/push/landing/head-jump/wall нет corrections >4 px. Остаточные corrections относятся к reversal опоры/placed block и server finish acknowledgement. Во всех 5 профилях оба игрока достигли авторитетного finish.

Без finish scenarios: corrections >4 px **114 →16**, physical steps >8 px **21 →4**, maximum raw error **26.67 →22.50 px**. Наибольший среди сценариев p95 correction error **7.35 →0.42 px**. Максимум отдельной коррекции всей выборки не улучшился: **35.60 px** после изменений, включая подтверждение finish. Эти числа не названы visible snap counts.

### Реальные browser frames

Одинаковый существующий `test:interactions` до/после: четыре независимых Chromium contexts390×844; клиент B получает дополнительно 60 ms в каждую сторону. Измерены 72 кадра при horizontal push, а не видеозапись телефона.

| Метрика | До | После |
| --- | ---: | ---: |
| Максимальный видимый X step за кадр | 6.3538 px | 1.6315 px |
| X steps >4 px | 2 | 0 |
| X steps >8 px | 0 | 0 |
| FPS четырёх contexts | 60/60/60/60 | 60/60/60/60 |

Отдельный новый `test:network` использует два браузера, настоящие wall-clock задержки на **обоих** connections и реальные packets. Проверяет opposing/push, landing, moving/jumping support, первый head jump, overlay и cleanup.

| Добавленный RTT на каждый client | Измеренный RTT A/B | Max visible step при push | Max visible step верхнего при движении/прыжке опоры |
| --- | --- | ---: | ---: |
| 40 ms | 43/44 ms | 1.36 px | 5.49 px |
| 80 ms | 83/98 ms | 1.50 px | 16.22 px |
| 150 ms | 154/153 ms | 2.43 px | 25.80 px |
| 80 ms + jitter | 67/78 ms | 1.50 px | 22.45 px |
| 80 ms + stall/loss | 84/84 ms | 1.69 px | 20.55 px |

FPS≈60 во всех пяти профилях. Head-standing gap 21 px с floating-point epsilon. Stall/loss зафиксировал по 2 stale snapshots и по 11 estimated gaps на client. Измерения RTT — отдельные значения overlay, а не гарантированные минимум/среднее. При jitter обе половины RTT могут сокращаться, поэтому RTT ниже nominal80 ms допустим.

**Ограничение 16–26 px остаётся:** неожиданный jump нижнего меняет состояние опоры раньше, чем второй клиент получает событие. Верхний сохраняет контакт, но сверка положения может дать одиночный заметный шаг (при 150 ms в окне были 3 steps >8 px). Нельзя обещать, что каждый прыжок опоры теперь визуально плавный. Offset не увеличен до расстояния в несколько тел ради скрытия этого события. Обычные contacts и физический support исправлены отдельно от presentation; risky rewrite не выполнялся.

Локальные артефакты в `artifacts/stage-6.1.6/`: `network-before.json`, `network-after.json`, `browser-before-latency.json`, `browser-after-latency.json`, `browser-*-performance.json`, `browser-network.json`, screenshots. Папка artifacts намеренно gitignored; измерения сведены в этот versioned отчёт. Benchmark и browser scripts сохранены в исходниках.

## Завершённые проверки

Тестовая PostgreSQL: **doner_stage616_test**, localhost:55436, отдельный fixture user. До заключительных запусков проверены доступность DB, наличие 3 существующих migrations, HTTP200 DEV:5186 и preview:4186. API fixture:3014 запускают/останавливают browser scripts; два RoomManager против одной test DB одновременно не запускались.

| Проверка | Итог |
| --- | --- |
| Training DEV (`test:browser`) | PASS 37 checks |
| Training production preview (`test:browser`, production=1) | PASS 34 checks |
| Multiplayer DEV (`test:party`) | PASS 20 checks |
| Multiplayer production preview (`test:party`, production=1) | PASS 21 checks, включая отсутствие DEV overlay/DOM metrics |
| Multiplayer interactions DEV (`test:interactions`) | PASS 13 scenarios, четыре персонажа/contexts, B+120 ms |
| Multiplayer delay DEV (`test:network`) | PASS 5 profiles, два contexts |
| Socket.IO benchmark (`test:network-bench`) | PASS 50 scenarios с regression assertions |
| `pnpm typecheck` | PASS, заключительный запуск |
| `pnpm build` | PASS, заключительный запуск; прежнее предупреждение Phaser chunk >500kB |
| `pnpm test` | PASS: 119 tests, skipped 0, заключительный запуск |
| `git diff --check` | PASS |

Автоматические тесты: API 75, web 29, bot 15. Добавлены 2 support physics regressions и 9 networking regressions; 20 подтестов в двух существующих Socket.IO integration scenarios адаптированы к пакетам без удаления проверок. Охвачены payload validation, FIFO/dedupe/ack, stale/late inputs, timeout, reconnect, replay/support state, history bounds, interpolation/jitter/extrapolation, render bounds/walls/FPS independence и numeric diagnostics.

Browser QA сохраняет Telegram auth/JWT (для multiplayer — настоящий API, test initData подписан fixture), четыре персонажа и Ayazhan, Lobby/Ready/BUILD previews, RACE, одинаковые RESULTS, NEXT с persistent placements, actual offline/reconnect/refresh, native touch/cancel, Telegram BackButton и неизменный Doner. Training HTTP ответы синтетические; это отдельный тест local game. Production fake-auth endpoints не добавлены.

При продолжении не было журналов завершения прерванных Training/production запусков: они **не считались PASS**, а выполнены заново. Успех записан только после exit 0 и итоговой строки PASS. Логи заключительных команд — `/private/tmp/doner-stage616-final-*.log`, browser — `/private/tmp/doner-stage616-{training,party}-{dev,prod}.log`.

После проверки остановлены только собственные Vite5186, preview4186 и тестовый PostgreSQL55436; fixture API3014 завершили scripts. Данные test cluster и artifacts сохранены. Пользовательские процессы не останавливались.

## Migrations и environment

**Новых migrations и env variables нет.** Prisma schema, existing migrations, настоящие `.env`, bot configuration, character sprites/colors/abilities/physics constants, карты, Doner economy и магазин не менялись. Три существующие migrations были применены только к отдельной тестовой DB. В уже работающей Stage 6.1.5 БД переинициализировать ничего не требуется.

DEV query `netdebug=1` — необязательный URL flag, не новая env variable. QA build использует временный `VITE_API_URL=http://127.0.0.1:3014` только в environment команды; этот локальный bundle нельзя загружать в production.

## Точный порядок будущего deployment — не выполнялся

Инструкция рассчитана на существующие Railway API/PostgreSQL, Vercel web и того же Telegram Bot. Публичные domains и секреты здесь не выдумываются: использовать уже настроенные значения проектов. Изменений бота для 6.1.6 не требуется.

1. Просмотреть diff и этот отчёт, выбрать один commit для API и web. Commit/push выполняет владелец при решении публиковать. Если push автоматически запускает Vercel, заранее отложить promotion frontend до готовности API. Открытые клиенты 6.1.5 несовместимы с пакетным input 6.1.6; запланировать короткое обслуживание и обязательный reload Mini Apps.
2. Сохранить текущие deployment identifiers и обычный backup production DB для rollback. Не переносить test DB/test initData/localhost URL в production. Использовать Node 24 (>=24.11,<25) и pnpm 10.34.6 из `packageManager`.
3. В существующем Railway API сохранить `DATABASE_URL`, `BOT_TOKEN`, `JWT_SECRET`, `BOT_USERNAME`, `CORS_ORIGINS`, `TRUST_PROXY_HOPS`, `TELEGRAM_INIT_DATA_MAX_AGE_SECONDS`, Railway `PORT` и domain. `NODE_ENV=production`. В CORS должен оставаться точный HTTPS origin существующего frontend. Новых переменных не добавлять ради этой версии.
4. API build из корня monorepo:

   ```bash
   pnpm install --frozen-lockfile --prod=false
   pnpm build:api
   ```

   Существующий pre-deploy hook `pnpm db:deploy` можно сохранить: для актуальной 6.1.5 schema ожидается отсутствие новых migrations. Отдельная ручная migration для 6.1.6 не нужна. Если hook обнаруживает ошибку/неожиданную старую schema, rollout остановить; не применять `migrate reset`/`db push`.
5. **До старта нового API остановить старый активный deployment и убедиться, что старый процесс больше не работает.** Нужен один активный RoomManager: replicas=1 само по себе не гарантирует отсутствие overlap во время обновления. Сначала допустима сборка, затем короткое окно без serving, затем новый start. Активный RACE при restart безопасно станет RESULTS/ABORTED для незавершивших; placements и принятые finishes сохранятся.
6. Запуск API из корня:

   ```bash
   pnpm start:api
   ```

   API слушает `0.0.0.0:$PORT`. Проверить `GET <существующий HTTPS API origin>/health` → `{"status":"ok"}`. REST и `/socket.io/` обслуживаются тем же domain/port; новый realtime service не создавать.
7. После готовности API собрать **тот же commit** в существующем Vercel project. Root Directory — корень monorepo; install `pnpm install --frozen-lockfile`; build `pnpm build:web`; Output Directory `apps/web/dist`. Сохранить существующий build-time `VITE_API_URL=<HTTPS origin Railway API>`, Node 24 и текущую настройку Corepack. Не загружать `apps/web/dist` от локального QA — Vercel должен собрать bundle со своим production URL.
8. Опубликовать этот frontend, полностью закрыть и заново открыть Mini App на обоих аккаунтах. Footer должен показывать `v0.6.1.6 Network Physics Smoothing`. Существующий BotFather Main Mini App HTTPS URL сохраняется. Убедиться в работе `/auth/telegram`, `/me` и socket connection; успешный `/health` отдельно не доказывает работу multiplayer.
9. Выполнить ручной сценарий ниже. При необходимости отката откатывать **API и web вместе** на совместимую пару, снова без overlap API и с reload Mini Apps. БД/таблицы/placements ради отката приложения не удалять.

## Ручная проверка двух телефонов — ещё не выполнена

После отдельно разрешённого deployment использовать два **разных Telegram accounts**, желательно iOS+Android. Проверить сначала одну Wi-Fi сеть, затем Wi-Fi+mobile internet. Записать device/OS/Telegram version/network, исходный Doner/Golden Doner, результат каждого шага; не записывать initData/JWT.

1. Открыть Mini App, проверить версию, auth/профиль, четыре персонажа и точное имя Ayazhan. Создать комнату 2, присоединиться по invite/code, выбрать разных героев, нажать READY.
2. В BUILD двигать/отменять preview на A и наблюдать owner/validity на B. Поставить по блоку. Проверить одинаковую карту и переход RACE.
3. На свободном участке пробежать/прыгнуть отдельно, затем бег навстречу, длительное толкание, stop/reverse, толкание у стены и построенного блока. Проверить отсутствие регулярного отбрасывания и прохода через стены на обоих экранах.
4. Приземлиться на голову; нижний идёт и меняет направление, верхний стоит. Проверить устойчивость расстояния и первый jump с головы. Отдельно неожиданно прыгнуть нижним: возможна документированная одиночная коррекция 16–26 px, регулярная потеря support/дрожь не считается нормой. Проверить одновременные прыжки.
5. Пройти finish обоими: одинаковый серверный порядок RESULTS; NEXT сохраняет блоки. На B кратко отключить сеть, вернуть, затем reload: та же комната/seat/round, без дубликата игрока. Проверить BUILD reconnect отдельно.
6. Проверить touch multi-input/release/cancel, pause/background, Telegram BackButton → остаться/выйти, Training BUILD/RACE/RESULTS/NEXT. Сверить Doner/Golden Doner с исходным состоянием.

Headless Chromium FPS не является FPS телефона. Реальная мобильная сеть, Telegram WebView, энергосбережение и четыре физических устройства этим локальным QA не подтверждены. Другие сохраняющиеся ограничения: один API instance, отсутствие rollback/lag compensation, возможные corrections при длительных stalls/finish, до 300 ms без input до отключения контакта зависшего клиента.
