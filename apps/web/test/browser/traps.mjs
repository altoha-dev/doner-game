// Real clocks, two isolated Chromium contexts, real JWT/API/PG/Socket.IO/Phaser.
// Delay/drop actual websocket frames; no synthetic gameplay states or position setters.
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const base = process.env.BROWSER_TEST_URL ?? 'http://127.0.0.1:5186';
const production = process.env.BROWSER_TEST_PRODUCTION === '1';
const shots = fileURLToPath(new URL(`../../../../artifacts/stage-6.2/${production ? 'production' : 'development'}/`, import.meta.url));
await mkdir(shots, { recursive: true });
const backend = fork('test/browser-server.ts', { cwd: fileURLToPath(new URL('../../../api/', import.meta.url)), env: { ...process.env, BROWSER_INTERACTIONS: '1' }, execArgv: ['--import', 'tsx'], stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
backend.stderr.on('data', data => process.stderr.write(data));
const fixture = await new Promise((resolve, reject) => { backend.once('message', resolve); backend.once('exit', code => reject(new Error(`fixture API exited ${code}`))); });
const browser = await chromium.launch();
const errors = [], clients = [], results = [], received = [[], []], previews = [[], []];
let profile = { name: 'rtt40', rtt: 40 }, stage = 'startup', impairmentAt = Infinity;
async function client(index) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.routeWebSocket('**/socket.io/**', socket => {
    const server = socket.connectToServer(); let packet = 0, snapshot = 0;
    function deliver(send, message, incoming) {
      packet++;
      let delay = profile.rtt / 2;
      if (profile.name === 'jitter') delay += [0, 13, -9, 27, -15, 6][packet % 6];
      if (incoming && String(message).includes('"race:snapshot"')) {
        snapshot++;
        if (profile.name === 'stall-loss') {
          if (snapshot % 11 === 0) return;
          const elapsed = Date.now() - impairmentAt;
          if (elapsed > 400 && elapsed < 650) delay += 180;
        }
      }
      setTimeout(() => {
        if (incoming && String(message).startsWith('42[')) {
          const [event, value] = JSON.parse(String(message).slice(2));
          if (event === 'race:snapshot') received[index].push(value);
          if (event === 'build:previews') previews[index].push(value);
        }
        send(message);
      }, Math.max(1, delay));
    }
    socket.onMessage(message => deliver(message => server.send(message), message, false));
    server.onMessage(message => deliver(message => socket.send(message), message, true));
  });
  await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
  await page.addInitScript(initData => {
    const back = new Set(); window.__back = () => back.forEach(fn => fn());
    window.Telegram = { WebApp: { initData, initDataUnsafe: {}, themeParams: {}, ready() {}, expand() {}, isVersionAtLeast() { return true; }, setHeaderColor() {}, setBackgroundColor() {}, onEvent() {}, offEvent() {}, disableVerticalSwipes() {}, enableVerticalSwipes() {}, BackButton: { show() {}, hide() {}, onClick(fn) { back.add(fn); }, offClick(fn) { back.delete(fn); } } } };
  }, fixture.fixtures[index].initData);
  await page.goto(`${base}/?netdebug=1`); clients.push({ context, page }); return page;
}
const latest = index => received[index].at(-1);
const own = index => latest(index)?.players.find(p => p.seat === index);
async function until(predicate, label, timeout = 8000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (predicate()) return; await new Promise(r => setTimeout(r, 25)); }
  assert.fail(`${stage}: ${label}`);
}
async function choose(page, name, dx, dy, rotations = 0) {
  await page.getByRole('button', { name: name === 'FAN' ? 'FAN 2 DONER' : name === 'CROSSBOW' ? 'CROSSBOW 3 DONER' : `${name} БЕСПЛАТНО`, exact: true }).click();
  for (let i = 0; i < Math.abs(dx); i++) await page.getByRole('button', { name: dx < 0 ? 'Блок влево' : 'Блок вправо', exact: true }).click();
  for (let i = 0; i < Math.abs(dy); i++) await page.getByRole('button', { name: dy < 0 ? 'Блок вверх' : 'Блок вниз', exact: true }).click();
  for (let i = 0; i < rotations; i++) await page.getByRole('button', { name: 'Повернуть ловушку' }).click();
}
async function widths(page) {
  for (const width of [320, 375, 390, 430, 500]) {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow ${width}`);
    for (const b of await page.locator('button:visible').all()) { const box = await b.boundingBox(); assert.ok(box.height >= 44 && box.x >= 0 && box.x + box.width <= width + 1); }
    await page.screenshot({ path: `${shots}/picker-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
}
async function finish(page) {
  await page.waitForFunction(() => !document.querySelector('[aria-label=Вправо]')?.disabled && document.querySelector('[aria-label=Вправо]'));
  // Let the ready/reconnect effects finish before holding a key across the whole run.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.keyboard.down('ArrowRight'); const end = Date.now() + 40000;
  while (Date.now() < end && !await page.locator('.finish-list').count() && !await page.getByText('Ваш забег завершён. Ждём остальных…').count()) { await page.keyboard.press('KeyW'); await page.waitForTimeout(400); }
  await page.keyboard.up('ArrowRight');
  assert.ok(Date.now() < end, 'finish timeout');
}
async function leave(page) { await page.evaluate(() => window.__back()); await page.getByRole('button', { name: 'ВЫЙТИ ИЗ КОМНАТЫ' }).click(); await page.getByRole('heading', { name: 'DONER GAME' }).waitFor(); }
try {
  const A = await client(0), B = await client(1);
  for (const rtt of production ? [80] : [40, 80, 150]) {
    profile = { name: `rtt${rtt}`, rtt }; stage = `${profile.name} BUILD`; received.forEach(a => a.length = 0); previews.forEach(a => a.length = 0);
    await A.getByRole('button', { name: 'СОЗДАТЬ КОМНАТУ', exact: true }).click();
    await A.getByLabel('Количество мест').selectOption('2'); await A.getByRole('button', { name: 'СОЗДАТЬ КОМНАТУ · 2' }).click();
    const code = await A.getByTestId('room-code').textContent();
    await B.getByRole('button', { name: 'ВОЙТИ ПО КОДУ', exact: true }).click(); await B.getByLabel('Код комнаты').fill(code); await B.getByRole('button', { name: 'ПРИСОЕДИНИТЬСЯ', exact: true }).click();
    await A.getByRole('button', { name: 'Ayazhan', exact: true }).click(); await B.getByRole('button', { name: 'Temik', exact: true }).click();
    for (const p of [A, B]) await p.getByRole('button', { name: 'ГОТОВ', exact: true }).click();
    await A.getByRole('button', { name: 'НАЧАТЬ МАТЧ →' }).click();
    await choose(A, 'FAN', 3, 1, 1);
    await until(() => previews[1].at(-1)?.previews.some(p => p.objectType === 'fan' && p.orientation === 'right'), 'fan/right live preview');
    if (rtt === (production ? 80 : 40)) await widths(A);
    await A.getByRole('button', { name: 'ОТМЕНА', exact: true }).click();
    await until(() => previews[1].at(-1)?.previews.length === 0, 'preview cancellation');
    await choose(A, 'FAN', 3, 1);
    await choose(B, 'CROSSBOW', -1, 1, 1);
    await until(() => previews[0].at(-1)?.previews.some(p => p.objectType === 'arcade-crossbow' && p.orientation === 'left'), 'crossbow/left live preview');
    await A.getByRole('button', { name: 'ПОСТАВИТЬ FAN', exact: true }).click(); await B.waitForFunction(() => document.querySelector('[data-testid=block-count]')?.textContent === '1/20'); await B.getByRole('button', { name: 'ПОСТАВИТЬ CROSSBOW', exact: true }).click();
    await A.getByRole('heading', { name: /RACE/ }).waitFor(); await B.getByRole('heading', { name: /RACE/ }).waitFor();
    stage = `${profile.name} hit/respawn`;
    await until(() => received.every(a => a.some(s => s.traps?.projectiles.length)), 'projectiles delivered');
    await until(() => received[1].some(s => s.players.some(p => p.seat === 1 && p.life?.phase === 'HIT')), 'B hit');
    await until(() => own(1)?.life?.phase === 'ALIVE', 'B respawn');
    assert.equal(own(1).life.failures, 1); assert.ok(own(1).life.immuneUntilTick > latest(1).tick);
    const same = received[0].find(s => s.traps?.projectiles.length && received[1].some(b => b.sequence === s.sequence));
    assert.ok(same); assert.deepEqual(same.traps, received[1].find(s => s.sequence === same.sequence).traps);
    stage = `${profile.name} fan lift`;
    await A.keyboard.down('ArrowRight'); let jumping = setInterval(() => { void A.keyboard.press('KeyW'); }, 350);
    try { await until(() => own(0)?.x >= 231, 'reach fan', 12000); } finally { clearInterval(jumping); await A.keyboard.up('ArrowRight'); }
    // Stop horizontal input inside the 32px column, then measure beyond ordinary jump height (38px).
    await until(() => own(0)?.x >= 224 && own(0)?.x <= 260 && own(0)?.y < 205, 'actual fan lift beyond a normal floor jump', 8000);
    const fanHeight = own(0).y;
    await A.screenshot({ path: `${shots}/fan-${rtt}.png`, fullPage: true });
    const failures = own(1).life.failures;
    received[1].length = 0; // A pre-reload packet must not satisfy the reconnect barrier.
    await B.reload(); await B.getByRole('heading', { name: /RACE/ }).waitFor(); await until(() => own(1)?.life?.failures >= failures, 'reconnect lifecycle');
    assert.equal(await B.getByTestId('block-count').textContent(), '2/20');
    stage = `${profile.name} finish/NEXT`;
    await Promise.all([finish(A), finish(B)]); await A.locator('.finish-list').waitFor(); await A.getByText('Награды подтверждены сервером.', { exact: false }).waitFor(); await B.locator('.finish-list').waitFor(); await B.getByText('Награды подтверждены сервером.', { exact: false }).waitFor();
    assert.deepEqual(await A.locator('.finish-list').allTextContents(), await B.locator('.finish-list').allTextContents());
    const host = await A.getByRole('button', { name: 'СЛЕДУЮЩИЙ РАУНД →' }).count() ? A : B;
    await host.getByRole('button', { name: 'СЛЕДУЮЩИЙ РАУНД →' }).click(); await A.getByRole('heading', { name: /BUILD/ }).waitFor();
    assert.equal(await A.getByTestId('block-count').textContent(), '2/20');
    await choose(A, 'ПЛАТФОРМА 1', 11, 0); await A.getByRole('button', { name: 'ПОСТАВИТЬ БЛОК', exact: true }).click(); await A.getByRole('button', { name: 'ЗАВЕРШИТЬ СТРОИТЕЛЬСТВО' }).click();
    await B.waitForFunction(() => document.querySelector('[data-testid=block-count]')?.textContent === '3/20');
    await B.getByRole('button', { name: 'ПРОПУСТИТЬ РАЗМЕЩЕНИЕ' }).click(); await A.getByRole('heading', { name: /RACE/ }).waitFor();
    assert.equal(await A.getByTestId('block-count').textContent(), '3/20');
    if (production) { assert.equal(await A.locator('.network-debug').count(), 0); assert.equal(await A.locator('.phaser-host').getAttribute('data-trap-state'), null); }
    results.push({ rtt, fanHeight, firstHitFailures: 1, sharedProjectiles: true, reconnect: true, finish: true, persistedNextRound: true });
    console.log(`PASS traps ${rtt}ms: preview/rotation, hit/respawn, fan, reconnect, finish, NEXT`);
    for (const p of [A, B]) { const expected = Number((await p.getByTestId('doner-balance').innerText()).match(/\d+/)[0]); await leave(p); await p.waitForFunction(n => document.querySelector('.hud-coin')?.textContent === `DONER ×${n}`, expected); }
  }
  assert.deepEqual(errors, []);
  await writeFile(`${shots}/traps-browser.json`, JSON.stringify({ environment: 'Two Chromium mobile contexts; real local API/PG; added WebSocket RTT on both clients; not physical phones', production, results }, null, 2));
} catch (error) {
  console.error(`Failed ${stage}`);
  for (const [i, { page }] of clients.entries()) { await page.screenshot({ path: `${shots}/failure-${i}.png`, fullPage: true }).catch(() => {}); console.error(i, own(i)); }
  throw error;
} finally { await browser.close(); if (backend.connected) { backend.send('close'); await new Promise(r => backend.once('exit', r)); } }
