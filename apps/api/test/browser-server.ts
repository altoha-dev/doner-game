// Isolated browser QA process. No fake-auth endpoint and no production environment loading.
import { buildApp } from '../src/app.ts';
import { createDatabase } from '../src/db.ts';
import { createPlayerStore } from '../src/players.ts';
import { attachMultiplayer } from '../src/multiplayer/socket.ts';
import { config, signInitData } from './helpers.ts';
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test') || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('Isolated localhost *_test DB required');
const db = createDatabase(url), players = createPlayerStore(db);
const cfg = { ...config, databaseUrl: url, botUsername: 'doner_test_bot', corsOrigins: ['http://127.0.0.1:5186', 'http://127.0.0.1:4186'] };
const app = await buildApp(cfg, players, false);
await attachMultiplayer(app, cfg, players, db, { buildMs: 60000, raceMs: 60000, reconnectGraceMs: 3000, roomTtlMs: 600000 });
const seed = Date.now();
const fixtures = [0, 1].map(i => ({ initData: signInitData({ user: JSON.stringify({ id: 5200000000000000 + seed + i, first_name: i ? 'Айгерим' : 'Антон', username: i ? 'friend_b' : 'friend_a' }) }) }));
const ids: string[] = [];
for (const fixture of fixtures) {
  const auth = await app.inject({ method: 'POST', url: '/auth/telegram', payload: fixture }); const id = auth.json().user.id; ids.push(id);
  await db.playerProgress.update({ where: { userId: id }, data: { doners: 42 } });
}
await app.listen({ host: '127.0.0.1', port: 3014 });
process.send?.({ fixtures });
let closing = false;
async function close() {
  if (closing) return; closing = true; await app.close();
  await db.room.deleteMany({ where: { players: { some: { userId: { in: ids } } } } });
  await db.user.deleteMany({ where: { id: { in: ids } } }); await db.$disconnect(); process.exit(0);
}
process.on('SIGTERM', () => { void close(); }); process.on('SIGINT', () => { void close(); }); process.on('message', message => { if (message === 'close') void close(); });
