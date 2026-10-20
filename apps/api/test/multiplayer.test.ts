import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { SNOWY_CHAOS } from '@doner-game/shared';
import type { ClientEvents, OnlineRoom, RoomCommand, ServerEvents } from '@doner-game/shared';
import { buildApp } from '../src/app.ts';
import { createDatabase } from '../src/db.ts';
import { createPlayerStore } from '../src/players.ts';
import { attachMultiplayer } from '../src/multiplayer/socket.ts';
import { config, signInitData } from './helpers.ts';
const url = process.env.TEST_DATABASE_URL;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
type Client = Socket<ServerEvents, ClientEvents>;
async function until(check: () => boolean | Promise<boolean>, ms = 4000) { const stop = Date.now() + ms; while (!await check()) { if (Date.now() > stop) assert.fail('Timed out'); await sleep(20); } }

test('real Socket.IO + PostgreSQL shared match, authorization, recovery and unchanged balances', { skip: !url && 'Requires isolated TEST_DATABASE_URL', timeout: 60000 }, async t => {
  assert.ok(url); assert.match(new URL(url).pathname, /_test$/);
  const db = createDatabase(url), players = createPlayerStore(db);
  const cfg = { ...config, databaseUrl: url, botUsername: 'doner_test_bot' };
  let app = await buildApp(cfg, players, false);
  let transport = await attachMultiplayer(app, cfg, players, db, { buildMs: 1200, raceMs: 30000, reconnectGraceMs: 150, roomTtlMs: 60000 });
  await app.listen({ host: '127.0.0.1', port: 0 });
  let address = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const clients: Client[] = [], ids: string[] = [], roomIds: string[] = [];
  t.after(async () => { clients.forEach(c => c.disconnect()); await app.close(); await db.room.deleteMany({ where: { id: { in: roomIds } } }); await db.user.deleteMany({ where: { id: { in: ids } } }); await db.$disconnect(); });
  async function login(n: number) {
    const initData = signInitData({ user: JSON.stringify({ id: 5100000000000000 + Date.now() + n, first_name: n === 1 ? 'Антон' : `Друг ${n}` }) });
    const result = await app.inject({ method: 'POST', url: '/auth/telegram', payload: { initData } }); assert.equal(result.statusCode, 200);
    const body = result.json(); ids.push(body.user.id);
    await db.playerProgress.update({ where: { userId: body.user.id }, data: { doners: 42, goldenDoners: 3 } }); return body;
  }
  const a = await login(1), b = await login(2), c = await login(3);
  async function connect(token: string) {
    const socket: Client = io(address, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true }); clients.push(socket);
    await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    return socket;
  }
  const A = await connect(a.accessToken), B = await connect(b.accessToken), C = await connect(c.accessToken);
  const request = (socket: Client, command: RoomCommand) => socket.timeout(3000).emitWithAck('room:command', command);
  const ok = async (socket: Client, command: RoomCommand) => { const reply = await request(socket, command); assert.equal(reply.ok, true, JSON.stringify(reply)); if (!reply.ok) throw new Error(); return reply.room!; };
  const fail = async (socket: Client, command: RoomCommand, code: string) => { const reply = await request(socket, command); assert.equal(reply.ok, false); if (!reply.ok) assert.equal(reply.code, code); };
  let stateA: OnlineRoom | null = null, stateB: OnlineRoom | null = null;
  A.on('room:snapshot', r => { stateA = r; }); B.on('room:snapshot', r => { stateB = r; });
  let room = await ok(A, { type: 'CREATE', capacity: 2 }); roomIds.push(room.roomId);
  await t.test('create, secure code/invite, solo start rejected, invalid code', async () => {
    assert.match(room.code, /^[A-Z2-9]{6}$/); assert.equal(room.inviteLink, `https://t.me/doner_test_bot?startapp=room_${room.code}`);
    await fail(A, { type: 'START' }, 'NEED_PLAYERS'); await fail(B, { type: 'JOIN', code: 'AAAAAA' }, 'ROOM_NOT_FOUND');
  });
  await t.test('join, capacity, no duplicate seat, room privacy', async () => {
    room = await ok(B, { type: 'JOIN', code: room.code }); assert.equal(room.players.length, 2);
    assert.equal((await ok(B, { type: 'JOIN', code: room.code })).players.length, 2);
    await fail(C, { type: 'JOIN', code: room.code }, 'ROOM_FULL'); assert.equal((await request(C, { type: 'RESUME' })).ok, true);
    await fail(C, { type: 'READY', ready: true }, 'NOT_IN_ROOM');
  });
  await t.test('room characters free and separate from account; readiness/host restrictions', async () => {
    room = await ok(B, { type: 'CHARACTER', characterId: 'temik' }); assert.equal(room.players.find(p => p.playerId === b.user.id)?.characterId, 'temik');
    assert.equal((await players.findById(b.user.id))?.progress.selectedCharacterId, 'altoha');
    await fail(B, { type: 'START' }, 'HOST_ONLY'); await fail(A, { type: 'START' }, 'NOT_READY');
    await ok(A, { type: 'READY', ready: true }); await ok(B, { type: 'READY', ready: true }); room = await ok(A, { type: 'START' }); assert.equal(room.match.phase, 'BUILD');
  });
  const placeA = { type: 'PLACE', round: 1, commandId: randomUUID(), expectedRevision: room.revision, position: { x: 176, y: 240 } } as const;
  await t.test('invalid/spoofed placement rejected and concurrent overlaps serialized', async () => {
    await fail(A, { ...placeA, position: { x: 48, y: 240 } }, 'INVALID_PLACEMENT');
    await fail(A, { ...placeA, userId: b.user.id } as RoomCommand, 'INVALID_REQUEST');
    const placeB = { ...placeA, commandId: randomUUID() };
    const responses = await Promise.all([request(A, placeA), request(B, placeB)]);
    assert.equal(responses.filter(r => r.ok).length, 1);
    const winner = responses[0]!.ok ? A : B, loser = winner === A ? B : A;
    room = await ok(winner, { type: 'RESUME' });
    await fail(loser, { ...placeA, commandId: randomUUID(), expectedRevision: room.revision }, 'INVALID_PLACEMENT');
    const duplicate = winner === A ? placeA : placeB;
    assert.equal((await ok(winner, duplicate)).match.placements.length, 1);
    room = await ok(loser, { ...placeA, commandId: randomUUID(), expectedRevision: room.revision, position: { x: 224, y: 176 } });
    assert.equal(room.match.placements.length, 2); assert.equal(room.match.phase, 'RACE');
    await fail(A, { ...placeA, commandId: randomUUID(), expectedRevision: room.revision }, 'WRONG_PHASE');
    await until(() => stateA?.revision === room.revision && stateB?.revision === room.revision);
    assert.deepEqual(stateA?.match.placements, stateB?.match.placements);
  });
  await t.test('teleport and spoofed movement cannot finish; real movement fanout', async () => {
    A.emit('race:move', { round: 1, sequence: 1, x: 1080, y: 272, velocityX: 100, velocityY: 0 });
    await sleep(100); assert.equal((await ok(A, { type: 'RESUME' })).finishes.length, 0);
    let received = false; B.on('race:snapshot', s => { if (s.players.some(p => p.playerId === a.user.id && p.x === 52)) received = true; });
    A.emit('race:move', { round: 1, sequence: 2, x: 52, y: 272, velocityX: 50, velocityY: 0 }); await until(() => received);
  });
  await t.test('validated movement reaches finish in server arrival order, with no duplicate results', async () => {
    const solids = [...SNOWY_CHAOS.geometry, ...room.match.placements];
    const states = [{ socket: A, x: 52, y: 272, vy: 0, sequence: 10, delay: 0 }, { socket: B, x: 64, y: 272, vy: 0, sequence: 10, delay: 1200 }];
    const began = Date.now();
    while (Date.now() - began < 22000 && transport.manager.current(a.user.id)?.match.phase === 'RACE') {
      for (const p of states) {
        if (Date.now() - began < p.delay || p.x > 1080) continue;
        for (let frame = 0; frame < 3; frame++) {
          const grounded = solids.some(s => Math.abs(p.y - s.y) < .01 && p.x + 5 > s.x && p.x - 5 < s.x + s.width);
          if (grounded) p.vy = -224;
          const oldX = p.x; p.x += 100 / 60;
          for (const s of solids) if (p.x + 5 > s.x && p.x - 5 < s.x + s.width && p.y > s.y + .01 && p.y - 21 < s.y + s.height) p.x = oldX;
          const oldY = p.y; p.vy = Math.min(420, p.vy + 660 / 60); p.y += p.vy / 60;
          for (const s of solids) if (p.x + 5 > s.x && p.x - 5 < s.x + s.width) {
            if (p.vy >= 0 && oldY <= s.y && p.y >= s.y) { p.y = s.y; p.vy = 0; }
            else if (p.vy < 0 && oldY - 21 >= s.y + s.height && p.y - 21 < s.y + s.height) { p.y = s.y + s.height + 21; p.vy = 0; }
          }
        }
        p.socket.emit('race:move', { round: 1, sequence: ++p.sequence, x: p.x, y: p.y, velocityX: 100, velocityY: p.vy });
      }
      await sleep(50);
    }
    room = await ok(A, { type: 'RESUME' });
    assert.equal(room.match.phase, 'RESULTS', JSON.stringify(states.map(({ socket: _, ...rest }) => rest)));
    const finished = room.finishes.filter(f => f.round === 1).sort((x, y) => (x.position ?? 99) - (y.position ?? 99));
    assert.deepEqual(finished.map(f => [f.playerId, f.position, f.status]), [[a.user.id, 1, 'FINISHED'], [b.user.id, 2, 'FINISHED']]);
    A.emit('race:move', { round: 1, sequence: 9999, x: 1080, y: 272, velocityX: 0, velocityY: 0 }); await sleep(100);
    assert.equal((await ok(B, { type: 'RESUME' })).finishes.length, 2);
    room = await ok(A, { type: 'NEXT' }); await ok(A, { type: 'SKIP', round: 2 }); room = await ok(B, { type: 'SKIP', round: 2 });
  });
  await t.test('disconnect/reconnect keeps same seat, full map and phase', async () => {
    B.disconnect(); await sleep(80); const reconnect = await connect(b.accessToken);
    const restored = await ok(reconnect, { type: 'RESUME' }); assert.equal(restored.players.filter(p => !p.left).length, 2); assert.equal(restored.match.placements.length, 2); assert.equal(restored.match.phase, 'RACE');
    B.connect(); await until(() => B.connected); await sleep(50);
    A.disconnect(); await until(() => transport.manager.current(b.user.id)?.hostId === b.user.id);
    A.connect(); await until(() => A.connected); await sleep(50);
    assert.equal((await ok(A, { type: 'RESUME' })).players.filter(p => !p.left).length, 2);
  });
  await t.test('backend restart aborts active race safely, persists map and allows next round', async () => {
    A.disconnect(); B.disconnect(); C.disconnect(); await app.close();
    app = await buildApp(cfg, players, false); transport = await attachMultiplayer(app, cfg, players, db, { buildMs: 700, raceMs: 500, reconnectGraceMs: 150, roomTtlMs: 60000 });
    await app.listen({ host: '127.0.0.1', port: 0 }); address = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
    const AA = await connect(a.accessToken), BB = await connect(b.accessToken);
    room = await ok(AA, { type: 'RESUME' }); assert.equal(room.match.phase, 'RESULTS'); assert.equal(room.match.placements.length, 2); assert.equal(room.finishes.filter(f => f.round === 2).length, 2); assert.ok(room.finishes.filter(f => f.round === 2).every(f => f.status === 'ABORTED')); assert.ok(room.recoveryMessage);
    const host = room.hostId === a.user.id ? AA : BB;
    room = await ok(host, { type: 'NEXT' }); assert.equal(room.match.round, 3); assert.equal(room.match.placements.length, 2);
    await until(() => transport.manager.current(a.user.id)?.match.phase === 'RACE');
    await until(() => transport.manager.current(a.user.id)?.match.phase === 'RESULTS');
    room = await ok(host, { type: 'RESUME' }); assert.equal(room.finishes.filter(f => f.round === 3 && f.status === 'DNF').length, 2);
    await ok(host, { type: 'CLOSE' });
  });
  await t.test('a commandId from another room cannot create an unpersisted block', async () => {
    const CC = await connect(c.accessToken), AA = await connect(a.accessToken);
    let other = await ok(CC, { type: 'CREATE', capacity: 2 }); roomIds.push(other.roomId);
    await ok(AA, { type: 'JOIN', code: other.code });
    await ok(CC, { type: 'READY', ready: true }); await ok(AA, { type: 'READY', ready: true });
    other = await ok(CC, { type: 'START' });
    const placement = { type: 'PLACE', round: 1, expectedRevision: other.revision, commandId: room.match.placements[0]!.id, position: { x: 176, y: 240 } } as const;
    await fail(CC, placement, 'SERVER_ERROR');
    assert.equal((await ok(CC, { type: 'RESUME' })).match.placements.length, 0);
    assert.equal(await db.trapPlacement.count({ where: { roomId: other.roomId } }), 0);
    other = await ok(CC, { ...placement, commandId: randomUUID() });
    assert.equal(other.match.placements.length, 1);
    assert.equal(await db.trapPlacement.count({ where: { roomId: other.roomId } }), 1);
    await ok(CC, { type: 'CLOSE' });
  });
  await t.test('invalid/expired JWT and wrong identity cannot connect; no economy writes', async () => {
    await assert.rejects(connect('invalid'), /INVALID_ACCESS_TOKEN/);
    await assert.rejects(connect(app.jwt.sign({ sub: a.user.id }, { expiresIn: -1 })), /INVALID_ACCESS_TOKEN/);
    await assert.rejects(connect(app.jwt.sign({ sub: randomUUID() })), /INVALID_ACCESS_TOKEN/);
    for (const id of ids) { const p = await players.findById(id); assert.equal(p?.progress.doners, 42); assert.equal(p?.progress.goldenDoners, 3); assert.deepEqual(p?.progress.unlockedCharacterIds, ['altoha']); }
    assert.equal((await app.inject({ url: '/health' })).statusCode, 200);
    assert.equal((await app.inject({ url: '/me', headers: { authorization: `Bearer ${a.accessToken}` } })).statusCode, 200);
  });
});
