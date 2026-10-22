import assert from 'node:assert/strict';
import test from 'node:test';
import { createPhysicsPlayer, fanForces, getTrap, placementError, PLAYER_PHYSICS, SNOWY_CHAOS, stepPlayers, TrapSimulation, TRAPS, TRAP_RULES } from '@doner-game/shared';
import type { TrapId, TrapPlacement, Orientation, NetworkPlayer, MovementSnapshot } from '@doner-game/shared';
import { parseCommand, parsePreview } from '../src/multiplayer/validation.ts';
import { RacePresentation } from '../../web/src/multiplayer/presentation.ts';
import { RacePrediction } from '../../web/src/multiplayer/prediction.ts';
const floor = SNOWY_CHAOS.geometry[0]!;
const trap = (catalogId: TrapId, x = 176, y = 256, orientation?: Orientation): TrapPlacement => ({ id: `${catalogId}:${x}:${y}`, catalogId, x, y, width: 32, height: 16, ownerId: 'fixture', round: 1, ...(orientation ? { orientation } : {}) });
const controls = (players: ReturnType<typeof createPhysicsPlayer>[], direction: -1 | 0 | 1 = 0, jump = 0) => new Map(players.map(p => [p.playerId, { sequence: p.sequence + 1, direction, jump }]));
test('catalog has three stable types, valid dimensions/orientations and centralized prices', () => {
  assert.deepEqual(TRAPS.map(t => t.id), ['basic-platform', 'fan', 'arcade-crossbow']);
  assert.deepEqual(TRAPS.map(t => t.donerPrice), [0, 2, 3]);
  for (const t of TRAPS) { assert.equal(t.dimensions.width, 32); assert.ok(t.visual); assert.ok(t.orientations.length); }
  assert.equal(getTrap('unknown'), undefined);
});
test('placement and preview validate type/rotation and protected zones without accepting extra state', () => {
  const command = { type: 'PLACE', round: 1, commandId: 'test-placement-1234', expectedRevision: 1, position: { x: 176, y: 240 }, trapId: 'fan', orientation: 'up' };
  assert.ok(parseCommand(command)); assert.equal(parseCommand({ ...command, trapId: 'unknown' }), null);
  assert.equal(parseCommand({ ...command, orientation: 'down' }), null); assert.equal(parseCommand({ ...command, price: 0 }), null);
  assert.ok(parsePreview({ round: 1, sequence: 1, objectType: 'arcade-crossbow', orientation: 'left', position: command.position }));
  for (const t of TRAPS) {
    assert.match(placementError(SNOWY_CHAOS, [], { x: 48, y: 240 }, 20, t.id)!, /защищены/);
    assert.match(placementError(SNOWY_CHAOS, [], { x: 1072, y: 240 }, 20, t.id)!, /защищены/);
    assert.ok(placementError(SNOWY_CHAOS, [trap('fan', 176, 240)], { x: 176, y: 240 }, 20, t.id));
    assert.equal(placementError(SNOWY_CHAOS, [], { x: 176, y: 240 }, 20, t.id), null);
  }
});
test('geometric route guard rejects a 48px solid wall but permits reachable steps and floating platforms', () => {
  const placements = [trap('basic-platform', 160, 256), trap('basic-platform', 160, 240)];
  assert.match(placementError(SNOWY_CHAOS, placements, { x: 160, y: 224 }, 20)!, /путь/);
  assert.equal(placementError(SNOWY_CHAOS, [], { x: 224, y: 176 }, 20), null);
  assert.equal(placementError(SNOWY_CHAOS, [], { x: 176, y: 240 }, 20), null);
});
test('fan forces are shared/deterministic, lift a rider from a solid base and remain bounded with overlaps', () => {
  const placements = [trap('fan')], world = new TrapSimulation(SNOWY_CHAOS, placements, [floor, ...placements]);
  const p = createPhysicsPlayer('a', 0, 192, 256), q = structuredClone(p); const actual = [p], predicted = [q];
  for (let tick = 0; tick < 240; tick++) {
    world.step(actual, controls(actual));
    stepPlayers(predicted, controls(predicted), [floor, ...placements], 1152, 320, fanForces(predicted, placements));
    assert.deepEqual(actual, predicted);
    assert.ok(p.y >= PLAYER_PHYSICS.height && p.y <= 272); assert.ok(p.velocityY >= -280 && p.velocityY <= PLAYER_PHYSICS.maxFall);
  }
  assert.ok(p.y < 256);
  const horizontal = [trap('fan', 128, 256, 'right'), trap('fan', 128, 240, 'right')];
  const a = createPhysicsPlayer('a', 0, 170, 272); const bodies = [a];
  const sideways = new TrapSimulation(SNOWY_CHAOS, horizontal, [floor, ...horizontal]);
  for (let i = 0; i < 240; i++) { sideways.step(bodies, controls(bodies)); assert.ok(Math.abs(a.velocityX) <= 170); }
  assert.ok(a.x > 200); assert.ok(a.x < 1152);
});
test('crossbow is tick-driven, hits authoritatively once, respawns quickly and protects the new body', () => {
  const bow = trap('arcade-crossbow', 176, 256, 'left'), world = new TrapSimulation(SNOWY_CHAOS, [bow], [floor, bow]);
  const p = createPhysicsPlayer('a', 0, 140, 272), bodies = [p];
  for (let i = 0; i < 119; i++) world.step(bodies, controls(bodies));
  assert.equal(world.projectiles.length, 0); world.step(bodies, controls(bodies)); assert.equal(world.projectiles.length, 1);
  while (!p.life && world.tick < 180) world.step(bodies, controls(bodies));
  assert.equal(p.life?.phase, 'HIT'); assert.equal(p.life?.failures, 1); const hitSerial = p.life!.serial;
  const until = world.tick + TRAP_RULES.hitTicks + TRAP_RULES.respawnTicks + 1;
  let respawning = false;
  while (world.tick < until) { p.active = true; world.step(bodies, controls(bodies)); if (p.life?.phase === 'RESPAWNING') respawning = true; }
  assert.ok(respawning); assert.equal(p.life?.phase, 'ALIVE'); assert.equal(p.x, SNOWY_CHAOS.spawns[0]!.x); assert.ok(p.life!.serial > hitSerial);
  assert.equal(p.life!.failures, 1); assert.ok(p.life!.immuneUntilTick > world.tick);
  world.projectiles.push({ id: 'duplicate-test', sourceId: bow.id, x: p.x + 3, y: p.y - 8, velocityX: -180, radius: 2, bornTick: world.tick, expiresTick: world.tick + 10 });
  world.step(bodies, controls(bodies)); assert.equal(p.life!.failures, 1);
});
test('projectiles expire, respect solid geometry and obey per-trap/global bounds', () => {
  const bow = trap('arcade-crossbow', 176, 256, 'left'); const wall = { x: 128, y: 224, width: 16, height: 48 };
  const world = new TrapSimulation(SNOWY_CHAOS, [bow], [floor, bow, wall]);
  const p = createPhysicsPlayer('a', 0, 100, 272);
  for (let i = 0; i < 600; i++) { world.step([p], controls([p])); assert.equal(p.life, undefined); assert.ok(world.projectiles.length <= 2); }
  const many = Array.from({ length: 20 }, (_, i) => trap('arcade-crossbow', 128 + i * 32, 176, 'right'));
  const busy = new TrapSimulation(SNOWY_CHAOS, many, [floor]);
  for (let i = 0; i < 900; i++) { busy.step([], new Map()); assert.ok(busy.projectiles.length <= TRAP_RULES.maxProjectiles); assert.ok(busy.projectiles.every(p => p.expiresTick > busy.tick && p.x <= SNOWY_CHAOS.width)); }
});
test('respawn serial resets client replay and rendered correction instead of replaying pre-hit movement', () => {
  const prediction = new RacePrediction('a', SNOWY_CHAOS);
  prediction.begin({ players: [{ playerId: 'a', seat: 0, connected: true }], match: { round: 1, placements: [] } } as never);
  for (let i = 0; i < 10; i++) prediction.step(1, false);
  const p = { ...createPhysicsPlayer('a', 0, 48, 272), round: 1, sequence: 10, life: { phase: 'ALIVE' as const, serial: 2, failures: 1, untilTick: 0, immuneUntilTick: 100 } };
  assert.ok(prediction.reconcile({ roomId: 'room', round: 1, sequence: 1, tick: 40, serverTime: 1000, players: [p], impacts: [] }, false));
  assert.equal(prediction.own!.x, 48); assert.deepEqual(prediction.packet().frames, []); assert.equal(prediction.lastCorrection.reset, true);
});

test('remote hit/respawn is never blended with a buffered position from the previous life', () => {
  const old: NetworkPlayer[] = [
    { ...createPhysicsPlayer('a', 0, 32, 272), round: 1 },
    { ...createPhysicsPlayer('b', 1, 900, 272), round: 1 },
  ];
  const snapshot = (sequence: number, players: NetworkPlayer[]): MovementSnapshot => ({ roomId: 'room', round: 1, sequence, tick: sequence * 6, serverTime: sequence * 100, players, impacts: [] });
  for (const phase of ['HIT', 'RESPAWNING', 'ALIVE'] as const) {
    const view = new RacePresentation('a', SNOWY_CHAOS, [floor]);
    view.receive(snapshot(1, old), old, 100, true); view.sample(old, 100, 16);
    const next = structuredClone(old);
    Object.assign(next[1]!, { x: 64, active: phase === 'ALIVE', life: { phase, serial: phase === 'ALIVE' ? 2 : 1, failures: 1, untilTick: 20, immuneUntilTick: 90 } });
    view.receive(snapshot(2, next), next, 200, false);
    // At200 the100ms buffer still has the old remote at900; blending would smear it across the arena.
    const rendered = view.sample(next, 200, 16).find(p => p.playerId === 'b')!;
    assert.equal(rendered.x, 64); assert.equal(rendered.life?.phase, phase);
  }
});
