# Stage 6.3.5 — Winter Pixel Art Visual Polish

Дата: 2026-10-23. База: main `af126c7`. Статус: оформление завершено, итоговое browser QA ещё выполняется; подтверждения ниже заполняются только после успешного завершения команд.

## 1. Объём

Полировка presentation layer: Home, локальный шрифт, UI, фон арены, тайлы, ловушки и previews. Сохранены все четыре персонажа, пять online раундов, placements/rotation, collision geometry, prediction/smoothing, server authority, Doner prices/rewards/ledger, reconnect, Training. Новых способностей/ловушек/правил нет. Backend/shared/Prisma/балансы не изменены.

## 2. Главное меню

Вместо схематичного киоска — оригинальная SVG-сцена320×150 с несколькими планами города: дальние дома, снег на крышах, луна, ёлки, закусочная с витриной/вывеской/полосатым козырьком, фонари, четыре друга. Двухцветная вывеска DONER GAME с пиксельной тенью, отдельная панель игрока и валют, тёплая главная кнопка, холодная карточка Training, SVG-иконки разделов. Обновлены browser theme/favicon и цвета Telegram header/background.

## 3. Кнопки и шрифт

Pixelify Sans400–700 загружается локально,79,160байт, preload + font-display:swap. Кириллица/латиница: заголовки, кнопки, крупные акценты. Мелкие описания используют системный sans, числовые подписи — mono. Автор Stefie Justprince; [официальный Google Fonts source](https://github.com/google/fonts/tree/main/ofl/pixelifysans), SIL OFL1.1 в `apps/web/public/fonts/OFL-PixelifySans.txt`. Внешних font/CDN запросов runtime нет.

Холодные тонкие рамки, снежный верхний край, жёсткие тени, тёплый selected/primary, текстовые ready/disabled состояния. Сохранены keyboard focus и tap targets≥44px; touch controls56–64px. Reduced-motion отключает пар/снег/мерцание/декоративное вращение.

## 4. Арена

Небо с цветовыми полосами, дальние горы (parallax0.18), приглушённый город (0.45), заснеженные деревья, две закусочные, детальные фонари. Снежные верхние грани и колотый камень, холодные грани льда/сосульки, стартовый указатель, снежная клетчатая арка финиша. Фон ниже объектов по depth и контрасту. Декор без colliders. Shared geometry, spawn/finish bounds, camera zoom×2, tile16×16 и player sprite16×24 прежние.

## 5. BLOCK / EXTRA BLOCK

Снежная деревянная опора32×16 с досками, волокнами, скобами, заклёпками и нижней тенью. EXTRA использует тот же рисунок и физические размеры; отличается названием/ценой после бесплатного блока. Новый `winterArt.ts` — общие целочисленные paint instructions для SVG shop icon, preview и placed texture. Личный и чужой ghost меньше перекрывают рисунок цветом; вместо центрального квадрата — угловые метки. Valid/invalid/owner labels сохранены. BUILD grid контраст снижен.

## 6. FAN

Холодный металлический корпус, ротор с двумя кадрами лопастей, решётка, янтарная втулка, опоры, снег и стрелка направления. Существующая зона/струйки воздуха остаются. Направления up/left/right и сила/область действия прежние. Reduced-motion оставляет статичный читаемый ротор.

## 7. CROSSBOW

Новая ложа, стальные плечи, тетива, основание, снежный болт; left зеркалит рисунок внутри тех же32×16. Снаряд получил светлую сердцевину и короткий холодный след. Существующие warning/траектория/clamp/HIT/respawn/timing не менялись.

## 8. SHOP / RESULTS / LOBBY

Shop показывает actual pixel art вместо условных символов, явную цену/описание и состояние недостатка Doner. Баланс выделен компактной тёплой панелью. BUILD status, room code, ready cards и connection banners оформлены общей системой рамок. RESULTS — снежно-янтарная рамка, чёткие места/награды; scoreboard — разделённые строки и числовые акценты, включая shared victory. Данные и callbacks сохранены.

## 9. Файлы

- `apps/web/src/{App,GameScreen,PixelArt,WinterScene}.tsx` — иконки, Home, подпись версии; `tokens.css`, `styles.css`, `game.css`, `party.css` — типографика/layout/UI.
- `apps/web/src/game/winterArt.ts` (новый), `textures.ts`, `trapVisuals.ts`, `arenaPresentation.ts` — artwork; `createGame.ts` — только цвет/alpha/grid/ghost markers, без simulation/input изменений.
- `apps/web/public/fonts/{PixelifySans.ttf,OFL-PixelifySans.txt}` (новые), `index.html`, `public/favicon.svg`; `src/telegram.ts` — только два литерала цвета.
- `apps/web/test/telegram.test.ts` — ожидания новых цветов. Новый `test/browser/visual.mjs` проверяет actual font через Chrome DevTools, focus/reduced-motion/previews. В `party/economy/traps/interactions/training-traps.mjs` добавлен только `BROWSER_SCREENSHOT_DIR`, чтобы не перезаписывать исторические артефакты.
- root `package.json`: SemVer0.6.3-5 (UIv0.6.3.5); README, ART_DIRECTION, STAGE_6_3_5_PROGRESS/REPORT.
- Исходные незакоммиченные изменения `docs/STAGE_6_3_PROGRESS.md`/`REPORT.md` от предыдущей финализации сохранены; к этому визуальному этапу не относятся.

## 10. Проверки

Изолированная PostgreSQL: `127.0.0.1:55436/doner_stage63_test`, userdoner_test_user. Read-only SELECT подтвердил endpoint/имя и все5ранее применённых migrations. Ни migrations, ни reset, ни production DB не использовались. Первый старт pg_ctl без прежних -o не смог занять стандартный порт; повтор с прежними `-h127.0.0.1 -p55436` успешен, чужой процесс не изменён.

| Проверка | Результат |
| --- | --- |
| pnpm typecheck | PASS |
| VITE_API_URL=http://127.0.0.1:3014 pnpm build | PASS; обычное предупреждение Vite о lazy Phaser chunk>500kB |
| pnpm test, final revision | PASS145: API101/web29/bot15; skipped0, fail0 |
| Training DEV / production preview | PASS37 / PASS34, mobile widths, input/collision, characters, lifecycle |
| Visual DEV / production preview | PASS / PASS; actual Cyrillic Pixelify Sans17glyphs без fallback, local asset, focus, reduced motion, 3previews |
| Production multiplayer | PASS21: lobby/build/race/results/next/reconnect; mobile5widths |
| DEV four-player interactions | PASS13:4героя/live previews/contact/head standing/head jump/offline/reconnect/NEXT;120ms added RTT |
| Training traps DEV | PASS FAN/CROSSBOW/hit/respawn/finish/3persistent types; no account requests |
| Economy / network trap browser QA | Ожидается завершение |
| Artwork bounds | PASS24комбинации type/orientation/frame: целочисленные rectangles внутри32×16 |
| git diff --check | PASS на промежуточном diff; будет повторён после docs |

Four-player Chromium performance:60/60/60/60FPS (390×844), delayed peer120ms RTT maxframe push1.292logicalpx по72кадрам. Это browser regression, не новая оценка телефонной производительности и не повтор полного network bench50/15сценариев; simulation код не менялся.

Screenshots/logs: `artifacts/stage-6.3.5/` и `/private/tmp/doner-stage635-*.log` (локальные, gitignored). Baseline `before/` — копии исторических Stage6.3 screenshots, не новый результат. `visual.mjs` запускается из web: `PLAYWRIGHT_BROWSERS_PATH=/private/tmp/doner-game-playwright BROWSER_TEST_URL=http://127.0.0.1:5186 pnpm exec node test/browser/visual.mjs`. Остальные browser scripts — существующие pnpm test:browser/test:party/test:interactions/test:economy/test:traps/test:training-traps; API fixtures только последовательно с явным TEST_DATABASE_URL.

## 11. Ограничения

- Настоящие Telegram iOS/Android и два физических телефона ещё требуют ручной проверки: safe-area/viewport/keyboard, читаемость шрифта/preview, нажатия BUILD/rotate/shop, reconnect, frame pacing/нагрев при максимальном числе ловушек. Chromium не измеряет FPS телефона.
- Существующая единичная коррекция верхнего игрока при неожиданном прыжке нижнего (ранее16–26logicalpx при RTT80–150ms) остаётся; физика не переписывалась.
- Герои — прежние временные образы; новые sheets/способности не вводились. Декор вне коллизий, не опора для прыжка. Новые font+paint инструкции добавляют небольшой объём; Phaser остаётся lazy chunk.
- Никаких новых migrations/env variables. Для локального QA VITE_API_URL указывал наlocalhost3014; перед будущей разрешённой публикацией собрать web с настоящим API URL. Локальный production preview не deployment.

## 12. Перед Stage6.4

Сначала ручной визуальный и игровой приёмочный проход на двух телефонах: четыре героя, покупки/недостаток Doner, rotate/live preview, FAN/CROSSBOW/RACE, head standing/jump, reconnect, NEXT и shared victory. Утвердить визуальное направление и зафиксировать текущий этап отдельным разрешённым действием. Затем согласовать правила способностей Stage6.4; сейчас их реализация не начата. Commit/push/deployment/production migrations не выполнялись.
