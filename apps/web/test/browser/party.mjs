import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const base = process.env.BROWSER_TEST_URL ?? 'http://127.0.0.1:5186';
const production = process.env.BROWSER_TEST_PRODUCTION === '1';
const shots = fileURLToPath(new URL(`../../../../artifacts/stage-6.1/${production ? 'production/' : ''}`, import.meta.url));
await mkdir(shots, { recursive: true });
const backend = fork('test/browser-server.ts', { cwd: fileURLToPath(new URL('../../../api/', import.meta.url)), execArgv: ['--import', 'tsx'], stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
backend.stderr.on('data', data => process.stderr.write(data));
const fixture = await new Promise((resolve, reject) => { backend.once('message', resolve); backend.once('exit', code => reject(new Error(`fixture server exited ${code}`))); });
const browser = await chromium.launch();
const errors = []; let checks = 0;
async function client(index, startParam = '') {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
  await page.addInitScript(({ initData, startParam }) => {
    const handlers = new Set(); window.__back = () => handlers.forEach(cb => cb());
    window.Telegram = { WebApp: { initData, initDataUnsafe: { start_param: startParam }, themeParams: {}, ready() {}, expand() {}, isVersionAtLeast() { return true; }, setHeaderColor() {}, setBackgroundColor() {}, onEvent() {}, offEvent() {}, isVerticalSwipesEnabled: true, disableVerticalSwipes() { this.isVerticalSwipesEnabled = false; }, enableVerticalSwipes() { this.isVerticalSwipesEnabled = true; }, BackButton: { show() {}, hide() {}, onClick(cb) { handlers.add(cb); }, offClick(cb) { handlers.delete(cb); } } } };
  }, { ...fixture.fixtures[index], startParam });
  await page.goto(base); return { page, context };
}
async function widths(page, label) {
  for (const width of [320, 375, 390, 430, 500]) {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 }); await page.waitForTimeout(100);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}: overflow ${width}`);
    for (const button of await page.locator('button:visible').all()) { const box = await button.boundingBox(); assert.ok(box.height >= 44 && box.x >= 0 && box.x + box.width <= width + 1, `${label} tap target ${width}`); }
    await page.screenshot({ path: `${shots}/${label}-${width}.png`, fullPage: true }); checks++;
  }
  await page.setViewportSize({ width: 390, height: 844 });
}
async function build(page, rightSteps = 0, upSteps = 0) {
  await page.getByRole('button', { name: 'ПЛАТФОРМА 1 БЕСПЛАТНО' }).click();
  for (let i = 0; i < rightSteps; i++) await page.getByRole('button', { name: 'Блок вправо', exact: true }).click();
  for (let i = 0; i < upSteps; i++) await page.getByRole('button', { name: 'Блок вверх', exact: true }).click();
  await page.getByRole('button', { name: 'ПОСТАВИТЬ БЛОК', exact: true }).click();
}
async function run(page, label) {
  await page.getByRole('heading', { name: /RACE/ }).waitFor();
  await page.keyboard.down('ArrowRight'); const stop = Date.now() + 35000;
  while (Date.now() < stop && !await page.getByText('Ваш забег завершён. Ждём остальных…').count() && !await page.locator('.finish-list').count()) { await page.keyboard.press('KeyW'); await page.waitForTimeout(430); }
  await page.keyboard.up('ArrowRight');
  if (Date.now() >= stop) { await page.screenshot({ path: `${shots}/failure-${label}.png`, fullPage: true }); console.log(label, await page.locator('.phaser-host').evaluate(e => ({ ...e.dataset }))); assert.fail(`${label} failed to finish`); }
}
try {
  const a = await client(0), A = a.page;
  await A.getByText('Привет, Антон').waitFor(); await A.getByRole('button', { name: 'СОЗДАТЬ КОМНАТУ', exact: true }).click();
  await A.getByLabel('Количество мест').selectOption('2'); await A.getByRole('button', { name: 'СОЗДАТЬ КОМНАТУ · 2' }).click();
  const code = await A.getByTestId('room-code').textContent(); assert.match(code, /^[A-Z2-9]{6}$/);
  const b = await client(1, `room_${code}`), B = b.page;
  await B.getByLabel('Код комнаты').waitFor(); assert.equal(await B.getByLabel('Код комнаты').inputValue(), code);
  await B.getByRole('button', { name: 'ПРИСОЕДИНИТЬСЯ', exact: true }).click();
  await A.locator('.lobby-player').filter({ hasText: 'Айгерим' }).waitFor(); await B.locator('.lobby-player').filter({ hasText: 'Антон' }).waitFor();
  await widths(A, 'lobby');
  await B.getByRole('button', { name: 'Temik', exact: true }).click();
  await A.getByRole('button', { name: 'ГОТОВ', exact: true }).click(); await B.getByRole('button', { name: 'ГОТОВ', exact: true }).click();
  await A.getByRole('button', { name: 'НАЧАТЬ МАТЧ →' }).click();
  await A.getByRole('heading', { name: /BUILD/ }).waitFor(); await B.getByRole('heading', { name: /BUILD/ }).waitFor();
  await widths(A, 'build'); await build(A);
  await B.waitForFunction(() => document.querySelector('[data-testid=block-count]')?.textContent === '1/20');
  await build(B, 2, 1);
  await A.getByRole('heading', { name: /RACE/ }).waitFor(); await B.getByRole('heading', { name: /RACE/ }).waitFor();
  if (!production) {
    assert.equal(await A.locator('.phaser-host').getAttribute('data-remote-players'), '1');
    assert.equal(await A.locator('.phaser-host').getAttribute('data-remote-names'), 'Айгерим');
  }
  await widths(A, 'race');
  await A.screenshot({ path: `${shots}/two-players.png`, fullPage: true });
  // Native multi-touch, two fingers: local Phaser movement must reach the other browser.
  const cdp = await a.context.newCDPSession(A);
  const right = await A.getByRole('button', { name: 'Вправо', exact: true }).boundingBox();
  const jump = await A.getByRole('button', { name: 'Прыжок', exact: true }).boundingBox();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: right.x + 20, y: right.y + 20, id: 1 }, { x: jump.x + 20, y: jump.y + 20, id: 2 }] });
  await A.waitForTimeout(250);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  if (!production) {
    await B.waitForFunction(() => JSON.parse(document.querySelector('.phaser-host').dataset.remotePositions)[0].x > 55);
    await A.waitForTimeout(500);
    const stopped = Number(await A.locator('.phaser-host').getAttribute('data-player-x'));
    await A.waitForTimeout(200);
    assert.ok(Math.abs(Number(await A.locator('.phaser-host').getAttribute('data-player-x')) - stopped) <= 2, 'touchCancel releases movement');
  }
  await cdp.detach(); checks++;
  // Real TCP/websocket loss in B's browser context; re-auth and resync also tested by reload.
  await b.context.setOffline(true); await B.getByText('ПЕРЕПОДКЛЮЧЕНИЕ…', { exact: true }).waitFor({ timeout: 25000 });
  await b.context.setOffline(false); await B.waitForFunction(() => !document.querySelector('.connection-banner'), { timeout: 12000 });
  await B.reload(); await B.getByRole('heading', { name: /RACE/ }).waitFor();
  assert.equal(await B.getByTestId('block-count').textContent(), '2/20'); checks++;
  // Run two independent Phaser simulations against one actual API.
  await Promise.all([run(A, 'A'), (async () => { await B.waitForTimeout(1000); await run(B, 'B'); })()]);
  await A.locator('.finish-list').waitFor(); await B.locator('.finish-list').waitFor();
  assert.deepEqual(await A.locator('.finish-list').allTextContents(), await B.locator('.finish-list').allTextContents());
  assert.match(await A.locator('.finish-list').innerText(), /1\. Антон/); assert.match(await A.locator('.finish-list').innerText(), /2\. Айгерим/);
  await A.screenshot({ path: `${shots}/results.png`, fullPage: true }); checks++;
  // B may become host after A is backgrounded in a real browser; read the actual server-owned UI.
  const host = await A.getByRole('button', { name: 'СЛЕДУЮЩИЙ РАУНД →' }).count() ? A : B;
  await host.getByRole('button', { name: 'СЛЕДУЮЩИЙ РАУНД →' }).click();
  await A.getByRole('heading', { name: /BUILD/ }).waitFor(); await B.getByRole('heading', { name: /BUILD/ }).waitFor();
  assert.equal(await A.getByTestId('block-count').textContent(), '2/20'); assert.equal(await B.getByTestId('block-count').textContent(), '2/20');
  await build(A, 10); await build(B, 12, 1);
  await A.getByRole('heading', { name: /RACE/ }).waitFor(); assert.equal(await A.getByTestId('block-count').textContent(), '4/20');
  await A.screenshot({ path: `${shots}/round-two.png`, fullPage: true }); checks++;
  await Promise.all([run(A, 'A-round2'), run(B, 'B-round2')]);
  await A.locator('.finish-list').waitFor(); assert.deepEqual(await A.locator('.finish-list').allTextContents(), await B.locator('.finish-list').allTextContents()); checks++;
  await A.evaluate(() => window.__back()); await A.getByRole('button', { name: 'ОСТАТЬСЯ' }).click();
  await A.evaluate(() => window.__back()); await A.getByRole('button', { name: 'ВЫЙТИ ИЗ КОМНАТЫ' }).click();
  await A.getByRole('heading', { name: 'DONER GAME' }).waitFor(); assert.equal(await A.locator('canvas').count(), 0); assert.equal(await A.locator('.hud-coin').first().innerText(), 'DONER ×42');
  await a.context.close(); await b.context.close(); assert.deepEqual(errors, []);
  console.log(`PASS ${checks} real multiplayer browser checks (${production ? 'production' : 'development'})`);
} finally { await browser.close(); backend.send('close'); await new Promise(resolve => backend.once('exit', resolve)); }
