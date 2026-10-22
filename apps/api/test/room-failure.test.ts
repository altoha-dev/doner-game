import assert from 'node:assert/strict';
import test from 'node:test';
import { RoomManager } from '../src/multiplayer/manager.ts';
import { profile } from './helpers.ts';

test('failed LEAVE persistence preserves the authoritative body and membership until retry commits', async t => {
  let failWrite = false;
  const manager = new RoomManager({ async load() { return []; }, async settle() {}, async save() { if (failWrite) throw new Error('Injected store failure'); } });
  t.after(() => manager.stop());
  const other = { ...profile, user: { ...profile.user, id: '970c6870-af30-468a-812b-ee49e1f53473' } };
  const room = await manager.command(profile, { type: 'CREATE', capacity: 2 });
  await manager.command(other, { type: 'JOIN', code: room!.code });
  for (const player of [profile, other]) await manager.command(player, { type: 'READY', ready: true });
  await manager.command(profile, { type: 'START' });
  for (const player of [profile, other]) await manager.command(player, { type: 'SKIP', round: 1 });
  const before = manager.current(profile.user.id);
  const bodies = manager.movementSnapshot(other.user.id)!.players;
  assert.equal(bodies.length, 2);
  failWrite = true;
  await assert.rejects(manager.command(profile, { type: 'LEAVE' }), /Injected store failure/);
  assert.deepEqual(manager.current(profile.user.id), before);
  assert.deepEqual(manager.movementSnapshot(other.user.id)!.players, bodies);
  failWrite = false;
  await manager.command(profile, { type: 'LEAVE' });
  assert.equal(manager.current(profile.user.id), null);
  assert.deepEqual(manager.movementSnapshot(other.user.id)!.players.map(p => p.playerId), [other.user.id]);
});
