import assert from 'node:assert/strict';
import test from 'node:test';
import { CHARACTERS } from '@doner-game/shared';
import type { PlayerProgressDto } from '@doner-game/shared';
import { getBackScreen } from '../src/campaign.ts';
import { getPlayerLaunch, getPreviewLaunch } from '../src/game/launch.ts';
import { LEVEL_ONE, MOVEMENT } from '../src/game/level.ts';
import { GameInput, KEY_ACTIONS } from '../src/game/input.ts';
import { mountAsyncGame } from '../src/game/lifecycle.ts';

const progress: PlayerProgressDto = { doners: 0, goldenDoners: 0, campaignStage: 0, unlockedCharacterIds: ['altoha'], selectedCharacterId: 'altoha' };
for (const [id, theme] of [['altoha', 'altoha-city'], ['aigerim', 'aigerim-imperial'], ['temik', 'temik-bazaar']] as const) {
  test(`owned selected ${id} launches Level 1 with ${theme}`, () => {
    const launch = getPlayerLaunch({ ...progress, selectedCharacterId: id, unlockedCharacterIds: [id] });
    assert.equal(launch?.character.id, id);
    assert.equal(launch?.theme.themeId, theme);
    assert.equal(launch?.theme.characterId, id);
    assert.equal(launch?.level, LEVEL_ONE);
    assert.equal(launch?.preview, false);
  });
}
test('a selected but locked character cannot launch, regardless of balance or stage', () => {
  assert.equal(getPlayerLaunch({ ...progress, selectedCharacterId: 'aigerim', doners: 100, campaignStage: 10 }), null);
  assert.equal(getPlayerLaunch({ ...progress, selectedCharacterId: 'temik' }), null);
  assert.equal(getPlayerLaunch({ ...progress, unlockedCharacterIds: [] }), null);
});
test('unauthenticated, missing and unknown selection require character selection', () => {
  assert.equal(getPlayerLaunch(undefined), null);
  assert.equal(getPlayerLaunch({ ...progress, selectedCharacterId: null }), null);
  assert.equal(getPlayerLaunch({ ...progress, selectedCharacterId: 'unknown', unlockedCharacterIds: ['unknown'] }), null);
});
test('launch never mutates server progress or awards completion', () => {
  const before = structuredClone(progress);
  getPlayerLaunch(progress);
  assert.deepEqual(progress, before);
});
test('local world preview requires both a development build and browser mode', () => {
  for (const character of CHARACTERS) {
    assert.equal(getPreviewLaunch(character.id, false, true), null);
    assert.equal(getPreviewLaunch(character.id, true, false), null);
    assert.equal(getPreviewLaunch(character.id, true, true)?.preview, true);
  }
});
test('Back returns to the launch origin and preserves existing menu navigation', () => {
  assert.equal(getBackScreen('game', 'campaign'), 'campaign');
  assert.equal(getBackScreen('game', 'characters'), 'characters');
  assert.equal(getBackScreen('characters', 'campaign'), 'campaign');
  assert.equal(getBackScreen('campaign', 'characters'), 'home');
});
test('safe ground covers the level and mandatory obstacles are jumpable', () => {
  const ground = LEVEL_ONE.platforms[0];
  assert.equal(ground.x, 0); assert.equal(ground.width, LEVEL_ONE.width);
  assert.ok(LEVEL_ONE.spawn.x > 0 && LEVEL_ONE.spawn.x < LEVEL_ONE.goal.x);
  assert.ok(LEVEL_ONE.spawn.y < ground.y && LEVEL_ONE.goal.x < LEVEL_ONE.width);
  const jumpHeight = MOVEMENT.jump ** 2 / (2 * MOVEMENT.gravity);
  for (const platform of LEVEL_ONE.platforms.slice(1)) {
    assert.ok(platform.x + platform.width <= LEVEL_ONE.width);
    if (platform.y + platform.height === ground.y) assert.ok(ground.y - platform.y < jumpHeight);
  }
});
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
