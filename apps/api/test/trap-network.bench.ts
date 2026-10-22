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
import { RacePrediction } from '../../web/src/multiplayer/prediction.ts';
import type { MovementSnapshot, OnlineRoom, RaceControls } from '@doner-game/shared';

const output = process.env.NETWORK_BENCH_OUTPUT ?? '../../artifacts/stage-6.2/trap-network.json';
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
const cases: string[] = ['fan-up', 'fan-side', 'hit-respawn'];
const profiles = [{ name: 'rtt40', rtt: 40 }, { name: 'rtt80', rtt: 80 }, { name: 'rtt150', rtt: 150 }, { name: 'jitter', rtt: 80 }, { name: 'stall-loss', rtt: 80 }];
const percentile = (values: number[], fraction: number) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * fraction)] ?? 0;
try {
  for (const profile of profiles) for (const scenario of cases) {
    if (process.env.NETWORK_BENCH_FILTER && `${profile.name}:${scenario}` !== process.env.NETWORK_BENCH_FILTER) continue;
    now = 0;
    const geometry = [floor];
    const placements = scenario === 'hit-respawn'
      ? [{ id: 'bow', catalogId: 'arcade-crossbow' as const, orientation: 'left' as const, x: 160, y: 256, width: 32, height: 16, ownerId: '0', round: 1 }]
      : [{ id: 'fan', catalogId: 'fan' as const, orientation: scenario === 'fan-up' ? 'up' as const : 'right' as const, x: 224, y: 256, width: 32, height: 16, ownerId: '0', round: 1 }];
    const spawns = scenario === 'fan-up' ? [{ x: 232, y: 256 }, { x: 248, y: 256 }]
      : scenario === 'fan-side' ? [{ x: 270, y: 272 }, { x: 300, y: 272 }] : [{ x: 48, y: 272 }, { x: 64, y: 272 }];
    const arena = { ...SNOWY_CHAOS, geometry, spawns };
    const players = spawns.map((_, seat) => ({ playerId: String(seat), seat, characterId: 'altoha' as const, displayName: `Fixture ${seat}`, photoUrl: null, connected: true, left: false, buildDone: true, ready: true }));
    const room = { roomId: 'fixture', players, match: { phase: 'RACE', round: 1, placements } } as OnlineRoom;
    race = new RaceSimulation(players, 1, [...geometry, ...placements], 0, placements);
    race.players.forEach((player, index) => { Object.assign(player, spawns[index]); player.grounded = true; });
    const predictors = players.map(player => new RacePrediction(player.playerId, arena));
    predictors.forEach(predictor => predictor.begin(room));
    const corrections: number[][] = [[], []], frameSteps: number[][] = [[], []];
    const receivedSequences = [0, 0];
    let predictionResets = 0, maxProjectiles = 0, sequence = 0, tickAt = 0, sendAt = 0, snapshotTick = -1, snapshotNumber = 0, packetNumber = 0;
    let last = predictors.map(() => ({ round: 1, sequence: 0, direction: 0, jump: 0 } as RaceControls));
    let lastRendered = predictors.map(p => ({ x: p.own!.x, y: p.own!.y }));
    const due: { at: number; deliver(): Promise<void> }[] = [];
    const duration = 8000;
    const makeSnapshot = (): MovementSnapshot => ({ roomId: room.roomId, round: 1, sequence: ++sequence, serverTime: now, ...race.snapshot() });
    for (const [index, client] of clients.entries()) {
      client.removeAllListeners('state');
      client.on('state', (snapshot: MovementSnapshot, ack: () => void) => {
        // Match the existing production connection's sequence guard for a fair baseline.
        if (snapshot.sequence <= receivedSequences[index]!) { ack(); return; }
        receivedSequences[index] = snapshot.sequence;
        const predictor = predictors[index]!, before = { ...predictor.own! };
        predictor.reconcile(snapshot, false);
        if (predictor.lastCorrection.reset) predictionResets++;
        if (now > 500 && !predictor.lastCorrection.reset) {
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
          if (scenario === 'fan-side') direction = now < 4000 ? -1 : 0;
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
      race.advance(now); maxProjectiles = Math.max(maxProjectiles, race.snapshot().traps.projectiles.length);
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
      predictionResets, maxProjectiles, failures: race.players.map(p => p.life?.failures ?? 0) };
    results.push(result); console.log(JSON.stringify(result));
    assert.ok(race.players.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
    assert.ok(maxProjectiles <= 2);
    if (scenario === 'hit-respawn') { assert.ok(predictionResets >= 4); assert.ok(race.players.some(p => (p.life?.failures ?? 0) >= 2)); }
    else {
      assert.equal(predictionResets, 0); assert.ok(result.errorP95 < 4, JSON.stringify(result));
      assert.ok(result.errorMax < 16 && result.stepMax < 16 && result.correctionsOver4 <= 2, JSON.stringify(result));
    }

  }
  await mkdir(new URL('../../../artifacts/stage-6.2/', import.meta.url), { recursive: true });
  await writeFile(output, JSON.stringify({ environment: 'Two actual localhost Socket.IO clients, virtual 1ms delivery schedule; production solver/server/predictor, no real-internet or FPS claim', results }, null, 2));
} finally { clients.forEach(c => c.disconnect()); await new Promise<void>(resolve => server.close(() => resolve())); }
