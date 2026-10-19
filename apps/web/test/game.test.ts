import assert from 'node:assert/strict';
import test from 'node:test';
import { GameInput, KEY_ACTIONS } from '../src/game/input.ts';
import { mountAsyncGame } from '../src/game/lifecycle.ts';

test('movement combines keyboard and multiple fingers without stuck releases', () => {
  const input = new GameInput();
  input.press('key:KeyD', 'right'); input.press('pointer:1', 'right');
  input.release('key:KeyD'); assert.equal(input.direction, 1);
  input.press('pointer:2', 'left'); assert.equal(input.direction, 0);
  input.release('pointer:1'); assert.equal(input.direction, -1);
  input.release('pointer:2'); assert.equal(input.direction, 0);
});
test('jump uses an edge, supports simultaneous movement and resets on pause/blur', () => {
  const input = new GameInput();
  input.press('pointer:1', 'right'); input.press('pointer:2', 'jump');
  assert.equal(input.direction, 1); assert.equal(input.consumeJump(), true);
  input.press('pointer:2', 'jump'); assert.equal(input.consumeJump(), false);
  input.release('pointer:2'); input.press('pointer:2', 'jump');
  input.clear(); assert.equal(input.direction, 0); assert.equal(input.consumeJump(), false);
  assert.equal(KEY_ACTIONS.KeyW, 'jump'); assert.equal(KEY_ACTIONS.ArrowUp, 'jump'); assert.equal(KEY_ACTIONS.Space, 'jump');
});
test('leaving during lazy load never creates a stale Phaser canvas', async () => {
  let finish!: (create: () => { destroy: () => void }) => void;
  let created = 0;
  const cleanup = mountAsyncGame(() => new Promise(resolve => { finish = resolve; }), () => assert.fail());
  cleanup();
  finish(() => { created++; return { destroy() {} }; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(created, 0);
});
test('unmount destroys the mounted game exactly once', async () => {
  let destroyed = 0;
  const cleanup = mountAsyncGame(async () => () => ({ destroy() { destroyed++; } }), () => assert.fail());
  await new Promise(resolve => setImmediate(resolve));
  cleanup(); cleanup(); assert.equal(destroyed, 1);
});
test('lazy load failures reach the UI only while mounted', async () => {
  let errors = 0;
  const load = async () => { throw new Error('network'); };
  const cleanup = mountAsyncGame(load, () => { errors++; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(errors, 1); cleanup();
  const cancelled = mountAsyncGame(load, () => { errors++; }); cancelled();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(errors, 1);
});
