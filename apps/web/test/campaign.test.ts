import assert from 'node:assert/strict';
import test from 'node:test';
import { CHARACTERS } from '@doner-game/shared';
import type { PlayerProgressDto } from '@doner-game/shared';
import { getCharacterState, getLevelState } from '../src/campaign.ts';

const progress: PlayerProgressDto = { doners: 0, goldenDoners: 0, campaignStage: 0, unlockedCharacterIds: ['altoha'], selectedCharacterId: 'altoha' };
test('campaign starts with level 1 available and two locked nodes', () => {
  assert.deepEqual([1, 2, 3].map(level => getLevelState(level, 0)), ['available', 'locked', 'locked']);
  assert.deepEqual([1, 2, 3].map(level => getLevelState(level, 1)), ['completed', 'available', 'locked']);
});
test('catalog presents selected, locked, purchasable and available states from server progress', () => {
  const [altoha, aigerim, temik] = CHARACTERS;
  assert.equal(getCharacterState(altoha, progress), 'selected');
  assert.equal(getCharacterState(aigerim, progress), 'insufficient');
  assert.equal(getCharacterState(temik, { ...progress, doners: 1 }), 'purchasable');
  assert.equal(getCharacterState(aigerim, { ...progress, unlockedCharacterIds: ['altoha', 'aigerim'] }), 'available');
  assert.equal(getCharacterState(aigerim, { ...progress, unlockedCharacterIds: ['altoha', 'aigerim'], selectedCharacterId: 'aigerim' }), 'selected');
});
test('browser preview is never interpreted as owned or authenticated', () => {
  for (const character of CHARACTERS) assert.equal(getCharacterState(character, undefined), 'preview');
});
