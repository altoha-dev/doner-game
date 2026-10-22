// Local Training uses real Phaser input and the shared hazards world, no API/database mocks.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
const base = process.env.BROWSER_TEST_URL ?? 'http://127.0.0.1:5186', production = process.env.BROWSER_TEST_PRODUCTION === '1';
const shots = `../../artifacts/stage-6.2/training-traps-${production ? 'production' : 'development'}`;
await mkdir(shots, { recursive: true });
const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const errors = [], requests = []; page.on('pageerror', e => errors.push(e.message)); page.on('request', r => requests.push(r.url()));
await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
async function choose(name, dx, dy, rotation = false) {
  await page.getByRole('button', { name: `${name} БЕСПЛАТНО`, exact: true }).click();
  for (let i = 0; i < Math.abs(dx); i++) await page.getByRole('button', { name: dx < 0 ? 'Блок влево' : 'Блок вправо', exact: true }).click();
  for (let i = 0; i < dy; i++) await page.getByRole('button', { name: 'Блок вниз', exact: true }).click();
  if (rotation) await page.getByRole('button', { name: 'Повернуть ловушку' }).click();
  await page.getByRole('button', { name: `ПОСТАВИТЬ ${name === 'ПЛАТФОРМА 1' ? 'БЛОК' : name}`, exact: true }).click();
  await page.getByRole('button', { name: 'НАЧАТЬ ЗАБЕГ →' }).click();
}
async function finish() {
  await page.keyboard.down('ArrowRight'); const end = Date.now() + 40000;
  while (Date.now() < end && !await page.getByRole('button', { name: 'СЛЕДУЮЩИЙ РАУНД →' }).count()) { await page.keyboard.press('KeyW'); await page.waitForTimeout(400); }
  await page.keyboard.up('ArrowRight'); assert.ok(Date.now() < end, 'Training finish timeout');
}
try {
  await page.goto(base); await page.getByRole('button', { name: /ТРЕНИРОВКА Поставь/ }).click();
  await choose('FAN', 3, 1);
  if (!production) {
    await page.keyboard.down('ArrowRight'); const jumping = setInterval(() => { void page.keyboard.press('KeyW'); }, 350);
    try { await page.waitForFunction(() => +document.querySelector('.phaser-host').dataset.playerX >= 233); } finally { clearInterval(jumping); await page.keyboard.up('ArrowRight'); }
    await page.waitForFunction(() => +document.querySelector('.phaser-host').dataset.playerBottom < 205);
    await page.screenshot({ path: `${shots}/fan.png`, fullPage: true });
    await page.getByRole('button', { name: 'ПАУЗА', exact: true }).click();
    const tick = await page.locator('.phaser-host').evaluate(e => JSON.parse(e.dataset.trapState).tick);
    await page.waitForTimeout(300); assert.equal(await page.locator('.phaser-host').evaluate(e => JSON.parse(e.dataset.trapState).tick), tick);
    await page.getByRole('button', { name: 'ДАЛЬШЕ', exact: true }).click();
  }
  await finish(); await page.getByRole('button', { name: 'СЛЕДУЮЩИЙ РАУНД →' }).click();
  assert.equal(await page.getByTestId('block-count').textContent(), '1/12');
  await choose('CROSSBOW', -1, 1, true);
  if (!production) {
    await page.waitForFunction(() => JSON.parse(document.querySelector('.phaser-host').dataset.playerLife)?.phase === 'HIT');
    await page.waitForFunction(() => JSON.parse(document.querySelector('.phaser-host').dataset.playerLife)?.phase === 'ALIVE');
    const life = await page.locator('.phaser-host').evaluate(e => JSON.parse(e.dataset.playerLife)); assert.equal(life.failures, 1);
    await page.screenshot({ path: `${shots}/respawn.png`, fullPage: true });
  } else await page.waitForTimeout(3400);
  await finish(); await page.getByRole('button', { name: 'СЛЕДУЮЩИЙ РАУНД →' }).click();
  assert.equal(await page.getByTestId('block-count').textContent(), '2/12');
  await choose('ПЛАТФОРМА 1', 11, 0); assert.equal(await page.getByTestId('block-count').textContent(), '3/12');
  assert.ok(!requests.some(url => /\/auth\/|\/me|unlock|purchase|reward/.test(url)));
  assert.deepEqual(errors, []); console.log(`PASS Training traps (${production ? 'production' : 'development'}): fan, bow, respawn, finish, 3 persistent types, no account requests`);
} catch (error) { await page.screenshot({ path: `${shots}/failure.png`, fullPage: true }); throw error; }
finally { await browser.close(); }
