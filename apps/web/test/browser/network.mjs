// Real clocks, two isolated Chromium contexts, real JWT/API/PG/Socket.IO/Phaser.
// Delay/drop actual websocket frames; no synthetic gameplay states or position setters.
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const base = process.env.BROWSER_TEST_URL ?? 'http://127.0.0.1:5186';
const shots = fileURLToPath(new URL('../../../../artifacts/stage-6.1.6/', import.meta.url));
await mkdir(shots, { recursive: true });
const backend = fork('test/browser-server.ts', { cwd: fileURLToPath(new URL('../../../api/', import.meta.url)), env: { ...process.env, BROWSER_INTERACTIONS: '1' }, execArgv: ['--import', 'tsx'], stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
backend.stderr.on('data', data => process.stderr.write(data));
const fixture = await new Promise((resolve, reject) => { backend.once('message', resolve); backend.once('exit', code => reject(new Error(`fixture API exited ${code}`))); });
const browser = await chromium.launch();
const errors = [], clients = [], results = [];
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
      setTimeout(() => send(message), Math.max(1, delay));
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
const data = page => page.locator('.phaser-host').evaluate(e => ({ ...e.dataset }));
const record = (page, duration) => page.evaluate(ms => new Promise(resolve => {
  const rows = [], end = performance.now() + ms;
  function sample() {
    const d = document.querySelector('.phaser-host').dataset;
    const actors = JSON.parse(d.renderedPlayers);
    rows.push({ at: performance.now(), x: actors[0].x, y: actors[0].y, peerX: actors[1].x, peerY: actors[1].y, camera: Number(d.cameraX), support: Boolean(d.playerSupport) });
    if (performance.now() < end) requestAnimationFrame(sample); else resolve(rows);
  }
  requestAnimationFrame(sample);
}), duration);
function metrics(rows) {
  const steps = rows.slice(1).map((p, i) => Math.hypot(p.x - rows[i].x, p.y - rows[i].y));
  const camera = rows.slice(1).map((p, i) => Math.abs(p.camera - rows[i].camera));
  return { frames: rows.length, maxFrameStep: Math.max(...steps), stepsOver8: steps.filter(x => x > 8).length, maxCameraStep: Math.max(...camera), fps: 1000 * (rows.length - 1) / (rows.at(-1).at - rows[0].at) };
}
try {
  const A = await client(0), B = await client(1);
  for (profile of [{ name: 'rtt40', rtt: 40 }, { name: 'rtt80', rtt: 80 }, { name: 'rtt150', rtt: 150 }, { name: 'jitter', rtt: 80 }, { name: 'stall-loss', rtt: 80 }]) {
    stage = `${profile.name} room`; impairmentAt = Infinity;
    await A.getByRole('button', { name: 'СОЗДАТЬ КОМНАТУ', exact: true }).click();
    await A.getByLabel('Количество мест').selectOption('2'); await A.getByRole('button', { name: 'СОЗДАТЬ КОМНАТУ · 2' }).click();
    const code = await A.getByTestId('room-code').textContent();
    await B.getByRole('button', { name: 'ВОЙТИ ПО КОДУ', exact: true }).click();
    await B.getByLabel('Код комнаты').fill(code); await B.getByRole('button', { name: 'ПРИСОЕДИНИТЬСЯ', exact: true }).click();
    for (const page of [A, B]) { await page.getByRole('button', { name: 'Ayazhan', exact: true }).click(); await page.getByRole('button', { name: 'ГОТОВ', exact: true }).click(); }
    await A.getByRole('button', { name: 'НАЧАТЬ МАТЧ →' }).click();
    for (const page of [A, B]) await page.getByRole('button', { name: 'ПРОПУСТИТЬ РАЗМЕЩЕНИЕ' }).click();
    for (const page of [A, B]) await page.getByRole('heading', { name: /RACE/ }).waitFor();
    await A.waitForTimeout(1200);
    assert.equal(await A.locator('.network-debug').count(), 1);
    stage = `${profile.name} opposing/push`;
    const traces = [record(A, 2000), record(B, 2000)]; impairmentAt = Date.now();
    await A.keyboard.down('ArrowRight'); await B.keyboard.down('ArrowLeft'); await A.waitForTimeout(400);
    await B.keyboard.up('ArrowLeft'); await A.waitForTimeout(700); await A.keyboard.up('ArrowRight');
    const push = (await Promise.all(traces)).map(metrics);
    assert.ok(push.every(m => m.maxFrameStep < 8), `${stage}: ${JSON.stringify(push)}`);
    stage = `${profile.name} head landing`;
    const authority = JSON.parse((await data(A)).authoritativePlayers), bId = authority.find(p => p.seat === 1).playerId;
    const target = authority.find(p => p.seat === 1).x;
    await A.keyboard.down('ArrowRight'); await A.keyboard.press('KeyW');
    await A.waitForFunction(x => Number(document.querySelector('.phaser-host').dataset.playerX) >= x - 7, target);
    await A.keyboard.up('ArrowRight');
    await A.waitForFunction(id => document.querySelector('.phaser-host').dataset.playerSupport === id, bId, { timeout: 5000 });
    await A.waitForTimeout(400);
    stage = `${profile.name} moving/jumping support`;
    const riders = [record(A, 1800), record(B, 1800)];
    await B.keyboard.down('ArrowRight'); await A.waitForTimeout(400); await B.keyboard.press('KeyW'); await A.waitForTimeout(400); await B.keyboard.up('ArrowRight');
    const riderRows = await Promise.all(riders), ride = riderRows.map(metrics);
    const heights = riderRows[0].filter(p => p.support).map(p => p.peerY - p.y);
    assert.ok(heights.length > 30); assert.ok(heights.every(h => Math.abs(h - 21) < .01), `head contact drift ${Math.min(...heights)}..${Math.max(...heights)}`);
    const headY = Number((await data(A)).playerBottom);
    await A.keyboard.press('KeyW'); await A.waitForFunction(y => Number(document.querySelector('.phaser-host').dataset.playerBottom) < y - 8, headY);
    await A.waitForTimeout(900);
    const diagnostics = await Promise.all([A, B].map(async p => JSON.parse((await data(p)).networkDiagnostics)));
    // Jitter is applied independently on both legs, down to -15ms each.
    assert.ok(diagnostics.every(d => d.rttMs >= profile.rtt - (profile.name === 'jitter' ? 35 : 15) && d.fps >= 30 && d.snapshotHz >= 8), JSON.stringify(diagnostics));
    await A.screenshot({ path: `${shots}/network-${profile.name}.png`, fullPage: true });
    results.push({ profile: profile.name, addedRttMsPerClient: profile.rtt, push, ride, headHeightRange: [Math.min(...heights), Math.max(...heights)], diagnostics });
    await writeFile(`${shots}/browser-network.json`, JSON.stringify({ environment: 'Headless Chromium, 2 mobile contexts, real wall-clock websocket delays on BOTH clients; not real phones or Internet', results }, null, 2));
    console.log(`PASS ${profile.name}: opposing/push, moving/jumping support, first head jump, diagnostics; FPS ${push.map(x => x.fps.toFixed(1))}`);
    for (const page of [A, B]) { await page.evaluate(() => window.__back()); await page.getByRole('button', { name: 'ВЫЙТИ ИЗ КОМНАТЫ' }).click(); await page.getByRole('heading', { name: 'DONER GAME' }).waitFor(); assert.equal(await page.locator('.network-debug').count(), 0); }
  }
  assert.deepEqual(errors, []);
  await writeFile(`${shots}/browser-network.json`, JSON.stringify({ environment: 'Headless Chromium, 2 mobile contexts, real wall-clock websocket delays on BOTH clients; not real phones or Internet', results }, null, 2));
} catch (error) {
  console.error(`Failed ${stage}`);
  for (const [i, { page }] of clients.entries()) await page.screenshot({ path: `${shots}/network-failure-${i}.png`, fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser.close();
  if (backend.connected) { backend.send('close'); await new Promise(resolve => backend.once('exit', resolve)); }
}
