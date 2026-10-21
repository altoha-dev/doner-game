import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { CHARACTERS } from '@doner-game/shared';
import type { ClientEvents, MovementSnapshot, OnlineRoom, PreviewSnapshot, RoomCommand, ServerEvents } from '@doner-game/shared';
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
    let received = false; B.on('race:snapshot', s => { if (s.players.some(p => p.playerId === a.user.id && p.x > 48)) received = true; });
    A.emit('race:input', { round: 1, sequence: 2, direction: 1, jump: 0 }); await until(() => received);
  });
  await t.test('authoritative input simulation reaches finish in server order, with no duplicate results', async () => {
    const states = [{ socket: A, sequence: 10, jump: 0, delay: 0 }, { socket: B, sequence: 10, jump: 0, delay: 1800 }];
    const began = Date.now();
    let iteration = 0;
    while (Date.now() - began < 25000 && transport.manager.current(a.user.id)?.match.phase === 'RACE') {
      for (const p of states) {
        const running = Date.now() - began >= p.delay;
        if (running && iteration % 8 === 0) p.jump++;
        p.socket.emit('race:input', { round: 1, sequence: ++p.sequence, direction: running ? 1 : 0, jump: p.jump });
      }
      iteration++; await sleep(50);
    }
    room = await ok(A, { type: 'RESUME' });
    assert.equal(room.match.phase, 'RESULTS', JSON.stringify(transport.manager.movementSnapshot(a.user.id)));
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

test('Stage 6.1.5 real clients: previews, authoritative body contacts, head jumps and recovery', { skip: !url && 'Requires isolated TEST_DATABASE_URL', timeout: 90000 }, async t => {
  assert.ok(url); assert.match(new URL(url).pathname, /_test$/);
  const db = createDatabase(url), players = createPlayerStore(db);
  const cfg = { ...config, databaseUrl: url, botUsername: 'doner_test_bot' };
  const app = await buildApp(cfg, players, false);
  const { manager } = await attachMultiplayer(app, cfg, players, db, { buildMs: 30000, raceMs: 45000, reconnectGraceMs: 150, roomTtlMs: 120000 });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const ids: string[] = [], clients: Client[] = [], roomIds: string[] = [];
  const latest = new Map<string, MovementSnapshot>(), previews = new Map<string, PreviewSnapshot>();
  const controls = new Map<string, { socket: Client; sequence: number; direction: -1 | 0 | 1; jump: number; silent: boolean }>();
  let round = 1;
  const heartbeat = setInterval(() => {
    for (const control of controls.values()) if (control.socket.connected && !control.silent) control.socket.emit('race:input', { round, sequence: ++control.sequence, direction: control.direction, jump: control.jump });
  }, 50);
  t.after(async () => { clearInterval(heartbeat); clients.forEach(c => c.disconnect()); await app.close(); await db.room.deleteMany({ where: { id: { in: roomIds } } }); await db.user.deleteMany({ where: { id: { in: ids } } }); await db.$disconnect(); });
  async function login(index: number) {
    const result = await app.inject({ method: 'POST', url: '/auth/telegram', payload: { initData: signInitData({ user: JSON.stringify({ id: 5300000000000000 + Date.now() + index, first_name: ['Антон', 'Айгерим', 'Друг вне комнаты'][index] }) }) } });
    assert.equal(result.statusCode, 200); const profile = result.json(); ids.push(profile.user.id);
    await db.playerProgress.update({ where: { userId: profile.user.id }, data: { doners: 42, goldenDoners: 3 } }); return profile;
  }
  async function connect(profile: Awaited<ReturnType<typeof login>>) {
    const socket: Client = io(address, { auth: { token: profile.accessToken }, transports: ['websocket'], reconnection: false, forceNew: true }); clients.push(socket);
    socket.on('race:snapshot', value => latest.set(profile.user.id, value));
    socket.on('build:previews', value => previews.set(profile.user.id, value));
    await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    const existing = controls.get(profile.user.id);
    controls.set(profile.user.id, { socket, sequence: existing?.sequence ?? 0, direction: 0, jump: existing?.jump ?? 0, silent: false }); return socket;
  }
  const a = await login(0), b = await login(1), c = await login(2);
  let A = await connect(a), B = await connect(b); const C = await connect(c);
  const ok = async (socket: Client, command: RoomCommand) => {
    const reply = await socket.timeout(3000).emitWithAck('room:command', command); assert.equal(reply.ok, true, JSON.stringify(reply));
    if (!reply.ok) throw new Error(reply.message); return reply.room!;
  };
  let room = await ok(A, { type: 'CREATE', capacity: 4 }); roomIds.push(room.roomId);
  await ok(B, { type: 'JOIN', code: room.code });
  const other = await ok(C, { type: 'CREATE', capacity: 2 }); roomIds.push(other.roomId);
  await t.test('catalog selection is free, shared with peers, permits duplicates and rejects unknown IDs', async () => {
    const before = (await players.findById(a.user.id))!.progress;
    for (const character of CHARACTERS) {
      await ok(A, { type: 'CHARACTER', characterId: character.id });
      assert.equal((await ok(B, { type: 'RESUME' })).players.find(p => p.playerId === a.user.id)?.characterId, character.id);
    }
    room = await ok(B, { type: 'CHARACTER', characterId: 'ayazhan' });
    assert.equal(room.players.filter(p => p.characterId === 'ayazhan').length, 2);
    const rejected = await A.timeout(3000).emitWithAck('room:command', { type: 'CHARACTER', characterId: 'unknown' } as never);
    assert.equal(rejected.ok, false); if (!rejected.ok) assert.equal(rejected.code, 'INVALID_REQUEST');
    assert.deepEqual((await players.findById(a.user.id))!.progress, before);
    assert.equal((await db.roomPlayer.findFirstOrThrow({ where: { roomId: room.roomId, userId: a.user.id } })).chosenCharacterId, 'ayazhan');
  });
  await ok(A, { type: 'READY', ready: true }); await ok(B, { type: 'READY', ready: true }); room = await ok(A, { type: 'START' });
  let previewA = 0, previewB = 0;
  const preview = (socket: Client, sequence: number, x: number | null, y = 240) => socket.emit('build:preview', { round: 1, sequence, objectType: 'basic-platform', position: x === null ? null : { x, y } });
  const seen = (id: string, owner: string) => previews.get(id)?.previews.find(p => p.playerId === owner);
  await t.test('live preview owner/validity/sequence/privacy/flood are verified without changing room revision', async () => {
    const revision = room.revision;
    preview(A, ++previewA, 176);
    await until(() => seen(b.user.id, a.user.id)?.position.x === 176);
    assert.equal(seen(b.user.id, a.user.id)?.displayName, 'Антон'); assert.equal(seen(b.user.id, a.user.id)?.valid, true);
    preview(A, ++previewA, 48);
    await until(() => seen(b.user.id, a.user.id)?.valid === false);
    assert.match(seen(b.user.id, a.user.id)!.reason!, /защищены/);
    preview(A, 1, 224); await sleep(100); assert.equal(seen(b.user.id, a.user.id)?.position.x, 48);
    A.emit('build:preview', { round: 1, sequence: 10, objectType: 'basic-platform', position: { x: 224, y: 240 }, playerId: b.user.id } as never);
    C.emit('build:preview', { round: 1, sequence: 1, objectType: 'basic-platform', position: { x: 224, y: 240 }, roomId: room.roomId } as never);
    for (let i = 20; i < 150; i++) preview(A, i, 176);
    previewA = 150;
    await sleep(200); assert.ok(seen(b.user.id, a.user.id)!.sequence < 149, 'server preview flood gate');
    assert.equal(previews.get(c.user.id)?.roomId, other.roomId);
    assert.equal(manager.current(a.user.id)?.revision, revision);
    assert.equal(await db.trapPlacement.count({ where: { roomId: room.roomId } }), 0);
  });
  await t.test('preview expires/cancels and BUILD reconnect restores fresh peers with no duplicate player', async () => {
    await until(() => !seen(b.user.id, a.user.id), 3000);
    preview(B, ++previewB, 208, 224); await until(() => Boolean(seen(a.user.id, b.user.id)));
    preview(B, ++previewB, null); await until(() => !seen(a.user.id, b.user.id));
    preview(A, ++previewA, 176); preview(B, ++previewB, 208, 224);
    await until(() => Boolean(seen(b.user.id, a.user.id)));
    A.disconnect(); await until(() => !seen(b.user.id, a.user.id));
    A = await connect(a); room = await ok(A, { type: 'RESUME' }); previewA = 0;
    assert.equal(room.match.phase, 'BUILD'); assert.equal(room.players.filter(p => !p.left).length, 2);
    assert.equal(room.players.find(p => p.playerId === a.user.id)?.characterId, 'ayazhan');
    await until(() => Boolean(seen(a.user.id, b.user.id)));
  });
  await t.test('replacement socket can restart preview sequence without a duplicate member', async () => {
    preview(A, ++previewA, 176); await until(() => Boolean(seen(b.user.id, a.user.id)));
    const old = A; A = await connect(a); await until(() => !old.connected);
    previewA = 0; preview(A, ++previewA, 224);
    await until(() => seen(b.user.id, a.user.id)?.position.x === 224);
    assert.equal((await ok(A, { type: 'RESUME' })).players.filter(p => !p.left).length, 2);
  });
  await t.test('commit replaces preview, revalidates overlapping peer; skip clears previews and blocks survive reconnect', async () => {
    preview(A, ++previewA, 176); preview(B, ++previewB, 176);
    await until(() => seen(a.user.id, b.user.id)?.valid === true);
    room = await ok(A, { type: 'RESUME' });
    room = await ok(A, { type: 'PLACE', round: 1, expectedRevision: room.revision, commandId: randomUUID(), position: { x: 176, y: 240 } });
    await until(() => !seen(b.user.id, a.user.id) && seen(a.user.id, b.user.id)?.valid === false);
    assert.equal(room.players.find(p => p.playerId === a.user.id)?.buildDone, true);
    A.disconnect(); A = await connect(a); room = await ok(A, { type: 'RESUME' });
    assert.equal(room.match.placements.length, 1); assert.equal(room.players.filter(p => !p.left).length, 2);
    room = await ok(B, { type: 'SKIP', round: 1 });
    assert.equal(room.match.phase, 'RACE'); await until(() => previews.get(a.user.id)?.previews.length === 0 && previews.get(b.user.id)?.previews.length === 0);
  });
  const state = (id: string) => manager.movementSnapshot(a.user.id)!.players.find(p => p.playerId === id)!;
  const drive = (id: string, direction: -1 | 0 | 1, jump = false) => { const control = controls.get(id)!; control.direction = direction; if (jump) control.jump++; };
  await t.test('opposing movement, push and equal authoritative snapshots on both real sockets', async () => {
    await until(() => state(a.user.id).active && state(b.user.id).active);
    const revision = manager.current(a.user.id)!.revision;
    drive(a.user.id, 1); drive(b.user.id, -1); await sleep(350);
    assert.ok(state(b.user.id).x - state(a.user.id).x >= 9.999);
    drive(a.user.id, 0); drive(b.user.id, 0); await sleep(150);
    const before = state(b.user.id).x;
    drive(a.user.id, 1); await sleep(500); drive(a.user.id, 0);
    assert.ok(state(b.user.id).x > before + 5, 'server pushes stationary player');
    await until(() => latest.get(a.user.id)?.sequence === latest.get(b.user.id)?.sequence);
    assert.deepEqual(latest.get(a.user.id)?.players, latest.get(b.user.id)?.players);
    assert.equal(manager.current(a.user.id)!.revision, revision, 'motion does not persist room state');
  });
  await t.test('land on another head and jump from it through input alone', async () => {
    await sleep(200);
    drive(a.user.id, 1, true);
    await until(() => state(a.user.id).x >= state(b.user.id).x - 4);
    drive(a.user.id, 0);
    await until(() => state(a.user.id).supportId === b.user.id);
    assert.ok(Math.abs(state(a.user.id).y - (state(b.user.id).y - 21)) < .001);
    const at = state(a.user.id).y; drive(a.user.id, 0, true);
    await until(() => state(a.user.id).y < at - 8);
    assert.equal(state(a.user.id).supportId, null);
    await until(() => latest.get(b.user.id)?.impacts.some(e => e.kind === 'head-jump') === true);
  });
  await t.test('pushing beside the placed block stops at its wall; simultaneous jumps stay bounded', async () => {
    drive(a.user.id, -1); await until(() => state(a.user.id).x < state(b.user.id).x - 20); drive(a.user.id, 0);
    await until(() => state(a.user.id).grounded && state(a.user.id).y === 272);
    drive(a.user.id, 1); await until(() => state(b.user.id).x >= 170.9, 6000); await sleep(300); drive(a.user.id, 0);
    assert.ok(state(b.user.id).x <= 171.001); assert.ok(state(b.user.id).x - state(a.user.id).x >= 9.999);
    drive(a.user.id, 0, true); drive(b.user.id, 0, true); await sleep(200);
    assert.ok(state(a.user.id).y < 272 && state(b.user.id).y < 272);
    for (const p of manager.movementSnapshot(a.user.id)!.players) { assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y)); assert.ok(p.x <= 171.001); }
  });
  await t.test('missing input expires, old input is ignored, and RACE reconnect restores the same physical players', async () => {
    controls.get(a.user.id)!.silent = true; await sleep(450);
    assert.equal(state(a.user.id).active, false);
    A.emit('race:input', { round: 1, sequence: 1, direction: 1, jump: 0 });
    controls.get(a.user.id)!.silent = false; await until(() => state(a.user.id).active);
    B.disconnect(); await until(() => !state(b.user.id).active);
    B = await connect(b); room = await ok(B, { type: 'RESUME' });
    assert.equal(room.match.phase, 'RACE'); assert.equal(room.match.placements.length, 1); assert.equal(room.players.filter(p => !p.left).length, 2);
    assert.equal(room.players.find(p => p.playerId === b.user.id)?.characterId, 'ayazhan');
    await until(() => latest.get(a.user.id)?.sequence === latest.get(b.user.id)?.sequence);
    assert.deepEqual(latest.get(a.user.id)?.players, latest.get(b.user.id)?.players);
  });
  await t.test('contacts do not produce false finish; two full runs finish and NEXT retains blocks/balances', async () => {
    assert.equal(manager.current(a.user.id)!.finishes.length, 0);
    const started = Date.now();
    while (manager.current(a.user.id)?.match.phase === 'RACE' && Date.now() - started < 22000) {
      drive(a.user.id, 1, true); drive(b.user.id, 1, true); await sleep(400);
    }
    room = await ok(A, { type: 'RESUME' });
    assert.equal(room.match.phase, 'RESULTS', JSON.stringify(manager.movementSnapshot(a.user.id)));
    assert.deepEqual(room.finishes.map(f => f.position).sort(), [1, 2]);
    assert.deepEqual(room.finishes, (await ok(B, { type: 'RESUME' })).finishes);
    round = 2;
    room = await ok(room.hostId === a.user.id ? A : B, { type: 'NEXT' });
    assert.equal(room.match.phase, 'BUILD'); assert.equal(room.match.placements.length, 1);
    for (const id of [a.user.id, b.user.id]) { const profile = await players.findById(id); assert.equal(profile?.progress.doners, 42); assert.equal(profile?.progress.goldenDoners, 3); }
  });
});
