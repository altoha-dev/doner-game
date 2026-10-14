// Run against Vite dev with VITE_API_URL=http://127.0.0.1:3013. No real API or account is used.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.BROWSER_TEST_URL ?? 'http://127.0.0.1:5185';
const production = process.env.BROWSER_TEST_PRODUCTION === '1';
const browser = await chromium.launch();
const widths = [320, 375, 390, 430, 500];
const themes = { altoha: 'altoha-city', aigerim: 'aigerim-imperial', temik: 'temik-bazaar' };
let checks = 0;
async function context(authenticated = false, selected = 'altoha', owned = ['altoha']) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  const requests = [];
  const progress = { doners: 2, goldenDoners: 0, campaignStage: 0, unlockedCharacterIds: owned, selectedCharacterId: selected };
  const profile = { user: { id: 'test', telegramId: '123456', firstName: 'Игрок', lastName: null, username: null, photoUrl: null, languageCode: 'ru' }, progress };
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push({ url: request.url(), method: request.method(), body: request.postData() }));
  await page.route('https://telegram.org/**', route => route.fulfill({ body: '' }));
  await page.addInitScript(auth => {
    const back = new Set();
    window.__pressTelegramBack = () => { for (const callback of [...back]) callback(); };
    window.__backHandlers = () => back.size;
    window.Telegram = { WebApp: {
      initData: auth ? 'synthetic-test-init-data' : '', initDataUnsafe: {}, themeParams: {},
      ready() {}, expand() {}, isVersionAtLeast() { return true; }, setHeaderColor() {}, setBackgroundColor() {}, onEvent() {}, offEvent() {},
      isVerticalSwipesEnabled: true,
      disableVerticalSwipes() { this.isVerticalSwipesEnabled = false; },
      enableVerticalSwipes() { this.isVerticalSwipesEnabled = true; },
      BackButton: { show() {}, hide() {}, onClick(cb) { back.add(cb); }, offClick(cb) { back.delete(cb); } },
    } };
  }, authenticated);
  const respond = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  await page.route('**/auth/telegram', route => respond(route, { ...profile, accessToken: 'test-memory-token', expiresIn: 3600 }));
  await page.route('**/me', route => respond(route, profile));
  await page.route('**/me/character', route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'PUT', 'access-control-allow-headers': 'authorization,content-type' } });
    const id = route.request().postDataJSON().characterId;
    assert.ok(progress.unlockedCharacterIds.includes(id));
    progress.selectedCharacterId = id;
    return respond(route, { progress });
  });
  return { ctx, page, errors, requests, progress };
}
const campaign = page => page.getByRole('button', { name: 'СЮЖЕТ Твоя собственная история' }).click();
async function ready(page) {
  await page.locator('.game-pause:not(:disabled)').waitFor();
  assert.equal(await page.locator('canvas').count(), 1);
  assert.equal(await page.evaluate(() => window.Telegram.WebApp.isVerticalSwipesEnabled), !await page.evaluate(() => Boolean(window.Telegram.WebApp.initData)));
  if (!production) await page.waitForFunction(() => document.querySelector('.phaser-host')?.dataset.grounded === 'true');
}
const position = page => page.locator('.phaser-host').evaluate(e => ({ x: +e.dataset.playerX, y: +e.dataset.playerY, camera: +e.dataset.cameraX }));
async function checkWidths(page) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    await page.waitForTimeout(80);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}`);
    for (const button of await page.locator('button:visible').all()) {
      const box = await button.boundingBox();
      assert.ok(box.height >= 44 && box.x >= 0 && box.x + box.width <= width + 1, `touch target at ${width}`);
    }
    const canvas = await page.locator('canvas').boundingBox();
    const controls = await page.locator('.game-controls').boundingBox();
    assert.ok(canvas.x >= 0 && canvas.x + canvas.width <= width);
    assert.ok(controls.y >= canvas.y + canvas.height && controls.y + controls.height <= (width === 320 ? 568 : 844));
    const scale = await page.locator('canvas').evaluate(c => [c.getBoundingClientRect().width / c.width, c.getBoundingClientRect().height / c.height]);
    assert.deepEqual(scale, [2, 2]);
    checks++;
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    for (const [name, value] of Object.entries({ '--tg-safe-area-inset-top': '20px', '--tg-content-safe-area-inset-top': '30px', '--tg-safe-area-inset-bottom': '16px', '--tg-content-safe-area-inset-bottom': '24px' })) document.documentElement.style.setProperty(name, value);
  });
  await page.waitForTimeout(80);
  assert.equal(await page.locator('.app-shell').evaluate(e => getComputedStyle(e).paddingTop), '62px');
  const safeControls = await page.locator('.game-controls').boundingBox();
  assert.ok(safeControls.y + safeControls.height <= 844 - 40);
  await page.evaluate(() => {
    for (const name of ['--tg-safe-area-inset-top', '--tg-content-safe-area-inset-top', '--tg-safe-area-inset-bottom', '--tg-content-safe-area-inset-bottom']) document.documentElement.style.removeProperty(name);
  });
}
async function back(page, telegram = false, characters = false) {
  if (telegram) await page.evaluate(() => window.__pressTelegramBack());
  else await page.getByRole('button', { name: 'НАЗАД', exact: true }).click();
  await page.locator(characters ? '.character-list' : '.level-map').waitFor();
  assert.equal(await page.locator('canvas').count(), 0);
  assert.equal(await page.evaluate(() => window.__backHandlers()), 1);
  assert.equal(await page.evaluate(() => window.Telegram.WebApp.isVerticalSwipesEnabled), true);
  assert.equal(await page.evaluate(() => {
    const event = new KeyboardEvent('keydown', { code: 'ArrowRight', bubbles: true, cancelable: true });
    document.body.dispatchEvent(event); return event.defaultPrevented;
  }), false, 'game keyboard listener survived unmount');
}
try {
  // Browser mode has no auth requests; local preview is absent in production.
  {
    const { ctx, page, errors, requests } = await context();
    await page.goto(base); await page.getByText('Development Mode', { exact: true }).waitFor();
    assert.ok(!requests.some(r => /phaser|createGame/.test(r.url)), 'engine eagerly loaded on Home');
    await campaign(page);
    assert.equal(await page.getByRole('button', { name: 'ИГРАТЬ · УРОВЕНЬ 1', exact: true }).isDisabled(), true);
    if (production) assert.equal(await page.locator('.local-preview').count(), 0);
    else {
      for (const [id, theme] of Object.entries(themes)) {
        await page.locator('.local-preview').getByRole('button', { name: new RegExp(id, 'i') }).click();
        await ready(page);
        assert.equal(await page.locator('.game-screen').getAttribute('data-theme'), theme);
        await checkWidths(page);
        if (process.env.BROWSER_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.BROWSER_SCREENSHOT_DIR}/doner-stage5-${id}.png`, fullPage: true });
        await back(page, id === 'aigerim');
      }
      // Runtime: jump edge, gravity/landing, collision, camera, goal, bounds, pause and multi-touch.
      await page.locator('.local-preview').getByRole('button', { name: 'Altoha', exact: true }).click(); await ready(page);
      const start = await position(page);
      await page.keyboard.down('Space'); await page.waitForTimeout(180);
      assert.ok((await position(page)).y < start.y - 15);
      await page.waitForTimeout(650);
      assert.ok(Math.abs((await position(page)).y - start.y) <= 1, 'held jump auto-repeated');
      await page.keyboard.up('Space');
      // Browser-native multi-touch: pointer capture and cancellation included.
      const touch = await page.context().newCDPSession(page);
      const right = await page.getByRole('button', { name: 'Вправо', exact: true }).boundingBox();
      const jump = await page.getByRole('button', { name: 'Прыжок', exact: true }).boundingBox();
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
        { x: right.x + right.width / 2, y: right.y + right.height / 2, id: 11 },
        { x: jump.x + jump.width / 2, y: jump.y + jump.height / 2, id: 12 },
      ] });
      await page.waitForTimeout(180);
      assert.ok((await position(page)).x > start.x + 5 && (await position(page)).y < start.y - 15);
      await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      await touch.detach();
      await page.waitForTimeout(800);
      const stopped = await position(page); await page.waitForTimeout(150); assert.equal((await position(page)).x, stopped.x);
      await page.keyboard.down('KeyD'); await page.waitForTimeout(450);
      await page.getByRole('button', { name: 'ПАУЗА', exact: true }).click();
      await page.waitForTimeout(80); const frozen = await position(page);
      await page.waitForTimeout(220); assert.deepEqual(await position(page), frozen);
      await page.keyboard.up('KeyD'); await page.getByRole('button', { name: 'ВЕРНУТЬСЯ В ИГРУ' }).click();
      await page.keyboard.down('ArrowRight'); await page.waitForTimeout(3000);
      assert.ok((await position(page)).x <= 341, 'walked through solid obstacle');
      assert.ok((await position(page)).camera > 0, 'camera did not follow');
      for (let i = 0; i < 36 && (await position(page)).x < 1134; i++) {
        await page.keyboard.press(i % 2 ? 'KeyW' : 'ArrowUp'); await page.waitForTimeout(480);
      }
      await page.keyboard.up('ArrowRight');
      assert.ok((await position(page)).x >= 1132, `goal not reached: ${JSON.stringify(await position(page))}`);
      await page.getByText('Ты у флага!', { exact: false }).waitFor();
      await page.keyboard.down('ArrowRight'); await page.waitForTimeout(900); await page.keyboard.up('ArrowRight');
      assert.ok((await position(page)).x >= 1190 && (await position(page)).x <= 1195, 'right world bound did not stop the player');
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await page.getByRole('button', { name: 'ВЕРНУТЬСЯ В ИГРУ' }).waitFor();
      await back(page);
      // Enter and immediately leave again (lazy import / scene boot race).
      await page.locator('.local-preview').getByRole('button', { name: 'Altoha', exact: true }).click();
      await back(page); await page.waitForTimeout(100); assert.equal(await page.locator('canvas').count(), 0);
    }
    assert.equal(requests.filter(r => r.url.endsWith('/auth/telegram')).length, 0);
    assert.deepEqual(errors, []); await ctx.close();
  }
  // Server-response fixtures drive the existing auth hook; ownership never comes from initDataUnsafe.
  for (const [id, theme] of Object.entries(themes)) {
    const { ctx, page, errors, requests, progress } = await context(true, id, [id]);
    await page.goto(base); await page.locator('.account-connected').waitFor(); await campaign(page);
    const before = structuredClone(progress);
    await page.getByRole('button', { name: 'ИГРАТЬ · УРОВЕНЬ 1', exact: true }).click(); await ready(page);
    assert.equal(await page.locator('.game-screen').getAttribute('data-theme'), theme);
    await checkWidths(page); await back(page, true);
    await page.getByRole('button', { name: 'ВЫБРАТЬ ПЕРСОНАЖА' }).click();
    await page.getByRole('button', { name: new RegExp(`ИГРАТЬ · УРОВЕНЬ 1 · ${id}`, 'i') }).click(); await ready(page);
    await back(page, false, true);
    assert.deepEqual(progress, before);
    assert.equal(requests.filter(r => r.method !== 'GET' && /\/me|\/characters/.test(r.url)).length, 0, 'game wrote progress');
    assert.ok(requests.some(r => r.url.endsWith('/auth/telegram') && JSON.parse(r.body).initData === 'synthetic-test-init-data'));
    await page.reload(); await page.locator('.account-connected').waitFor();
    assert.ok((await page.locator('.hud-character').innerText()).toLowerCase().includes(id));
    assert.deepEqual(errors, []); await ctx.close();
  }
  for (const selected of ['aigerim', null, 'unknown']) {
    const { ctx, page, errors } = await context(true, selected, ['altoha']);
    await page.goto(base); await page.locator('.account-connected').waitFor(); await campaign(page);
    assert.equal(await page.getByRole('button', { name: 'ИГРАТЬ · УРОВЕНЬ 1', exact: true }).isDisabled(), true);
    assert.equal(await page.locator('.local-preview').count(), 0);
    await page.getByRole('button', { name: 'ВЫБРАТЬ ПЕРСОНАЖА' }).click();
    assert.equal(await page.getByRole('button', { name: 'ИГРАТЬ · УРОВЕНЬ 1', exact: true }).isDisabled(), true);
    await page.locator('[data-character=altoha]').getByRole('button', { name: 'ВЫБРАТЬ', exact: true }).click();
    await page.locator('[data-character=altoha]').getByRole('button', { name: 'ВЫБРАН', exact: true }).waitFor();
    await page.getByRole('button', { name: /ИГРАТЬ · УРОВЕНЬ 1 · Altoha/ }).click(); await ready(page);
    assert.equal(await page.locator('.game-screen').getAttribute('data-theme'), 'altoha-city');
    assert.deepEqual(errors, []); await ctx.close();
  }
  console.log(`PASS ${production ? 'production' : 'development'}: ${checks} theme/width checks; launch, auth fixtures, ownership, Back, cleanup, controls${production ? '' : ', movement, jump, collision, camera, goal, bounds, pause, preview'}`);
} finally { await browser.close(); }
