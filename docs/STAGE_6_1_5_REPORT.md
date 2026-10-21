# v0.6.1.5 Player Interactions + Ayazhan

Продолжение прерванной реализации, 21 октября 2026. Рабочие изменения сохранены, дублирующих систем не создано. Stage 6.2 не начат. Production, реальные `.env`, bot settings и существующие балансы не изменялись; push/deployment/reset/production migrations не выполнялись.

## 1. Что было готово

Stage 6.1 сохранял auth/JWT, комнаты 2–4, invitations, READY, server phases, placements/results/NEXT, reconnect и training. В незакоммиченных изменениях 6.1.5 уже были shared AABB solver, server race simulation, input events, prediction/reconciliation, ephemeral live previews и BUILD HUD. Проходили 20 Socket.IO checks и прежний двухраундовый browser scenario. Отката этих изменений не было.

## 2. Что оставалось

Довести новый четырёхклиентский browser scenario до конца, проверить реальные контакты/переподключения, обновить версию и документацию, выполнить полную регрессию. Новое уточнение добавило `ayazhan`, четыре карточки/спрайта и свободный выбор для training/rooms.

## 3. Что завершено

Существующая реализация прошла настоящие Socket.IO/DB тесты и браузерные контакты, BUILD/RACE offline/reload, RESULTS/NEXT. Исправлен reset preview sequence при замене socket того же аккаунта; добавлен regression. Ошибка persistence LEAVE теперь сохраняет physical body до успешного commit; fault-injection test сначала воспроизвёл проблему, затем прошёл после исправления. Fixture seed больше не расходует HTTP auth rate budget, а delayed JOIN тест ждёт ack; production rate limits сохранены. Finish footprint использует общий body. Четвёртый персонаж интегрирован, документация описывает фактическую реализацию.

## 4–7. Коллизии, push, head jump, синхронизация

- `packages/shared/src/physics.ts`: общая config `PLAYER_PHYSICS`, чистый fixed-step 60 Hz solver; body 10×21, speed 100, gravity 660, jump 224.
- `apps/api/src/multiplayer/race.ts`: authoritative world, input only, round/sequence checks, snapshots 15 Hz. `race:move` не обрабатывается. Сервер рассчитывает контакты и finish, не пересылает доверенные клиентские координаты.
- Swept collisions с geometry/установленными блоками и границами; итеративное разрешение пар в стабильном seat order. Встречные игроки сопротивляются. Стоящего игрока можно толкать до 36px/s; стены ограничивают перемещение. Импульсы не накапливаются от повторных пакетов.
- Приземление сверху назначает supportId; верхний игрок временно стоит на голове и переносится движением опоры. Прыжок с головы добавляет 12px/s к jump; потолок ограничивает подъём. Нет способностей персонажей.
- Клиент `multiplayer/prediction.ts` использует тот же solver, replay неподтверждённых inputs и reconciliation. Далёкие actors интерполируются, ближайшие контакты используют predicted world. Небольшие поправки сглаживаются, большие/reconnect/контактные применяются сразу.
- Input expiry 300ms исключает зависшее тело из контактов; gravity продолжает действовать. После reconnect восстанавливаются authoritative state/sequence. Server event IDs управляют короткими pixel impacts, reduced motion их отключает.

## 8–9. Live BUILD preview и владелец

Существующий Socket.IO передаёт `build:preview` до 12 Hz, с heartbeat 500ms. Сервер проверяет trusted userId, membership/phase/round/sequence, тип объекта и позицию; рассчитывает validity общей placement validation. Broadcast `build:previews` адресован только room members; preview не меняет geometry, revision или PostgreSQL.

Ghost полупрозрачный, окрашен по seat владельца, подписан Telegram display name и ✓/×. Invalid имеет красные рамку/текст. Confirm создаёт реальный блок и убирает ghost, одновременно пересчитывая чужие previews. Cancel, SKIP, disconnect/LEAVE, конец BUILD и TTL 1800ms удаляют ghost. Reconnect получает свежие previews друзей.

BUILD HUD: ВЫБИРАЕТ БЛОК, ВЫБИРАЕТ МЕСТО, ПОСТАВИЛ БЛОК, ПРОПУСТИЛ, ОТКЛЮЧЁН. Статусы выводятся из текущих room/placement/presence/preview данных; отдельной DB модели нет.

## 10–13. Аяжан, каталог, UI, Phaser, сеть

`packages/shared/src/characters.ts` содержит Altoha/`altoha`, Aigerim/`aigerim`, Temik/`temik`, Аяжан/`ayazhan`. Старые IDs и names сохранены. Новый order=3, unlockCost=0, starter=false сохраняет прежний единственный starter и не переписывает ownership. Description нейтральное, способность TBD.

`CharacterSelect.tsx` показывает четыре одинаковые карточки. В training каждый доступен независимо от legacy ownership. Выбор для training живёт в текущем приложении; уже owned персонажи дополнительно сохраняются прежним защищённым select API. Locked персонажи не вызывают select/unlock. Reload возвращает исходный сохранённый profile selection, покупки/балансы не изменяются.

`PartyScreen.tsx` уже отображал общий catalog; теперь Lobby автоматически показывает четыре варианта в сетке 2×2 (`party.css`). Имя персонажа в participant card/HUD берётся из того же catalog. CHARACTER валидируется через getCharacter, хранится существующим RoomPlayer.chosenCharacterId, публикуется snapshot и восстанавливается после reconnect. Все room characters бесплатны; одинаковые варианты у нескольких игроков разрешены.

`PixelArt.tsx`, `game/playerVisual.ts`, `game/textures.ts` добавляют оригинальные временные portrait/texture: тёмно-сиреневый #7962b5, голубой #99e6f3, шарф и полоска/помпон шапки. Это условный образ, не реконструкция человека без референса. Существующие четыре кадра 16×24 (idle, два run, air), origin/animation/body общие. Phaser создаёт `winter-player-ayazhan` и для local, и для remote actor; над sprite — имя Telegram-пользователя, а не имя персонажа.

Другие изменённые UI файлы: `App.tsx` (training selection/version), `styles.css` (uppercase cards), `GameScreen.tsx` (live preview/status), `game/createGame.ts` и `multiplayer/connection.ts` (существующий network renderer/transport). Дублирующего движка нет.

## 14–15. Проверки

| Проверка | Результат |
| --- | --- |
| `pnpm typecheck` | PASS |
| `VITE_API_URL=http://127.0.0.1:3014 pnpm build` | PASS; только известное предупреждение lazy Phaser chunk >500 kB |
| `TEST_DATABASE_URL=…/doner_stage615_test pnpm test` | 108 PASS: API 64, web 29, bot 15; 0 fail, 0 skipped |
| Shared physics | 5 tests: встречное движение/determinism, push/wall/bounds, head/carry/jump, simultaneous/ceiling/disconnect, four-player chain |
| Actual Socket.IO + PostgreSQL | 22 tests: прежние проверки + preview privacy/owner/validity/flood/expiry, body contacts/head/wall/finish/recovery, catalog/free/duplicate selection/unknown ID, replacement socket |
| Four-context interactions, development | 13 scenarios PASS: четыре персонажа, Аяжан local/remote/name/reconnect, BUILD previews/status, touch contacts/head jump, actual offline в BUILD/RACE, RESULTS/NEXT, unchanged balance |
| Training browser, development | 37 checks PASS, включая четыре карточки/Аяжан, mobile controls, cleanup и legacy profile selection |
| Production browser | 20 real multiplayer checks PASS; 34 training checks PASS |
| `git diff --check` | PASS |

Пять mobile widths: **320 / 375 / 390 / 430 / 500 px** для Character Select/Lobby/BUILD/RACE, без horizontal overflow, tap targets ≥44px. Четыре независимых Chromium contexts показывали 60/60/60/60 FPS. Клиент B получает настоящие server packets с добавкой 60ms в каждую сторону (120ms RTT), без подмены payload. Проверены согласованные позиции после контакта; на 72 кадрах delayed push максимальное смещение за кадр было 5.763 logical px (порог теста <8). Это не замер реального телефона или нагрузочный тест сервера.

QA использовал только отдельную localhost PostgreSQL `doner_stage615_test` на 55436; применены три существующие migrations. Browser fixture создаёт/удаляет только свои users/rooms, использует настоящие HTTP auth/JWT/Socket.IO/DB; Telegram SDK синтетический. Training browser suite отдельно использует mock HTTP responses. Скриншоты и JSON measurements — `artifacts/stage-6.1.5/` (gitignored); логи — `/private/tmp/doner-stage615-*.log`.

## 16. Известные ограничения

Один активный API instance. Нет distributed ownership/leases, rollback/lag compensation, нагрузочных замеров или real-phone performance test. Server catch-up ограничен 6 шагами, client prediction — 12; большой jitter/loss может вызвать заметные поправки. Input timeout 300ms намеренно отключает контакты зависшего клиента. Строительство может перекрыть маршрут; timeout выдаёт DNF, route solver отсутствует. При restart незавершённый RACE становится ABORTED RESULTS; blocks и принятые finishes сохраняются. Sprites временные; abilities, rewards, новые ловушки и Stage 6.2 отсутствуют.

## 17. Migrations и env

**Новых migrations и env variables нет.** Каталог статический, chosenCharacterId уже строка. Room/PlayerProgress/UnlockedCharacter схемы и реальные `.env` не менялись. В repo version используется SemVer `0.6.1-5`, в UI — запрошенный `v0.6.1.5 Player Interactions + Ayazhan`.

## 18. Ручная проверка на двух телефонах

Эта проверка ещё не выполнялась. Нужны два разных Telegram account, желательно iOS/Android и разные сети, после отдельно разрешённой публикации. До входа записать Doner/Golden Doner и profile selection обоих.

1. Открыть Mini App, проверить новую версию, имя/аватар/баланс. В ПЕРСОНАЖИ видны ALTOHA/AIGERIM/TEMIK/АЯЖАН. Выбрать Аяжан и открыть training; её sprite движется и прыгает, покупки нет.
2. A создаёт комнату на 2 места; B входит по invite/code. A выбирает Аяжан, B сначала тоже Аяжан: оба выбора разрешены и видны другу. Затем B выбирает другого героя. Проверить READY и общий старт.
3. В BUILD A выбирает блок и двигает его касанием/стрелками. B видит движение ghost, цвет и имя A. Перенести в защищённую/занятую область: ×/красная рамка у обоих. Отменить: ghost исчезает.
4. Оба выбирают одно свободное место. A подтверждает: появляется один реальный блок, его preview исчезает, у A ПОСТАВИЛ БЛОК, preview B становится invalid. B переносит блок в свободное место; пока не подтверждает, A отключает интернет на 20–25 секунд. Preview A отсутствует, B продолжает. Вернуть связь A: прежний блок, свежий preview B, два уникальных участника.
5. B подтверждает или делает SKIP. У обоих начинается RACE, все ghosts исчезают. Имя A над сиренево-голубым sprite; имя B над его героем.
6. На ровной поверхности удерживать движение навстречу: тела сопротивляются. A продолжает вправо, B отпускает: B медленно сдвигается. Повторить возле стены/поставленного блока: тело не проходит внутрь. Сравнить оба экрана.
7. A прыгает на B, отпускает движение: стоит на голове. B немного двигается: верхний игрок переносится. A снова прыгает, затем оба пробуют одновременный jump и контакт возле блока/потолка; не должно быть бесконечного разгона или постоянных телепортаций.
8. Во время RACE отключить интернет A на 20–25 секунд. B продолжает; неподключённое тело не блокирует его. Вернуть связь, затем обновить Mini App A: тот же room/character/map/position, без копии. Попробовать свернуть/вернуть Telegram и отпустить touch: управление не залипает.
9. Оба финишируют: одинаковые места/результаты. Host нажимает NEXT: прежние блоки сохранены. Во втором BUILD проверить SKIP/ОТКЛЮЧЁН статусы и свежие previews, затем ещё один забег.
10. BackButton → остаться, затем выйти: canvas/input очищаются. Проверить неизменность Doner/Golden Doner и старого account selection. Повторить training, включить reduced motion и проверить отсутствие декоративных contact bursts. Зафиксировать реальные устройства/FPS/задержку отдельно от headless результатов.

## 19. Подготовка безопасного deployment

Публикация не выполнялась и остаётся отдельным действием. Сохранить backup текущей БД, проверить diff и результаты. Использовать существующий hosting contract из [deployment plan](TELEGRAM_MULTIPLAYER_TEST_PLAN.md): прежние API domain/PORT, bot, CORS и variables; один активный API instance, без overlap старого и нового RoomManager. Если schema уже на Stage 6.1, новых migrations нет.

Новый client input protocol несовместим с frontend 6.1. Согласованно обновить API/frontend в короткое окно обслуживания, проверить production VITE_API_URL (не localhost QA URL), затем закрыть/открыть старые Mini Apps. Не переносить локальные test credentials/URLs в production. Проверить health, реальный auth и room sockets, выполнить шаги двухтелефонного smoke выше. При rollback откатывать согласованную пару frontend/API; позиционная симуляция не сохраняется, незавершённый забег безопасно прерывается.
