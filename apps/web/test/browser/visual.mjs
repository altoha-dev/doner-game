// Presentation-only QA: actual Cyrillic font use, local assets, reduced motion and trap artwork.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const base = process.env.BROWSER_TEST_URL ?? 'http://127.0.0.1:5186';
const shots = process.env.BROWSER_SCREENSHOT_DIR ?? '../../artifacts/stage-6.3.5/visual';
await mkdir(shots, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const errors = [], requests = [], fonts = [];
page.on('pageerror', e => errors.push(e.message));
page.on('request', r => requests.push(r.url()));
await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
try {
  await page.goto(base); await page.getByRole('heading', { name: 'DONER GAME' }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.evaluate(() => document.fonts.check('600 21px "Pixelify Sans"', 'ИГРАТЬ С ДРУЗЬЯМИ')), true);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument');
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.main-play > span' });
  fonts.push(...(await cdp.send('CSS.getPlatformFontsForNode', { nodeId })).fonts);
  assert.ok(fonts.some(f => f.isCustomFont && f.familyName === 'Pixelify Sans' && f.glyphCount >= 15), 'Cyrillic rendered by bundled font');
  assert.equal(fonts.filter(f => !f.isCustomFont).length, 0, 'no Cyrillic fallback');
  await cdp.detach();
  const play = page.locator('.main-play'); await play.focus();
  assert.notEqual(await play.evaluate(e => getComputedStyle(e).outlineStyle), 'none');
  await page.screenshot({ path: `${shots}/home-focus.png`, fullPage: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const selector of ['.winter-steam', '.winter-snow']) assert.equal(await page.locator(selector).evaluate(e => getComputedStyle(e).animationName), 'none');
  await page.getByRole('button', { name: /ТРЕНИРОВКА Поставь/ }).click();
  await page.waitForFunction(() => document.querySelector('.block-picker')?.disabled === false);
  const names = ['ПЛАТФОРМА 1 БЕСПЛАТНО', 'FAN БЕСПЛАТНО', 'CROSSBOW БЕСПЛАТНО'];
  for (let i = 0; i < names.length; i++) {
    await page.getByRole('button', { name: names[i], exact: true }).click();
    if (i) await page.getByRole('button', { name: 'Повернуть ловушку' }).click();
    await page.screenshot({ path: `${shots}/preview-${i}.png`, fullPage: true });
    await page.getByRole('button', { name: 'ОТМЕНА', exact: true }).click();
  }
  assert.equal(await page.locator('.trap-art').count(), 3);
  assert.ok(requests.some(u => u === `${base}/fonts/PixelifySans.ttf`));
  assert.ok(!requests.some(u => /fonts\.googleapis|fonts\.gstatic|\/auth\/|\/me(?:$|\/)/.test(u)));
  assert.deepEqual(errors, []);
  await writeFile(`${shots}/typography.json`, JSON.stringify({ base, fonts, reducedMotion: 'steam and snow disabled', errors }, null, 2));
  console.log('PASS visual QA: bundled Cyrillic font without fallback, keyboard focus, reduced motion, three trap previews, local assets');
} finally { await browser.close(); }
