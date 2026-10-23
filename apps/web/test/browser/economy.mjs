// Two actual mobile Chromium clients, signed test Telegram accounts, real Socket.IO + isolated PG.
// Only input commands are replayed; scores, placements, rewards and snapshots are never fabricated.
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const base = process.env.BROWSER_TEST_URL ?? 'http://127.0.0.1:5186';
const production = process.env.BROWSER_TEST_PRODUCTION === '1';
const shots = process.env.BROWSER_SCREENSHOT_DIR ?? fileURLToPath(new URL(`../../../../artifacts/stage-6.3/${production ? 'production' : 'development'}/`, import.meta.url));
await mkdir(shots, { recursive: true });
const backend = fork('test/browser-server.ts', { cwd: fileURLToPath(new URL('../../../api/', import.meta.url)), env: { ...process.env, BROWSER_ECONOMY: '1' }, execArgv: ['--import', 'tsx'], stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
backend.stderr.on('data', data => process.stderr.write(data));
const fixture = await new Promise((resolve, reject) => { backend.once('message', resolve); backend.once('exit', code => reject(new Error(`fixture API exited ${code}`))); });
const browser = await chromium.launch();
const errors = [], clients = [], results = [], roomSnapshots = [[], []], previews = [[], []];
let duplicates = 0, stage = 'startup';
async function client(index) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.routeWebSocket('**/socket.io/**', socket => {
    const server = socket.connectToServer();
    socket.onMessage(message => {
      server.send(message);
      if (String(message).includes('"type":"PLACE"')) { duplicates++; setTimeout(() => server.send(message), 150); }
    });
    server.onMessage(message => {
      if (String(message).startsWith('42[')) {
        const [event, value] = JSON.parse(String(message).slice(2));
        if (event === 'room:snapshot') roomSnapshots[index].push(value);
        if (event === 'build:previews') previews[index].push(value);
      }
      socket.send(message);
    });
  });
  await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
  await page.addInitScript(initData => {
    const back = new Set(); window.__back = () => back.forEach(fn => fn());
    window.Telegram = { WebApp: { initData, initDataUnsafe: {}, themeParams: {}, ready() {}, expand() {}, isVersionAtLeast() { return true; }, setHeaderColor() {}, setBackgroundColor() {}, onEvent() {}, offEvent() {}, disableVerticalSwipes() {}, enableVerticalSwipes() {}, BackButton: { show() {}, hide() {}, onClick(fn) { back.add(fn); }, offClick(fn) { back.delete(fn); } } } };
  }, fixture.fixtures[index].initData);
  await page.goto(base); clients.push({ context, page }); return page;
}
const button = (p, name) => p.getByRole('button', { name, exact: true });
async function balance(p, n) { await p.waitForFunction(n => document.querySelector('[data-testid=doner-balance]')?.textContent === `МОЙ БАЛАНС: ${n} DONER`, n); }
async function widths(p, label) {
  for (const width of [320,375,390,430,500]) {
    await p.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label} overflow ${width}`);
    for (const b of await p.locator('button:visible').all()) { const r=await b.boundingBox(); assert.ok(r.height>=44 && r.x>=0 && r.x+r.width<=width+1, `${label} tap ${width}`); }
    await p.screenshot({ path:`${shots}/${label}-${width}.png`, fullPage:true });
  }
  await p.setViewportSize({width:390,height:844});
}
async function choose(p,name,dx=0,up=0) {
  await button(p,name).click();
  for(let i=0;i<dx;i++) await button(p,'Блок вправо').click();
  for(let i=0;i<up;i++) await button(p,'Блок вверх').click();
}
async function run(p,delay=0) {
  await p.getByRole('heading',{name:/RACE/}).waitFor(); await p.waitForTimeout(delay);
  await p.waitForFunction(()=>document.querySelector('[aria-label=Вправо]')?.disabled===false);
  await p.keyboard.down('ArrowRight'); const end=Date.now()+20000;
  while(Date.now()<end && !await p.locator('.finish-list').count() && !await p.getByText('Ваш забег завершён. Ждём остальных…').count()) { await p.keyboard.press('KeyW'); await p.waitForTimeout(400); }
  await p.keyboard.up('ArrowRight'); assert.ok(Date.now()<end,'finish before race timeout');
}
async function settled(A,B,round) {
  for(const p of [A,B]) await p.getByText('Награды подтверждены сервером.',{exact:false}).waitFor({timeout:45000});
  assert.equal(await A.locator('.finish-list').innerText(),await B.locator('.finish-list').innerText());
  assert.equal(await A.locator('.match-scoreboard').innerText(),await B.locator('.match-scoreboard').innerText());
  const room=roomSnapshots[0].at(-1); assert.equal(room.rounds.find(r=>r.round===round).status,'SETTLED');
  console.log(`Settled round ${round}`);
  results.push({round,finishes:room.finishes.filter(f=>f.round===round).map(f=>({position:f.position,status:f.status,points:f.points,doners:f.doners})),scores:room.players.map(p=>p.score),balances:room.players.map(p=>room.balances[p.playerId])});
}
try {
 const A=await client(0),B=await client(1);
 await button(A,'СОЗДАТЬ КОМНАТУ').click(); await A.getByLabel('Количество мест').selectOption('2'); await button(A,'СОЗДАТЬ КОМНАТУ · 2').click();
 const code=await A.getByTestId('room-code').textContent();
 await button(B,'ВОЙТИ ПО КОДУ').click(); await B.getByLabel('Код комнаты').fill(code); await button(B,'ПРИСОЕДИНИТЬСЯ').click();
 for(const name of ['Altoha','Aigerim','Temik','Ayazhan']) assert.equal(await button(A,name).count(),1);
 await button(A,'Ayazhan').click(); await button(B,'Temik').click();
 for(const p of [A,B]) await button(p,'ГОТОВ').click(); await button(A,'НАЧАТЬ МАТЧ →').click();
 stage='round1 FAN / no funds'; await balance(A,5); await balance(B,0);
 assert.ok(await button(B,'FAN 2 DONER').isDisabled()); assert.ok(await button(B,'CROSSBOW 3 DONER').isDisabled());
 await choose(A,'FAN 2 DONER',11,4); await widths(A,'shop');
 await B.waitForTimeout(300); assert.ok(previews[1].some(s=>s.previews.some(p=>p.objectType==='fan')));
 await button(A,'ОТМЕНА').click(); await balance(A,5);
 await choose(A,'FAN 2 DONER',11,4); await button(A,'ПОСТАВИТЬ FAN').click(); await balance(A,3);
 await choose(B,'ПЛАТФОРМА 1 БЕСПЛАТНО'); await button(B,'ПОСТАВИТЬ БЛОК').click();
 assert.ok(await button(B,'EXTRA BLOCK 1 DONER').isDisabled()); await balance(B,0); await button(B,'ЗАВЕРШИТЬ СТРОИТЕЛЬСТВО').click();
 await run(A); await run(B); await settled(A,B,1); await balance(A,3); await balance(B,1); await widths(A,'results');
 assert.deepEqual(results[0].scores,[3,2]);
 stage='round2 CROSSBOW / EXTRA / duplicate / reconnect'; await button(A,'СЛЕДУЮЩИЙ РАУНД →').click();
 await choose(A,'CROSSBOW 3 DONER',14,4); await button(A,'ПОСТАВИТЬ CROSSBOW').click(); await balance(A,0);
 await A.reload(); await A.getByRole('heading',{name:/BUILD/}).waitFor(); await balance(A,0); assert.equal(await A.getByTestId('block-count').textContent(),'3/20');
 await choose(B,'ПЛАТФОРМА 1 БЕСПЛАТНО',2,1); await button(B,'ПОСТАВИТЬ БЛОК').click(); await balance(B,1);
 await choose(B,'EXTRA BLOCK 1 DONER'); assert.ok(await button(B,'ПОСТАВИТЬ БЛОК').isDisabled(),'overlap cannot purchase'); await balance(B,1);
 await button(B,'ОТМЕНА').click(); await balance(B,1);
 await choose(B,'EXTRA BLOCK 1 DONER',4,2); await button(B,'ПОСТАВИТЬ БЛОК').click(); await balance(B,0);
 assert.equal(await B.getByTestId('block-count').textContent(),'5/20');
 await run(A); await run(B); await settled(A,B,2); await balance(A,0); await balance(B,1);
 assert.deepEqual(results[1].scores,[6,4]);
 for(const round of [3,4]) {
  stage=`round${round} score accumulation`; await button(A,'СЛЕДУЮЩИЙ РАУНД →').click();
  assert.ok(await button(A,'FAN 2 DONER').isDisabled()); assert.ok(await button(A,'CROSSBOW 3 DONER').isDisabled());
  for(const p of [A,B]) await button(p,'ПРОПУСТИТЬ РАЗМЕЩЕНИЕ').click();
  await run(B); await run(A); await settled(A,B,round);
 }
 assert.deepEqual(results[3].scores,[10,10]); await balance(A,2); await balance(B,1);
 stage='round5 idle DNF / shared victory'; await button(A,'СЛЕДУЮЩИЙ РАУНД →').click();
 for(const p of [A,B]) await button(p,'ПРОПУСТИТЬ РАЗМЕЩЕНИЕ').click();
 await settled(A,B,5); assert.ok(results[4].finishes.every(f=>f.status==='DNF'&&f.points===0&&f.doners===0));
 await button(A,'ЗАВЕРШИТЬ МАТЧ').click();
 for(const p of [A,B]) await p.getByText('ОБЩАЯ ПОБЕДА: Антон, Айгерим',{exact:true}).waitFor();
 await widths(A,'match-finished'); assert.match(await A.locator('.match-scoreboard').innerText(),/5\/5/);
 const auditPromise=new Promise(resolve=>backend.once('message',resolve)); backend.send('audit'); const {audit}=await auditPromise;
 assert.equal(audit.rooms.length,1); const room=audit.rooms[0];
 assert.equal(room.phase,'MATCH_FINISHED'); assert.equal(room.rounds.length,5); assert.ok(room.rounds.every(r=>r.settlement==='SETTLED'));
 assert.deepEqual(room.players.map(p=>p.score),[10,10]); assert.equal(room.placements.length,5);
 assert.equal(audit.transactions.filter(t=>t.transactionType==='TRAP_PURCHASE').length,3);
 assert.equal(audit.transactions.filter(t=>t.transactionType==='ROUND_REWARD').length,8);
 assert.equal(new Set(audit.transactions.map(t=>t.key)).size,11);
 assert.equal(audit.progress.reduce((n,p)=>n+p.doners,0),3); assert.ok(audit.progress.every(p=>p.goldenDoners===7)); assert.ok(duplicates>=5);
 await button(A,'В МЕНЮ').click(); await A.getByRole('heading',{name:'DONER GAME',exact:true}).waitFor();
 await A.waitForFunction(()=>document.querySelector('.hud-coin')?.textContent==='DONER ×2');
 assert.deepEqual(errors,[]); await writeFile(`${shots}/economy-browser.json`,JSON.stringify({production,results,duplicates,ledgerCount:audit.transactions.length,checks:'Real purchases, cancellation, overlap, insufficient balance, live preview, reconnect, repeat delivery, rewards, five rounds, DNF, tie victory, mobile widths, Golden preservation'},null,2));
 console.log(`PASS Stage6.3 ${production?'production':'DEV'}: five rounds, 2 clients, 3 paid placements, ${duplicates} duplicate deliveries, 8 exactly-once rewards, shared victory, mobile 320/375/390/430/500`);
} catch(error) {
 console.error(`FAIL economy ${stage}`);
 for(const [i,{page}] of clients.entries()) { await page.screenshot({path:`${shots}/failure-${i}.png`,fullPage:true}).catch(()=>{}); console.error(i,await page.locator('body').innerText().catch(()=>'')); }
 throw error;
} finally { await browser.close(); if(backend.connected) { backend.send('close'); await new Promise(r=>backend.once('exit',r)); } }
