import assert from 'node:assert/strict';
import test from 'node:test';
import { createPhysicsPlayer, PLAYER_PHYSICS as cfg, SNOWY_CHAOS, stepPlayers } from '@doner-game/shared';
import type { MovementSnapshot, NetworkPlayer, OnlinePlayer, OnlineRoom, RaceInputBatch } from '@doner-game/shared';
import { RaceSimulation } from '../src/multiplayer/race.ts';
import { parseRaceInput } from '../src/multiplayer/validation.ts';
import { RacePrediction } from '../../web/src/multiplayer/prediction.ts';
import { RacePresentation, SnapshotBuffer } from '../../web/src/multiplayer/presentation.ts';
import { NetworkDiagnostics } from '../../web/src/multiplayer/diagnostics.ts';

const arena = { ...SNOWY_CHAOS, geometry: [SNOWY_CHAOS.geometry[0]!] };
const members = ['a', 'b'].map((playerId, seat) => ({ playerId, seat, connected: true, left: false, characterId: 'ayazhan' } as OnlinePlayer));
const room = { roomId: 'test', players: members, match: { round: 1, placements: [] } } as unknown as OnlineRoom;
const player = (id = 'a', x = 64, y = 272): NetworkPlayer => ({ ...createPhysicsPlayer(id, id === 'a' ? 0 : 1, x, y), round: 1, grounded: true });
const batch = (start = 1, count = 3, direction: -1 | 0 | 1 = 1, jump = 0): RaceInputBatch => ({ round: 1, frames: Array.from({ length: count }, (_, i) => ({ sequence: start + i, direction, jump })) });
const snap = (players: NetworkPlayer[], sequence = 1, tick = 0, serverTime = 0): MovementSnapshot => ({ roomId: 'test', round: 1, sequence, tick, serverTime, players: structuredClone(players), impacts: [] });
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < .0001, `${a} != ${b}`);

test('input packets are bounded, contiguous and reject coordinates, identity and replay-order injection', () => {
  assert.deepEqual(parseRaceInput(batch()), batch());
  for (const invalid of [batch(1, 0), batch(1, 7), batch(0), batch(1, 1, 1, 2),
    { ...batch(), x: 100 }, { ...batch(), frames: [{ sequence: 1, direction: 0, jump: 0, playerId: 'b' }] },
    { ...batch(), frames: [batch(2, 1).frames[0], batch(1, 1).frames[0]] },
    { ...batch(), frames: [{ sequence: 2, direction: 0, jump: 1 }, { sequence: 3, direction: 0, jump: 0 }] },
    { ...batch(), frames: [{ sequence: NaN, direction: 0, jump: 0 }] }]) assert.equal(parseRaceInput(invalid), null);
});
test('server acknowledges only simulated frames, consumes one per tick, deduplicates retransmissions and bounds future input', () => {
  const race = new RaceSimulation(members, 1, arena.geometry, 0);
  race.input('a', batch(1, 6), 0);
  assert.equal(race.players[0]!.sequence, 0);
  race.advance(17); assert.equal(race.players[0]!.sequence, 1);
  race.input('a', batch(1, 6, -1), 17); // A duplicate cannot rewrite already queued intent.
  race.input('a', batch(999, 6), 17);
  race.advance(100); assert.equal(race.players[0]!.sequence, 5);
  race.advance(117); assert.equal(race.players[0]!.sequence, 7);
  assert.equal(race.players[0]!.direction, 1);
  assert.ok(race.players[0]!.x <= 48 + cfg.speed * .117);
});
test('late new input preserves liveness and a jump edge without replaying consumed movement; stale input cannot extend timeout', () => {
  const race = new RaceSimulation(members, 1, arena.geometry, 0);
  race.input('a', batch(1, 3, 0), 0);
  let time = 0;
  for (time = 1; time <= 2000; time++) {
    race.advance(time);
    if (time >= 150 && time % 50 === 0) race.input('a', batch(Math.floor(time * .06) - 5, 3, 0, time >= 1500 ? 1 : 0), time);
    if (time > 100) assert.equal(race.players[0]!.active, true, `false timeout at ${time}`);
  }
  assert.equal(race.players[0]!.jumpSerial, 1);
  const ack = race.players[0]!.sequence;
  race.input('a', batch(1, 3), 2250);
  for (; time <= 2350; time++) race.advance(time);
  assert.equal(race.players[0]!.active, false);
  assert.ok(race.players[0]!.sequence >= ack);
  race.presence('a', false); race.input('a', batch(500, 6), time); assert.equal(race.players[0]!.active, false);
  race.presence('a', true); race.input('a', batch(500, 6), time);
  const tick = race.tick; race.advance(time + 17);
  assert.equal(race.players[0]!.sequence, 499 + race.tick - tick); assert.equal(race.players[0]!.active, true);
});
test('reconciliation replays each unacked frame once with full support/collision state and ignores old snapshots', () => {
  const prediction = new RacePrediction('a', arena); prediction.begin(room);
  const top = player('a', 64, 251), bottom = player('b'); top.supportId = 'b';
  prediction.reconcile(snap([top, bottom]), true);
  const server = [top, bottom]; let atSix: NetworkPlayer[] = [];
  for (let i = 1; i <= 12; i++) {
    const input = prediction.step(0, i === 9);
    stepPlayers(server, new Map([['a', input], ['b', { sequence: 0, direction: 0, jump: 0 }]]), arena.geometry, arena.width, arena.height);
    if (i === 6) atSix = structuredClone(server);
  }
  assert.equal(prediction.packet().frames.length, 6);
  assert.equal(prediction.reconcile(snap(atSix, 2, 6, 100), false), true);
  assert.deepEqual(prediction.players, server);
  assert.deepEqual(prediction.packet().frames.map(f => f.sequence), [7, 8, 9, 10, 11, 12]);
  const current = structuredClone(prediction.players);
  assert.equal(prediction.reconcile(snap([top, bottom], 1, 4, 70), false), false);
  assert.equal(prediction.reconcile({ ...snap(server, 3, 12, 200), round: 2 }, false), false);
  assert.deepEqual(prediction.players, current);
});
test('prediction limits remote intent, resets exhausted input history and rebases reconnect sequence', () => {
  const prediction = new RacePrediction('a', arena); prediction.begin(room);
  const remote = player('b', 500); remote.direction = 1;
  prediction.reconcile(snap([player(), remote]), true);
  for (let i = 0; i < 35; i++) prediction.step(0, false);
  assert.equal(prediction.players[1]!.direction, 0);
  assert.ok(prediction.players[1]!.x < 500 + cfg.speed * .3);
  prediction.reconcile(snap([player(), remote], 2, 4, 67), false);
  assert.equal(prediction.lastCorrection.reset, true); assert.deepEqual(prediction.packet().frames, []);
  const restored = player(); restored.sequence = 100; restored.jumpSerial = 4;
  prediction.reconcile(snap([restored, remote], 3, 200, 3400), true);
  assert.equal(prediction.step(0, true).sequence, 101); assert.equal(prediction.packet().frames[0]!.jump, 5);
});
test('snapshot buffer follows server time, rejects stale frames, adapts to jitter without reversing and bounds extrapolation', () => {
  const buffer = new SnapshotBuffer(arena, arena.geometry);
  const a = player('b', 100); a.direction = 1; a.velocityX = 100;
  buffer.push(snap([a], 1, 0, 0), 100);
  buffer.push(snap([{ ...a, x: 110 }], 2, 6, 100), 200);
  near(buffer.sample(250)[0]!.x, 105);
  assert.equal(buffer.push(snap([{ ...a, x: 1 }], 1, 0, 0), 251), false);
  buffer.push(snap([{ ...a, x: 120 }], 3, 12, 200), 370);
  assert.ok(buffer.delayMs > 100 && buffer.delayMs <= 200);
  let x = 105;
  for (let t = 251; t <= 1500; t += 17) { const next = buffer.sample(t)[0]!.x; assert.ok(next >= x - .001); x = next; }
  assert.ok(x <= 120 + cfg.speed * cfg.extrapolationMs / 1000 + .001);
  near(buffer.sample(10000)[0]!.x, x);
});
test('render corrections preserve head contact, never change colliders and decay equally at 60/120 FPS', () => {
  const run = (hz: number) => {
    const view = new RacePresentation('a', arena, arena.geometry);
    const state = [player('a', 64, 251), player('b')]; state[0]!.supportId = 'b';
    view.receive(snap(state), state, 0, true); view.sample(state, 0, 0);
    state.forEach(p => p.x += 4);
    const source = structuredClone(state);
    view.receive(snap(state, 2, 4, 67), state, 67, false);
    const before = view.sample(state, 67, 0); near(before[0]!.x, 64);
    let result = before;
    for (let i = 0; i < hz / 10; i++) {
      result = view.sample(state, 67 + (i + 1) * 1000 / hz, 1000 / hz);
      near(result[1]!.y - result[0]!.y, cfg.height); near(result[0]!.x, result[1]!.x);
    }
    assert.deepEqual(state, source); return result[0]!.x;
  };
  near(run(60), run(120));
});
test('presentation bounds visual offset, avoids dragging contact group through a wall, resets large discontinuities', () => {
  const wall = { x: 100, y: 220, width: 32, height: 52 };
  const view = new RacePresentation('a', arena, [...arena.geometry, wall]);
  let state = [player('a', 90), player('b', 95, 251)];
  view.receive(snap(state), state, 0, true); view.sample(state, 0, 0);
  state = [player('a', 85), player('b', 95, 251)];
  view.receive(snap(state, 2, 4, 67), state, 67, false);
  const result = view.sample(state, 67, 0);
  assert.ok(result[1]!.x <= 95); assert.ok(Math.abs(result[0]!.x - state[0]!.x) <= cfg.renderMaxOffset);
  state = [player('a', 200)];
  view.receive(snap(state, 3, 8, 134), state, 134, false);
  near(view.sample(state, 134, 0)[0]!.x, 200);
});
test('diagnostics expose numeric RTT/rate/jitter/corrections and distinguish stale from estimated gaps', () => {
  const d = new NetworkDiagnostics(); d.rtt = 80;
  d.snapshot(100, 0, 0); d.snapshot(167, 67, 4); d.snapshot(320, 200, 12);
  d.stale++; d.correction(320, 3, false); d.correction(330, 100, true);
  const value = d.read(350, 60);
  assert.equal(value.estimatedMissingSnapshots, 1); assert.equal(value.staleSnapshots, 1);
  assert.equal(value.largestCorrection, 3); assert.equal(value.correctionsPerSecond, 1);
  assert.ok(value.jitterMs > 0 && value.snapshotHz > 0);
  assert.ok(Object.values(value).every(x => typeof x === 'number' && Number.isFinite(x)));
  assert.equal(d.read(3000, 60).snapshotHz, 0); assert.equal(d.read(3000, 60).correctionsPerSecond, 0);
  d.reset(); assert.equal(d.largest, 0); assert.equal(d.rtt, 80);
});
