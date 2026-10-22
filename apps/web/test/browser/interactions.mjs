// Four isolated Telegram fixtures, actual API/JWT/Socket.IO/PG and Phaser. No gameplay endpoints mocked.
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const base = process.env.BROWSER_TEST_URL ?? 'http://127.0.0.1:5186';
const shots = fileURLToPath(new URL('../../../../artifacts/stage-6.1.5/', import.meta.url));
await mkdir(shots, { recursive: true });
const backend = fork('test/browser-server.ts', { cwd: fileURLToPath(new URL('../../../api/', import.meta.url)), env: { ...process.env, BROWSER_INTERACTIONS: '1' }, execArgv: ['--import', 'tsx'], stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
backend.stderr.on('data', data => process.stderr.write(data));
const fixture = await new Promise((resolve, reject) => { backend.once('message', resolve); backend.once('exit', code => reject(new Error(`fixture API exited ${code}`))); });
const browser = await chromium.launch();
const clients = [], errors = [], results = []; let stage = 'startup';
const pass = message => { results.push(message); console.log(`PASS ${message}`); };
async function client(index, startParam = '') {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  if (index === 1) await page.routeWebSocket('**/socket.io/**', socket => {
    const server = socket.connectToServer();
    // Actual server packets, delayed 60 ms in each direction; no replacement snapshots.
    socket.onMessage(message => setTimeout(() => server.send(message), 60));
    server.onMessage(message => setTimeout(() => socket.send(message), 60));
  });
  await page.route('https://telegram.org/**', route => route.fulfill({ body: '' }));
  await page.addInitScript(({ initData, startParam }) => {
    const back = new Set(); window.__back = () => back.forEach(fn => fn());
    window.Telegram = { WebApp: { initData, initDataUnsafe: { start_param: startParam }, themeParams: {}, ready() {}, expand() {}, isVersionAtLeast() { return true; }, setHeaderColor() {}, setBackgroundColor() {}, onEvent() {}, offEvent() {}, disableVerticalSwipes() {}, enableVerticalSwipes() {}, BackButton: { show() {}, hide() {}, onClick(fn) { back.add(fn); }, offClick(fn) { back.delete(fn); } } } };
  }, { ...fixture.fixtures[index], startParam });
  clients.push({ page, context }); await page.goto(base); return { page, context };
}
const data = page => page.locator('.phaser-host').evaluate(element => ({ ...element.dataset }));
const actors = async page => JSON.parse((await data(page)).authoritativePlayers);
const remotePreviews = async page => JSON.parse((await data(page)).remotePreviews || '[]');
async function widths(page, name) {
  for (const width of [320, 375, 390, 430, 500]) {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 }); await page.waitForTimeout(120);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} overflow ${width}`);
    for (const button of await page.locator('button:visible').all()) {
      const bounds = await button.boundingBox(); assert.ok(bounds.height >= 44 && bounds.x >= 0 && bounds.x + bounds.width <= width + 1, `${name} tap target ${width}`);
    }
    await page.screenshot({ path: `${shots}/${name}-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 }); pass(`${name}: five mobile widths and tap targets`);
}
async function choose(page, right = 0, up = 0) {
  await page.getByRole('button', { name: 'ПЛАТФОРМА 1 БЕСПЛАТНО' }).click();
  for (let i = 0; i < right; i++) await page.getByRole('button', { name: 'Блок вправо', exact: true }).click();
  for (let i = 0; i < up; i++) await page.getByRole('button', { name: 'Блок вверх', exact: true }).click();
}
const confirm = async page => { await page.getByRole('button', { name: 'ПОСТАВИТЬ БЛОК', exact: true }).click(); await page.getByRole('button', { name: 'ЗАВЕРШИТЬ СТРОИТЕЛЬСТВО' }).click(); };
async function finish(page) {
  await page.keyboard.down('ArrowRight');
  const until = Date.now() + 40000;
  while (Date.now() < until && !await page.getByText('Ваш забег завершён. Ждём остальных…').count() && !await page.locator('.finish-list').count()) {
    await page.keyboard.press('KeyW'); await page.waitForTimeout(420);
  }
  await page.keyboard.up('ArrowRight'); assert.ok(Date.now() < until, 'Phaser reaches server finish');
}
async function equivalent(A, B) {
  await A.waitForTimeout(600);
  const a = JSON.parse((await data(A)).renderedPlayers), b = JSON.parse((await data(B)).renderedPlayers);
  for (const player of a.filter(p => a.slice(0, 2).some(o => o.playerId === p.playerId))) {
    const other = b.find(p => p.playerId === player.playerId);
    assert.ok(Math.abs(player.x - other.x) < 3 && Math.abs(player.y - other.y) < 3, `render reconciliation ${JSON.stringify({ player, other })}`);
  }
}
try {
  const a = await client(0), A = a.page;
  await A.getByText('Привет, Антон').waitFor();
  await A.getByRole('button', { name: 'ПЕРСОНАЖИ', exact: true }).click();
  assert.equal(await A.locator('.character-card').count(), 4); await widths(A, 'characters');
  await A.locator('[data-character=ayazhan]').getByRole('button', { name: 'ВЫБРАТЬ', exact: true }).click();
  await A.getByRole('button', { name: 'НА ТРЕНИРОВКУ →' }).click();
  await A.waitForFunction(() => document.querySelector('.phaser-host')?.dataset.character === 'ayazhan');
  await A.evaluate(() => window.__back()); await A.getByRole('heading', { name: 'DONER GAME' }).waitFor();
  assert.equal(await A.locator('.hud-coin').first().innerText(), 'DONER ×42');
  pass('four Character Select cards and free Ayazhan training with real authenticated profile');
  await A.getByRole('button', { name: 'СОЗДАТЬ КОМНАТУ', exact: true }).click();
  await A.getByRole('button', { name: 'СОЗДАТЬ КОМНАТУ · 4' }).click();
  const code = await A.getByTestId('room-code').textContent();
  const b = await client(1, `room_${code}`), c = await client(2, `room_${code}`), d = await client(3, `room_${code}`);
  const B = b.page, C = c.page, D = d.page;
  for (const page of [B, C, D]) {
    await page.getByRole('button', { name: 'ПРИСОЕДИНИТЬСЯ', exact: true }).click();
    await page.getByRole('heading', { name: 'СНЕЖНАЯ БАНДА' }).waitFor();
  }
  await A.waitForFunction(() => document.querySelectorAll('.lobby-player').length === 4);
  for (const [page, name] of [[A, 'Ayazhan'], [B, 'Aigerim'], [C, 'Temik'], [D, 'Altoha']]) {
    assert.equal(await page.locator('.room-characters button').count(), 4);
    await page.getByRole('button', { name, exact: true }).click();
  }
  await B.locator('.lobby-player').filter({ hasText: 'Антон' }).getByText(/Ayazhan/).waitFor();
  await widths(A, 'lobby');
  for (const page of [A, B, C, D]) await page.getByRole('button', { name: 'ГОТОВ', exact: true }).click();
  await A.getByRole('button', { name: 'НАЧАТЬ МАТЧ →' }).click();
  for (const page of [A, B, C, D]) await page.getByRole('heading', { name: /BUILD/ }).waitFor();
  stage = 'live previews';
  await choose(C, 14, 1); await confirm(C); await D.getByRole('button', { name: 'ПРОПУСТИТЬ РАЗМЕЩЕНИЕ' }).click();
  await choose(A); await B.waitForFunction(() => JSON.parse(document.querySelector('.phaser-host').dataset.remotePreviews || '[]').some(p => p.displayName === 'Антон' && p.position.x === 176));
  await A.getByRole('button', { name: 'Блок вправо', exact: true }).click();
  await B.waitForFunction(() => JSON.parse(document.querySelector('.phaser-host').dataset.remotePreviews).some(p => p.position.x === 192 && p.valid));
  for (let i = 0; i < 5; i++) await A.getByRole('button', { name: 'Блок влево', exact: true }).click();
  await B.waitForFunction(() => JSON.parse(document.querySelector('.phaser-host').dataset.remotePreviews).some(p => p.displayName === 'Антон' && !p.valid));
  await B.screenshot({ path: `${shots}/invalid-remote-preview.png`, fullPage: true }); pass('live remote preview moves, shows owner and server invalidity');
  await A.getByRole('button', { name: 'ОТМЕНА', exact: true }).click();
  await B.waitForFunction(() => JSON.parse(document.querySelector('.phaser-host').dataset.remotePreviews).length === 0);
  await choose(A); await choose(B); await widths(B, 'build');
  await B.screenshot({ path: `${shots}/shared-previews.png`, fullPage: true });
  stage = 'BUILD reconnect';
  await a.context.setOffline(true);
  await B.waitForFunction(() => JSON.parse(document.querySelector('.phaser-host').dataset.remotePreviews).length === 0, { timeout: 4000 });
  await A.getByText('ПЕРЕПОДКЛЮЧЕНИЕ…', { exact: true }).waitFor({ timeout: 25000 });
  await a.context.setOffline(false);
  await A.waitForFunction(() => !document.querySelector('.connection-banner'), { timeout: 12000 });
  assert.equal(await A.getByTestId('block-count').textContent(), '1/20');
  assert.equal(await A.locator('.build-party-status li').count(), 4);
  await A.waitForFunction(() => JSON.parse(document.querySelector('.phaser-host').dataset.remotePreviews || '[]').some(p => p.displayName === 'Айгерим'));
  pass('actual BUILD offline/reconnect: committed block, fresh peer preview, four unique members');
  await choose(A); await confirm(A);
  await B.getByText(/× Здесь уже есть платформа/).waitFor();
  assert.equal(await B.getByRole('button', { name: 'ПОСТАВИТЬ БЛОК', exact: true }).isDisabled(), true);
  await B.locator('.build-party-status li').filter({ hasText: 'Антон' }).getByText('ПОСТАВИЛ БЛОК').waitFor();
  await B.locator('.build-party-status li').filter({ hasText: 'Снежный друг' }).getByText('ПРОПУСТИЛ').waitFor();
  for (let i = 0; i < 2; i++) await B.getByRole('button', { name: 'Блок вправо', exact: true }).click();
  await B.getByRole('button', { name: 'Блок вверх', exact: true }).click(); await confirm(B);
  for (const page of [A, B, C, D]) await page.getByRole('heading', { name: /RACE/ }).waitFor();
  await A.waitForTimeout(2200);
  assert.equal((await remotePreviews(A)).length, 0); assert.equal((await remotePreviews(B)).length, 0);
  assert.equal((await data(A)).remotePlayers, '3');
  const sprite = JSON.parse((await data(B)).renderedPlayers).find(p => p.name === 'Антон');
  assert.equal(sprite.texture, 'winter-player-ayazhan'); assert.equal((await data(A)).character, 'ayazhan');
  pass('Ayazhan selected on server, rendered locally/remotely with Telegram name; all four catalog sprites');
  const fps = await Promise.all([A, B, C, D].map(async page => Number((await data(page)).fps)));
  assert.ok(fps.every(value => value > 15), `headless four-player FPS: ${fps}`);
  await writeFile(`${shots}/performance.json`, JSON.stringify({ environment: 'headless Chromium, four independent contexts, 390x844', fps, note: 'Not a phone performance measurement' }, null, 2));
  await A.screenshot({ path: `${shots}/four-players.png`, fullPage: true }); pass(`four rendered players, preview cleanup, headless FPS ${fps.join('/')}`);
  const otherFinishes = Promise.all([finish(C), (async () => { await D.waitForTimeout(400); await finish(D); })()]);
  void otherFinishes.catch(() => {}); // Awaited below; preserve cleanup if an earlier assertion fails.
  stage = 'body contact';
  await A.keyboard.down('ArrowRight'); await B.keyboard.down('ArrowLeft'); await A.waitForTimeout(350);
  await A.keyboard.up('ArrowRight'); await B.keyboard.up('ArrowLeft'); await equivalent(A, B);
  let positions = await actors(A);
  const aId = positions.find(p => p.seat === 0).playerId, bId = positions.find(p => p.seat === 1).playerId;
  assert.ok(positions.find(p => p.playerId === bId).x - positions.find(p => p.playerId === aId).x >= 9.999);
  const before = positions.find(p => p.playerId === bId).x;
  const contactTrace = B.evaluate(() => new Promise(resolve => {
    const xs = [];
    function sample() {
      xs.push(JSON.parse(document.querySelector('.phaser-host').dataset.renderedPlayers)[0].x);
      if (xs.length < 72) requestAnimationFrame(sample); else resolve(xs);
    }
    requestAnimationFrame(sample);
  }));
  // Native touch push, including cancellation.
  const cdp = await a.context.newCDPSession(A);
  const button = await A.getByRole('button', { name: 'Вправо', exact: true }).boundingBox();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: button.x + 20, y: button.y + 20, id: 1 }] });
  await A.waitForTimeout(700); await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await equivalent(A, B);
  assert.ok((await actors(A)).find(p => p.playerId === bId).x > before + 5);
  const xs = await contactTrace;
  const maxFrameDelta = Math.max(...xs.slice(1).map((x, i) => Math.abs(x - xs[i])));
  assert.ok(maxFrameDelta < 8, `delayed contact has no repeated teleports: max frame delta ${maxFrameDelta}`);
  await writeFile(`${shots}/latency.json`, JSON.stringify({ addedRoundTripMs: 120, frames: xs.length, maxFrameDelta, logicalPixels: xs }, null, 2));
  await A.screenshot({ path: `${shots}/push.png`, fullPage: true }); pass('opposing bodies and native touch push: matching rendered positions with 120 ms added RTT on B');
  stage = 'head landing';
  const targetX = (await actors(A)).find(p => p.playerId === bId).x;
  await A.keyboard.down('ArrowRight'); await A.keyboard.press('KeyW');
  await A.waitForFunction(x => Number(document.querySelector('.phaser-host').dataset.playerX) >= x - 7, targetX);
  await A.keyboard.up('ArrowRight');
  await A.waitForFunction(id => document.querySelector('.phaser-host').dataset.playerSupport === id, bId, { timeout: 5000 });
  await equivalent(A, B);
  await A.screenshot({ path: `${shots}/standing-on-head.png`, fullPage: true });
  const headY = Number((await data(A)).playerBottom);
  const jumpButton = await A.getByRole('button', { name: 'Прыжок', exact: true }).boundingBox();
  await a.page.touchscreen.tap(jumpButton.x + 20, jumpButton.y + 20);
  await A.waitForFunction(y => Number(document.querySelector('.phaser-host').dataset.playerBottom) < y - 8, headY);
  await A.waitForFunction(id => JSON.parse(document.querySelector('.phaser-host').dataset.authoritativeImpacts || '[]').some(e => e.kind === 'head-jump' && e.a === id), aId);
  await A.screenshot({ path: `${shots}/head-jump.png`, fullPage: true });
  await cdp.detach(); pass('Phaser landing on head and native touch head jump, both clients reconciled');
  await widths(A, 'race');
  stage = 'RACE reconnect';
  await a.context.setOffline(true); await A.getByText('ПЕРЕПОДКЛЮЧЕНИЕ…', { exact: true }).waitFor({ timeout: 25000 });
  await a.context.setOffline(false); await A.waitForFunction(() => !document.querySelector('.connection-banner'), { timeout: 12000 });
  await A.reload(); await A.getByRole('heading', { name: /RACE/ }).waitFor();
  await A.waitForFunction(() => JSON.parse(document.querySelector('.phaser-host').dataset.authoritativePlayers || '[]').length === 4);
  assert.equal((await data(A)).character, 'ayazhan');
  assert.equal(JSON.parse((await data(B)).renderedPlayers).find(p => p.name === 'Антон').texture, 'winter-player-ayazhan');
  assert.equal(await A.getByTestId('block-count').textContent(), '3/20'); pass('actual RACE offline/reconnect and refresh restore four bodies and three blocks');
  stage = 'finish and next';
  await Promise.all([finish(A), finish(B), otherFinishes]);
  for (const page of [A, B, C, D]) await page.locator('.finish-list').waitFor();
  const finishText = await A.locator('.finish-list').innerText();
  for (const page of [B, C, D]) assert.equal(await page.locator('.finish-list').innerText(), finishText);
  assert.equal(await A.locator('.finish-list li').count(), 4); assert.ok(!finishText.includes('DNF'));
  await A.screenshot({ path: `${shots}/results.png`, fullPage: true });
  const host = (await Promise.all([A, B, C, D].map(async page => await page.getByRole('button', { name: 'СЛЕДУЮЩИЙ РАУНД →' }).count() ? page : null))).find(Boolean);
  await host.getByRole('button', { name: 'СЛЕДУЮЩИЙ РАУНД →' }).click();
  for (const page of [A, B, C, D]) { await page.getByRole('heading', { name: /BUILD/ }).waitFor(); assert.equal(await page.getByTestId('block-count').textContent(), '3/20'); }
  await A.screenshot({ path: `${shots}/next-round.png`, fullPage: true });
  const expectedBalance = Number((await A.getByTestId('doner-balance').innerText()).match(/\d+/)[0]);
  await A.evaluate(() => window.__back()); await A.getByRole('button', { name: 'ВЫЙТИ ИЗ КОМНАТЫ' }).click();
  await A.getByRole('heading', { name: 'DONER GAME' }).waitFor(); assert.equal(await A.locator('canvas').count(), 0);
  await A.waitForFunction(n => document.querySelector('.hud-coin')?.textContent === `DONER ×${n}`, expectedBalance); assert.deepEqual(errors, []);
  pass('four identical results, NEXT retains blocks, BackButton cleanup, confirmed balance');
  await writeFile(`${shots}/checks.json`, JSON.stringify(results, null, 2));
  console.log(`PASS ${results.length} Stage 6.1.5 browser scenarios`);
} catch (error) {
  console.error(`Failed stage: ${stage}`, error);
  for (const [index, { page }] of clients.entries()) {
    await page.screenshot({ path: `${shots}/failure-${index}.png`, fullPage: true, timeout: 5000 }).catch(() => {});
    console.log(index, await page.locator('body').innerText({ timeout: 2000 }).catch(() => ''), await page.locator('.phaser-host').evaluate(element => ({ ...element.dataset }), undefined, { timeout: 2000 }).catch(() => ({})));
  }
  throw error;
} finally {
  await browser.close();
  if (backend.connected) { backend.send('close'); await new Promise(resolve => backend.once('exit', resolve)); }
}
