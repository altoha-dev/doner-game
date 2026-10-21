// Deterministic virtual delivery delays over two actual Socket.IO clients.
// Exercises production solver/server/predictor; no DB, auth endpoint or fabricated snapshots.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { Server } from 'socket.io';
import { io } from 'socket.io-client';
import { PLAYER_PHYSICS, SNOWY_CHAOS } from '@doner-game/shared';
import { RaceSimulation } from '../src/multiplayer/race.ts';
import { atFinish } from '../src/multiplayer/movement.ts';
import { RacePrediction } from '../../web/src/multiplayer/prediction.ts';
import type { MovementSnapshot, OnlineRoom, RaceControls } from '@doner-game/shared';

const output = process.env.NETWORK_BENCH_OUTPUT ?? '../../artifacts/stage-6.1.6/network-after.json';
const http = createServer(), server = new Server(http), secret = randomUUID();
server.use((socket, next) => socket.handshake.auth.token === secret ? next() : next(new Error('fixture auth')));
await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve));
const address = `http://127.0.0.1:${(http.address() as { port: number }).port}`;
const clients = [0, 1].map(index => io(address, { auth: { token: secret, index }, transports: ['websocket'], forceNew: true }));
await Promise.all(clients.map(client => new Promise<void>(resolve => client.once('connect', resolve))));
let race: RaceSimulation, now = 0;
for (const socket of server.sockets.sockets.values()) socket.on('input', (value, ack) => { race.input(String(socket.handshake.auth.index), value, now); ack(); });
const results: unknown[] = [];
const floor = SNOWY_CHAOS.geometry[0]!;
const cases = ['run', 'jump', 'opposing', 'push', 'landing', 'riding', 'head-jump', 'wall', 'block-head', 'finish'] as const;
const profiles = [{ name: 'rtt40', rtt: 40 }, { name: 'rtt80', rtt: 80 }, { name: 'rtt150', rtt: 150 }, { name: 'jitter', rtt: 80 }, { name: 'stall-loss', rtt: 80 }];
const percentile = (values: number[], fraction: number) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * fraction)] ?? 0;
try {
  for (const profile of profiles) for (const scenario of cases) {
    if (process.env.NETWORK_BENCH_FILTER && `${profile.name}:${scenario}` !== process.env.NETWORK_BENCH_FILTER) continue;
    now = 0;
    const stacked = ['riding', 'head-jump', 'block-head'].includes(scenario);
    const wall = ['wall', 'block-head'].includes(scenario);
    const geometry = scenario === 'finish' ? SNOWY_CHAOS.geometry : [floor];
    const placements = wall ? [{ id: 'block', catalogId: 'basic-platform' as const, x: 176, y: 240, width: 32, height: 16, ownerId: '0', round: 1 }] : [];
    const spawns = [{ x: wall ? 148 : 48, y: 272 }, { x: wall ? 160 : 64, y: 272 }];
    if (scenario === 'run' || scenario === 'jump') spawns[1]!.x = 900;
    if (scenario === 'landing' || stacked) { spawns[0]!.x = spawns[1]!.x; spawns[0]!.y = stacked ? 251 : 220; }
    if (scenario === 'finish') { spawns[0]!.x = 880; spawns[1]!.x = 896; }
    const arena = { ...SNOWY_CHAOS, geometry, spawns };
    const players = spawns.map((_, seat) => ({ playerId: String(seat), seat, characterId: 'altoha' as const, displayName: `Fixture ${seat}`, photoUrl: null, connected: true, left: false, buildDone: true, ready: true }));
    const room = { roomId: 'fixture', players, match: { phase: 'RACE', round: 1, placements } } as OnlineRoom;
    race = new RaceSimulation(players, 1, [...geometry, ...placements], 0);
    race.players.forEach((player, index) => { Object.assign(player, spawns[index]); player.grounded = index === 1 || stacked; if (stacked && index === 0) player.supportId = '1'; });
    const predictors = players.map(player => new RacePrediction(player.playerId, arena));
    predictors.forEach(predictor => predictor.begin(room));
    const corrections: number[][] = [[], []], frameSteps: number[][] = [[], []];
    const supportHeights: number[] = [];
    const receivedSequences = [0, 0];
    let sequence = 0, tickAt = 0, sendAt = 0, snapshotTick = -1, snapshotNumber = 0, packetNumber = 0;
    let last = predictors.map(() => ({ round: 1, sequence: 0, direction: 0, jump: 0 } as RaceControls));
    let lastRendered = predictors.map(p => ({ x: p.own!.x, y: p.own!.y }));
    const due: { at: number; deliver(): Promise<void> }[] = [];
    const duration = scenario === 'finish' ? 7000 : 4000;
    const makeSnapshot = (): MovementSnapshot => ({ roomId: room.roomId, round: 1, sequence: ++sequence, serverTime: now, ...race.snapshot() });
    for (const [index, client] of clients.entries()) {
      client.removeAllListeners('state');
      client.on('state', (snapshot: MovementSnapshot, ack: () => void) => {
        // Match the existing production connection's sequence guard for a fair baseline.
        if (snapshot.sequence <= receivedSequences[index]!) { ack(); return; }
        receivedSequences[index] = snapshot.sequence;
        const predictor = predictors[index]!, before = { ...predictor.own! };
        predictor.reconcile(snapshot, false);
        if (now > 500) {
          const error = Math.hypot(before.x - predictor.own!.x, before.y - predictor.own!.y);
          corrections[index]!.push(error);
          if (process.env.NETWORK_BENCH_TRACE && error > 4) console.log(JSON.stringify({ at: now, index, error, before, after: predictor.own, authority: snapshot.players, tick: snapshot.tick }));
        }
        ack();
      });
    }
    predictors.forEach(p => p.reconcile(makeSnapshot(), true));
    const delay = (number: number, snapshot = false) => {
      let value = profile.rtt / 2;
      if (profile.name === 'jitter') value += [0, 13, -9, 27, -15, 6][number % 6]!;
      if (profile.name === 'stall-loss' && snapshot && now > 1800 && now < 2050) value += 180;
      return Math.max(1, value);
    };
    for (now = 0; now <= duration; now++) {
      if (now >= tickAt) {
        tickAt += 1000 / PLAYER_PHYSICS.tickHz;
        last = predictors.map((predictor, index) => {
          let direction: -1 | 0 | 1 = 0, jump = false;
          if (['run', 'jump', 'finish'].includes(scenario)) direction = index === 0 || scenario === 'finish' ? 1 : 0;
          if (scenario === 'opposing') direction = index === 0 ? 1 : -1;
          if (scenario === 'push' || scenario === 'wall') direction = index === 0 ? 1 : 0;
          if (scenario === 'riding' || scenario === 'block-head') direction = index === 1 ? (now < 1800 ? 1 : -1) : 0;
          if (scenario === 'jump' || scenario === 'finish') jump = now % 650 < 17;
          if (scenario === 'head-jump') jump = index === 0 && now >= 800 && now < 817;
          const input = predictor.step(direction, jump);
          const p = predictor.own!;
          if (now > 500) frameSteps[index]!.push(Math.hypot(p.x - lastRendered[index]!.x, p.y - lastRendered[index]!.y));
          lastRendered[index] = { x: p.x, y: p.y };
          return input;
        });
      }
      if (now >= sendAt) {
        sendAt += 1000 / PLAYER_PHYSICS.inputHz;
        for (const [index, client] of clients.entries()) {
          const predictor = predictors[index]! as RacePrediction & { packet?(): unknown };
          const value = predictor.packet ? predictor.packet() : last[index];
          due.push({ at: now + delay(packetNumber++), async deliver() { await client.timeout(2000).emitWithAck('input', value); } });
        }
      }
      for (const task of due.filter(task => task.at <= now)) { due.splice(due.indexOf(task), 1); await task.deliver(); }
      race.advance(now);
      for (const p of race.players) if (scenario === 'finish' && atFinish(p)) { p.finished = true; p.active = false; }
      if (stacked && now > 500 && race.players[0]!.supportId === '1') supportHeights.push(race.players[1]!.y - race.players[0]!.y);
      if (race.tick >= snapshotTick + 4) {
        snapshotTick = race.tick; snapshotNumber++;
        const value = makeSnapshot();
        if (!(profile.name === 'stall-loss' && snapshotNumber % 11 === 0)) for (const client of clients) {
          const socket = server.sockets.sockets.get(client.id!)!;
          due.push({ at: now + delay(snapshotNumber, true), async deliver() { await socket.timeout(2000).emitWithAck('state', value); } });
        }
      }
    }
    const errors = corrections.flat(), steps = frameSteps.flat();
    const result = { profile: profile.name, configuredRttMs: profile.rtt, scenario, samples: errors.length,
      errorP95: percentile(errors, .95), errorMax: Math.max(0, ...errors), correctionsOver4: errors.filter(x => x > 4).length,
      physicsStepsOver8: steps.filter(x => x > 8).length, stepMax: Math.max(0, ...steps),
      headHeightRange: supportHeights.length ? [Math.min(...supportHeights), Math.max(...supportHeights)] : null,
      finishes: race.players.filter(p => p.finished).length };
    results.push(result); console.log(JSON.stringify(result));
    assert.ok(race.players.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
    if (['run', 'jump', 'opposing', 'push', 'landing', 'head-jump', 'wall'].includes(scenario)) {
      assert.equal(result.correctionsOver4, 0, `${profile.name}/${scenario}: recurring physical corrections`);
      assert.equal(result.physicsStepsOver8, 0, `${profile.name}/${scenario}: large physical step`);
    }
    if (result.headHeightRange) for (const height of result.headHeightRange) assert.ok(Math.abs(height - PLAYER_PHYSICS.height) < PLAYER_PHYSICS.tolerance);
    if (scenario === 'finish') assert.equal(result.finishes, 2, `${profile.name}: both authoritative players finish`);
  }
  await mkdir(new URL('../../../artifacts/stage-6.1.6/', import.meta.url), { recursive: true });
  await writeFile(output, JSON.stringify({ environment: 'Two actual localhost Socket.IO clients, virtual 1ms delivery schedule; production solver/server/predictor, no real-internet or FPS claim', results }, null, 2));
} finally { clients.forEach(c => c.disconnect()); await new Promise<void>(resolve => server.close(() => resolve())); }
