import assert from 'node:assert/strict';
import test from 'node:test';
import { placementError, snapToGrid, PARTY_RULES, proposedFinishReward, CHARACTERS } from '@doner-game/shared';
import { SNOWY_CHAOS, MOVEMENT } from '../src/game/level.ts';
import { createLocalSession } from '../src/game/localSession.ts';
import { CHARACTER_COLORS, getPlayerVisual } from '../src/game/playerVisual.ts';

test('all character visuals use the same arena and physical footprint', () => {
  for (const character of CHARACTERS) assert.deepEqual(getPlayerVisual(character.id).body, getPlayerVisual('altoha').body);
  assert.equal(new Set(CHARACTERS.map(c => getPlayerVisual(c.id).texture)).size, 4);
  assert.equal(new Set(CHARACTERS.map(c => CHARACTER_COLORS[c.id].coat)).size, 4);
  assert.deepEqual(getPlayerVisual('ayazhan').run, getPlayerVisual('altoha').run);
  assert.equal(SNOWY_CHAOS.id, 'snowy-chaos'); assert.equal(SNOWY_CHAOS.spawns.length, 4);
  const jumpHeight = MOVEMENT.jump ** 2 / (2 * MOVEMENT.gravity);
  for (const obstacle of SNOWY_CHAOS.geometry.slice(1)) assert.ok(272 - obstacle.y < jumpHeight);
});
test('placement validates grid, finite coordinates, whole area, spawn, finish, terrain and existing blocks', () => {
  assert.deepEqual(snapToGrid({ x: 181, y: 235 }, 16), { x: 176, y: 240 });
  assert.equal(placementError(SNOWY_CHAOS, [], { x: 176, y: 240 }), null);
  for (const point of [{ x: NaN, y: 240 }, { x: Infinity, y: 240 }, { x: 177, y: 240 }, { x: 176, y: -16 }, { x: 176, y: 272 }, { x: 48, y: 240 }, { x: 1008, y: 240 }, { x: 1072, y: 240 }, { x: 256, y: 240 }]) assert.ok(placementError(SNOWY_CHAOS, [], point), JSON.stringify(point));
  const session = createLocalSession(SNOWY_CHAOS);
  session.dispatch({ type: 'PLACE', position: { x: 176, y: 240 } });
  assert.ok(placementError(SNOWY_CHAOS, session.getSnapshot().placements, { x: 192, y: 240 }));
  assert.equal(placementError(SNOWY_CHAOS, session.getSnapshot().placements, { x: 208, y: 240 }), null, 'touching edges allowed');
});
test('BUILD → RACE → RESULTS → BUILD retains the same placement; new match is empty', () => {
  const session = createLocalSession(SNOWY_CHAOS); let notifications = 0;
  const off = session.subscribe(() => notifications++);
  assert.equal(session.dispatch({ type: 'START_RACE' }).ok, false);
  assert.equal(session.dispatch({ type: 'NEXT_ROUND' }).ok, false);
  assert.equal(session.dispatch({ type: 'FINISH_LOCAL', elapsedMs: 10 }).ok, false);
  assert.equal(session.dispatch({ type: 'PLACE', position: { x: 48, y: 240 } }).ok, false);
  assert.equal(notifications, 0);
  for (let round = 1; round <= 3; round++) {
    assert.equal(session.dispatch({ type: 'PLACE', position: { x: 144 + round * 32, y: 192 } }).ok, true);
    assert.equal(session.dispatch({ type: 'PLACE', position: { x: 600, y: 192 } }).ok, false);
    assert.equal(session.dispatch({ type: 'START_RACE' }).ok, true);
    assert.equal(session.dispatch({ type: 'PLACE', position: { x: 600, y: 192 } }).ok, false);
    assert.equal(session.dispatch({ type: 'FINISH_LOCAL', elapsedMs: NaN }).ok, false);
    assert.equal(session.dispatch({ type: 'FINISH_LOCAL', elapsedMs: 12800 }).ok, true);
    assert.equal(session.dispatch({ type: 'FINISH_LOCAL', elapsedMs: 12800 }).ok, false);
    assert.equal(session.getSnapshot().placements.length, round);
    assert.equal(session.getSnapshot().results.length, round);
    assert.equal(session.dispatch({ type: 'NEXT_ROUND' }).ok, true);
    assert.equal(session.getSnapshot().placements[0]?.x, 176);
  }
  assert.equal(notifications, 12); off();
  assert.equal(createLocalSession(SNOWY_CHAOS).getSnapshot().placements.length, 0);
  assert.notEqual(createLocalSession(SNOWY_CHAOS).getSnapshot().matchId, session.getSnapshot().matchId);
  assert.throws(() => { (session.getSnapshot().placements as unknown[]).push({}); });
});
test('bounded local match cannot place infinite objects or continue after completion', () => {
  const session = createLocalSession(SNOWY_CHAOS);
  for (let i = 0; i < PARTY_RULES.localRoundLimit; i++) {
    assert.equal(session.dispatch({ type: 'PLACE', position: { x: 128 + i * 32, y: 176 } }).ok, true);
    session.dispatch({ type: 'START_RACE' }); session.dispatch({ type: 'FINISH_LOCAL', elapsedMs: 100 }); session.dispatch({ type: 'NEXT_ROUND' });
  }
  assert.equal(session.getSnapshot().phase, 'MATCH_FINISHED');
  assert.equal(session.getSnapshot().placements.length, 12);
  assert.equal(session.dispatch({ type: 'PLACE', position: { x: 600, y: 176 } }).ok, false);
  assert.ok(placementError(SNOWY_CHAOS, session.getSnapshot().placements, { x: 600, y: 176 }));
});
test('future finish rules are configurable proposals, with no local economy mutations', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(p => proposedFinishReward(p)), [ { doners: 0, points: 3 }, { doners: 1, points: 2 }, { doners: 2, points: 1 }, { doners: 3, points: 0 }, { doners: 3, points: 0 } ]);
  assert.equal(proposedFinishReward(1, [5, 3, 1, 0]).points, 5);
  assert.throws(() => proposedFinishReward(0)); assert.throws(() => proposedFinishReward(1.5));
  assert.deepEqual(PARTY_RULES.unresolved, ['DNF', 'ties', 'disconnect']);
  assert.equal('doners' in createLocalSession(SNOWY_CHAOS).getSnapshot(), false);
});
