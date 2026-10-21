import test from 'node:test';
import assert from 'node:assert/strict';
import { SNOWY_CHAOS, buildMiniAppLink, roomCodeFromStartParam } from '@doner-game/shared';
import { initialMovement, validateMovement, atFinish } from '../src/multiplayer/movement.ts';
import { parseCommand, parseMovement, parsePreview, parseRaceControls, RateGate } from '../src/multiplayer/validation.ts';

test('movement rejects teleport, impossible velocity, stale sequence, floor/wall penetration and hovering', () => {
  const history = initialMovement('player', 0, 1, 1000);
  const base = { round: 1, sequence: 1, x: 52, y: 272, velocityX: 100, velocityY: 0 };
  assert.ok(validateMovement(history, base, SNOWY_CHAOS.geometry, 1067));
  for (const invalid of [base, { ...base, sequence: 2, x: 1080 }, { ...base, sequence: 2, velocityX: 300 }, { ...base, sequence: 2, y: 280 }, { ...base, sequence: 2, round: 2 }, { ...base, sequence: 2, y: 200 }]) assert.equal(validateMovement(history, invalid, SNOWY_CHAOS.geometry, 1134), false);
  history.state = { ...history.state, x: 245, y: 272 }; history.raceStart = 0; history.acceptedAt = 1200;
  assert.equal(validateMovement(history, { ...base, sequence: 2, x: 262 }, SNOWY_CHAOS.geometry, 1300), false);
  history.state = { ...history.state, x: 60, y: 250 }; history.airSince = 1000; history.acceptedAt = 2500;
  assert.equal(validateMovement(history, { ...base, sequence: 2, x: 60, y: 250 }, SNOWY_CHAOS.geometry, 2600), false);
  assert.equal(atFinish(base), false); assert.equal(atFinish({ ...base, x: 1080, y: 272 }), true);
});
test('short landing and buffered jump between 15Hz packets is accepted only near a reachable real surface', () => {
  const history = initialMovement('player', 0, 1, 0);
  history.state = { ...history.state, sequence: 20, x: 456, y: 238, velocityX: 100, velocityY: 100 };
  history.acceptedAt = 5000; history.groundY = 272; history.airSince = 4500;
  assert.ok(validateMovement(history, { round: 1, sequence: 21, x: 462, y: 228, velocityX: 100, velocityY: -200 }, SNOWY_CHAOS.geometry, 5067));
  assert.equal(history.groundY, 240);
});
test('socket payloads reject spoofed identity, unsupported finish events and nonfinite coordinates', () => {
  assert.equal(parseCommand({ type: 'READY', ready: true, userId: 'other' }), null);
  assert.equal(parseCommand({ type: 'I_FINISHED_FIRST' }), null);
  assert.equal(parseCommand({ type: 'CREATE', capacity: 8 }), null);
  assert.equal(parseMovement({ round: 1, sequence: 1, x: Infinity, y: 272, velocityX: 0, velocityY: 0 }), null);
  assert.equal(parseMovement({ round: 1, sequence: 1, x: 50, y: 272, velocityX: 0, velocityY: 0, name: 'other' }), null);
  const gate = new RateGate(); assert.ok(gate.take('player', 2, 1000)); assert.ok(gate.take('player', 2, 1000)); assert.equal(gate.take('player', 2, 1000), false);
});
test('room invite uses the existing Main Mini App helper and accepts only a room code as hint', () => {
  assert.equal(buildMiniAppLink('doner_test_bot', 'room_X7K2M9'), 'https://t.me/doner_test_bot?startapp=room_X7K2M9');
  assert.equal(roomCodeFromStartParam('room_x7k2m9'), 'X7K2M9'); assert.equal(roomCodeFromStartParam('solo'), null);
  assert.equal(roomCodeFromStartParam('room_X7K2M9&token=secret'), null);
  assert.throws(() => buildMiniAppLink('bad/name', 'home'));
});
test('input and preview contracts reject identity/coordinates/status injection and unbounded values', () => {
  const input = { round: 1, sequence: 10, direction: -1, jump: 2 };
  assert.deepEqual(parseRaceControls(input), input);
  for (const value of [{ ...input, direction: 2 }, { ...input, jump: 11 }, { ...input, sequence: NaN }, { ...input, x: 1080 }, { ...input, playerId: 'other' }]) assert.equal(parseRaceControls(value), null);
  const preview = { round: 1, sequence: 2, objectType: 'basic-platform', position: { x: 176, y: 240 } };
  assert.deepEqual(parsePreview(preview), preview); assert.ok(parsePreview({ ...preview, position: null }));
  for (const value of [{ ...preview, valid: true }, { ...preview, roomId: 'other' }, { ...preview, userId: 'other' }, { ...preview, position: { x: Infinity, y: 240 } }, { ...preview, position: { x: 1000000, y: 240 } }, { ...preview, position: {} }]) assert.equal(parsePreview(value), null);
});
