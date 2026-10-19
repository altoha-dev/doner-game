// Real Chromium + Phaser. Synthetic Telegram/API fixtures only; never touches real accounts.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
const base = process.env.BROWSER_TEST_URL ?? 'http://127.0.0.1:5185';
const production = process.env.BROWSER_TEST_PRODUCTION === '1';
const shots = process.env.BROWSER_SCREENSHOT_DIR ?? '../../artifacts/stage-6';
await mkdir(shots, { recursive: true });
const browser = await chromium.launch();
let checks = 0;
async function context(authenticated = false) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(), errors = [], requests = [];
  const progress = { doners: 42, goldenDoners: 3, campaignStage: 2, unlockedCharacterIds: ['altoha', 'aigerim', 'temik'], selectedCharacterId: 'altoha' };
  const profile = { user: { id: 'test', telegramId: '123456', firstName: 'Антон', lastName: null, username: 'winter_friend', photoUrl: 'https://example.com/avatar.svg', languageCode: 'ru' }, progress };
  page.on('pageerror', e => errors.push(e.message)); page.on('request', r => requests.push({ url: r.url(), method: r.method() }));
  await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
  await page.route('https://example.com/avatar.svg', r => r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="#f79545"/></svg>' }));
  await page.addInitScript(auth => {
    const handlers = new Set();
    window.__back = () => { for (const cb of [...handlers]) cb(); }; window.__handlers = () => handlers.size;
    window.Telegram = { WebApp: { initData: auth ? 'synthetic-init-data' : '', initDataUnsafe: { start_param: 'solo' }, themeParams: {}, ready() {}, expand() {}, isVersionAtLeast() { return true; }, setHeaderColor() {}, setBackgroundColor() {}, onEvent() {}, offEvent() {}, isVerticalSwipesEnabled: true, disableVerticalSwipes() { this.isVerticalSwipesEnabled = false; }, enableVerticalSwipes() { this.isVerticalSwipesEnabled = true; }, BackButton: { show() {}, hide() {}, onClick(cb) { handlers.add(cb); }, offClick(cb) { handlers.delete(cb); } } } };
  }, authenticated);
  const respond = (r, body) => r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  await page.route('**/auth/telegram', r => respond(r, { ...profile, accessToken: 'fixture-token', expiresIn: 3600 }));
  await page.route('**/me', r => respond(r, profile));
  await page.route('**/me/character', r => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'PUT', 'access-control-allow-headers': 'authorization,content-type' } });
    const id = r.request().postDataJSON().characterId; assert.ok(progress.unlockedCharacterIds.includes(id)); progress.selectedCharacterId = id; return respond(r, { progress });
  });
  return { ctx, page, errors, requests, progress };
}
async function ready(page) { await page.getByRole('button', { name: 'ПЛАТФОРМА 1 БЕСПЛАТНО' }).waitFor(); await page.waitForFunction(() => !document.querySelector('.block-picker')?.disabled); assert.equal(await page.locator('canvas').count(), 1); }
const training = page => page.getByRole('button', { name: /ТРЕНИРОВКА Поставь/ }).click();
const choose = page => page.getByRole('button', { name: 'ПЛАТФОРМА 1 БЕСПЛАТНО' }).click();
const confirm = page => page.getByRole('button', { name: 'ПОСТАВИТЬ БЛОК', exact: true }).click();
const start = page => page.getByRole('button', { name: 'НАЧАТЬ ЗАБЕГ →' }).click();
const position = page => page.locator('.phaser-host').evaluate(e => ({ x: +e.dataset.playerX, bottom: +e.dataset.playerBottom, grounded: e.dataset.grounded === 'true' }));
async function widthChecks(page, screen) {
  for (const width of [320, 375, 390, 430, 500]) {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 }); await page.waitForTimeout(90);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow ${screen} ${width}`);
    for (const button of await page.locator('button:visible').all()) {
      const b = await button.boundingBox(); assert.ok(b.height >= 44 && b.x >= 0 && b.x + b.width <= width + 1, `${screen} target ${width}`);
    }
    if (screen !== 'home') assert.deepEqual(await page.locator('canvas').evaluate(c => [c.clientWidth / c.width, c.clientHeight / c.height]), [2, 2]);
    if (!production) await page.screenshot({ path: `${shots}/${screen}-${width}.png`, fullPage: true });
    checks++;
  }
  await page.setViewportSize({ width: 390, height: 844 });
}
async function finishRace(page) {
  await page.keyboard.down('ArrowRight');
  const deadline = Date.now() + 35000;
  while (await page.getByRole('button', { name: 'СЛЕДУЮЩИЙ РАУНД →' }).count() === 0 && Date.now() < deadline) {
    await page.keyboard.press('KeyW'); await page.waitForTimeout(480);
  }
  await page.keyboard.up('ArrowRight');
  await page.getByRole('button', { name: 'СЛЕДУЮЩИЙ РАУНД →' }).waitFor({ timeout: 1000 });
  checks++;
}
try {
  const { ctx, page, errors, requests } = await context();
  await page.goto(base); await page.getByRole('heading', { name: 'DONER GAME' }).waitFor();
  assert.equal(await page.getByText(/СЮЖЕТ|SOLO CAMPAIGN|УРОВЕНЬ 1/).count(), 0);
  assert.ok(!requests.some(r => /phaser|createGame|game-assets/.test(r.url)), 'lazy engine on Home');
  await widthChecks(page, 'home');
  for (const label of ['СОЗДАТЬ КОМНАТУ', 'ВОЙТИ ПО КОДУ']) {
    await page.getByRole('button', { name: label, exact: true }).click(); await page.getByText('Multiplayer coming in Stage 6.1').waitFor(); await page.getByRole('button', { name: '← НАЗАД', exact: true }).click(); checks++;
  }
  for (const label of ['МОЙ ПРОФИЛЬ', 'КАК ИГРАТЬ', 'НАСТРОЙКИ']) {
    await page.getByRole('button', { name: label, exact: true }).click(); await page.getByRole('heading', { name: label, exact: true }).waitFor(); await page.evaluate(() => window.__back()); checks++;
  }
  await training(page); await ready(page);
  await choose(page); await widthChecks(page, 'build');
  // Invalid protected spawn, terrain overlap, cancellation and clean valid commit.
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Блок влево', exact: true }).click();
  await page.getByText('× Старт и финиш защищены').waitFor(); assert.equal(await page.getByRole('button', { name: 'ПОСТАВИТЬ БЛОК', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: 'ОТМЕНА', exact: true }).click(); assert.equal(await page.locator('[data-testid=block-count]').textContent(), '0/12');
  await choose(page);
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Блок вправо', exact: true }).click();
  await page.getByText('× Здесь уже есть платформа').waitFor();
  await page.getByRole('button', { name: 'ОТМЕНА', exact: true }).click(); await choose(page);
  // Actual finger placement on canvas; existing preview position is preserved by tapping its center.
  if (!production) {
    await page.locator('canvas').scrollIntoViewIfNeeded(); await page.waitForTimeout(120);
    const box = await page.locator('canvas').boundingBox();
    const camera = await page.locator('.phaser-host').evaluate(e => ({ x: +e.dataset.cameraX, y: +e.dataset.cameraY }));
    await page.touchscreen.tap(box.x + (192 - camera.x) * 2, box.y + (248 - camera.y) * 2);
    assert.equal(await page.locator('.placement-status').getAttribute('data-valid'), 'true');
  }
  await confirm(page); assert.equal(await page.locator('[data-testid=block-count]').textContent(), '1/12');
  await start(page); await widthChecks(page, 'race');
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(500); await page.keyboard.up('ArrowRight');
  if (!production) {
    const before = await position(page); assert.ok(before.x > 60);
    await page.keyboard.press('KeyW'); await page.waitForTimeout(120); assert.ok((await position(page)).bottom < before.bottom - 8, 'jump');
  }
  await page.getByRole('button', { name: 'ПАУЗА', exact: true }).click();
  const paused = !production ? await position(page) : null;
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(200); await page.keyboard.up('ArrowRight');
  if (paused) assert.deepEqual(await position(page), paused);
  await page.getByRole('button', { name: 'ПРОДОЛЖИТЬ', exact: true }).click();
  // Land on the placed block (x176..208, y240); test the collider, not just pixels.
  if (!production) {
    await page.waitForFunction(() => document.querySelector('.phaser-host')?.dataset.grounded === 'true');
    await page.keyboard.down('ArrowRight');
    await page.waitForFunction(() => +document.querySelector('.phaser-host').dataset.playerX >= 149);
    await page.keyboard.press('KeyW');
    await page.waitForFunction(() => +document.querySelector('.phaser-host').dataset.playerX >= 186);
    await page.keyboard.up('ArrowRight');
    await page.waitForFunction(() => { const d = document.querySelector('.phaser-host').dataset; return d.grounded === 'true' && +d.playerBottom === 240; }, { timeout: 3000 });
    assert.ok((await position(page)).x <= 213, 'standing on the new collider'); checks++;
    await page.screenshot({ path: `${shots}/placed-block-collision.png`, fullPage: true });
  }
  await finishRace(page);
  if (!production) await page.screenshot({ path: `${shots}/results.png`, fullPage: true });
  for (let round = 2; round <= (production ? 2 : 3); round++) {
    await page.getByRole('button', { name: 'СЛЕДУЮЩИЙ РАУНД →' }).click(); await ready(page);
    assert.equal(await page.locator('[data-testid=block-count]').textContent(), `${round - 1}/12`);
    if (!production) { assert.equal(await page.locator('.phaser-host').getAttribute('data-placements'), String(round - 1)); await page.screenshot({ path: `${shots}/round-${round}-persistent.png`, fullPage: true }); }
    await choose(page); assert.equal(await page.locator('.placement-status').getAttribute('data-valid'), 'false', 'old block still occupies its position');
    for (let i = 0; i < round - 1; i++) await page.getByRole('button', { name: 'Блок вверх', exact: true }).click();
    for (let i = 0; i < (round - 1) * 2; i++) await page.getByRole('button', { name: 'Блок вправо', exact: true }).click();
    await confirm(page); await start(page);
    if (round === 3) break; // Exercise multi-touch below, then finish this third round.
    await finishRace(page);
  }
  if (!production) {
    // Multi-touch movement+jump and pointer cancellation do not stick.
    await page.waitForTimeout(200);
    const right = await page.getByRole('button', { name: 'Вправо', exact: true }).boundingBox(), jump = await page.getByRole('button', { name: 'Прыжок', exact: true }).boundingBox();
    const cdp = await ctx.newCDPSession(page);
    const touches = [{ x: right.x + 20, y: right.y + 20, id: 1 }, { x: jump.x + 20, y: jump.y + 20, id: 2 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touches }); await page.waitForTimeout(180);
    const moved = await position(page); assert.ok(moved.x > 50 && moved.bottom < 260);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); await page.waitForTimeout(350);
    const stopped = await position(page); await page.waitForTimeout(200); assert.ok(Math.abs((await position(page)).x - stopped.x) <= 1);
    await cdp.detach(); checks++;
  }
  if (!production) await finishRace(page);
  await page.getByRole('button', { name: 'НОВЫЙ МАТЧ · СБРОСИТЬ КАРТУ' }).click(); await ready(page);
  assert.equal(await page.locator('[data-testid=block-count]').textContent(), '0/12'); assert.equal(await page.locator('canvas').count(), 1); checks++;
  await page.evaluate(() => window.__back()); await page.getByRole('heading', { name: 'DONER GAME' }).waitFor();
  assert.equal(await page.locator('canvas').count(), 0); assert.equal(await page.evaluate(() => window.__handlers()), 0);
  assert.equal(await page.evaluate(() => { const e = new KeyboardEvent('keydown', { code: 'ArrowRight', bubbles: true, cancelable: true }); document.body.dispatchEvent(e); return e.defaultPrevented; }), false);
  await training(page); await ready(page); assert.equal(await page.locator('[data-testid=block-count]').textContent(), '0/12');
  assert.ok(!requests.some(r => /\/auth\/|\/me|game-assets/.test(r.url)), 'training never calls account endpoints/assets');
  assert.deepEqual(errors, []); await ctx.close(); checks++;
  // Auth, /me identity, preserved balances, character selection, Telegram lifecycle.
  const auth = await context(true);
  await auth.page.goto(base); await auth.page.getByText('Привет, Антон').waitFor(); await auth.page.getByText('@winter_friend').waitFor();
  assert.equal(await auth.page.getByAltText('Аватар Telegram').count(), 1);
  for (const id of ['aigerim', 'temik']) {
    await auth.page.getByRole('button', { name: 'ПЕРСОНАЖИ', exact: true }).click();
    await auth.page.locator(`[data-character=${id}]`).getByRole('button', { name: 'ВЫБРАТЬ', exact: true }).click();
    await auth.page.locator(`[data-character=${id}]`).getByRole('button', { name: '✓ ВЫБРАН', exact: true }).waitFor();
    await auth.page.getByRole('button', { name: 'НА ТРЕНИРОВКУ →' }).click(); await ready(auth.page);
    if (!production) assert.equal(await auth.page.locator('.phaser-host').getAttribute('data-character'), id);
    assert.equal(await auth.page.evaluate(() => window.Telegram.WebApp.isVerticalSwipesEnabled), false);
    await auth.page.evaluate(() => window.__back()); await auth.page.getByRole('heading', { name: 'DONER GAME' }).waitFor(); assert.equal(await auth.page.evaluate(() => window.Telegram.WebApp.isVerticalSwipesEnabled), true);
    assert.equal(auth.progress.doners, 42); checks++;
  }
  await auth.page.reload(); await auth.page.getByText('Привет, Антон').waitFor(); assert.equal(auth.progress.selectedCharacterId, 'temik');
  assert.equal(await auth.page.locator('.hud-coin').first().innerText(), 'DONER ×42');
  assert.ok(!auth.requests.some(r => /unlock|reward|purchase/.test(r.url))); assert.deepEqual(auth.errors, []);
  if (!production) await auth.page.screenshot({ path: `${shots}/home-telegram.png`, fullPage: true });
  await auth.ctx.close();
  // Reduced motion, desktop layout, safe areas and leaving during the lazy import.
  const extra = await context(); await extra.page.emulateMedia({ reducedMotion: 'reduce' }); await extra.page.goto(base);
  await extra.page.getByRole('heading', { name: 'DONER GAME' }).waitFor();
  assert.equal(await extra.page.locator('.winter-steam').evaluate(e => getComputedStyle(e).animationName), 'none');
  await extra.page.setViewportSize({ width: 1280, height: 900 });
  if (!production) await extra.page.screenshot({ path: `${shots}/home-desktop.png`, fullPage: true });
  await training(extra.page); await ready(extra.page);
  await extra.page.setViewportSize({ width: 390, height: 844 });
  await extra.page.evaluate(() => { document.documentElement.style.setProperty('--tg-safe-area-inset-top', '20px'); document.documentElement.style.setProperty('--tg-content-safe-area-inset-top', '30px'); document.documentElement.style.setProperty('--tg-safe-area-inset-bottom', '16px'); });
  assert.equal(await extra.page.locator('.app-shell').evaluate(e => getComputedStyle(e).paddingTop), '66px');
  await extra.page.evaluate(() => window.__back()); await extra.page.getByRole('heading', { name: 'DONER GAME' }).waitFor();
  assert.equal(await extra.page.locator('canvas').count(), 0); assert.deepEqual(extra.errors, []); await extra.ctx.close(); checks++;
  const leaving = await context();
  await leaving.page.route('**/*createGame*', async r => { await new Promise(resolve => setTimeout(resolve, 700)); await r.continue().catch(() => {}); });
  await leaving.page.goto(base); await training(leaving.page); await leaving.page.getByRole('button', { name: '← МЕНЮ' }).click(); await leaving.page.waitForTimeout(1000);
  assert.equal(await leaving.page.locator('canvas').count(), 0); assert.deepEqual(leaving.errors, []); await leaving.ctx.close(); checks++;
  console.log(`PASS ${checks} browser checks (${production ? 'production' : 'development'})`);
} finally { await browser.close(); }
