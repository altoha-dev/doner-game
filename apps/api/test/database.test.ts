import assert from 'node:assert/strict';
import test from 'node:test';
import { createDatabase } from '../src/db.ts';
import { createPlayerStore } from '../src/players.ts';
import { buildApp } from '../src/app.ts';
import { config, signInitData } from './helpers.ts';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('PostgreSQL: persistent login, constraints, progress preservation and concurrent upsert', { skip: !databaseUrl && 'Set TEST_DATABASE_URL to a migrated disposable *_test database' }, async (t) => {
  assert.ok(databaseUrl);
  assert.match(new URL(databaseUrl).pathname, /_test$/, 'Use only a separate test database');
  const db = createDatabase(databaseUrl);
  const store = createPlayerStore(db);
  const app = await buildApp({ ...config, databaseUrl }, store, false);
  const telegramId = 4400000000000000n + BigInt(Date.now());
  const identity = { telegramId, firstName: 'Initial', lastName: null, username: null, photoUrl: null, languageCode: null };
  t.after(async () => {
    await app.close();
    try { await db.user.deleteMany({ where: { telegramId: { in: [telegramId, telegramId + 1n] } } }); }
    finally { await db.$disconnect(); }
  });

  const first = await store.login(identity);
  assert.equal(first.user.telegramId, telegramId.toString());
  assert.deepEqual(first.progress, { doners: 0, goldenDoners: 0, campaignStage: 0, unlockedCharacterIds: ['altoha'], selectedCharacterId: 'altoha' });
  await db.playerProgress.update({ where: { userId: first.user.id }, data: { doners: 42, goldenDoners: 3, campaignStage: 2 } });
  await db.unlockedCharacter.create({ data: { userId: first.user.id, characterId: 'integration-test-character' } });
  await db.user.update({ where: { id: first.user.id }, data: { lastLoginAt: new Date('2020-01-01') } });

  const initData = signInitData({ user: JSON.stringify({ id: Number(telegramId), first_name: 'Updated', last_name: 'Player', username: 'updated', language_code: 'ru', photo_url: 'https://example.com/photo' }) });
  const login = await app.inject({ method: 'POST', url: '/auth/telegram', payload: { initData } });
  assert.equal(login.statusCode, 200);
  const body = login.json();
  assert.equal(body.user.id, first.user.id);
  assert.equal(body.user.firstName, 'Updated');
  assert.equal(body.user.lastName, 'Player');
  assert.equal(body.user.username, 'updated');
  assert.equal(body.user.languageCode, 'ru');
  assert.equal(body.user.photoUrl, 'https://example.com/photo');
  assert.deepEqual(body.progress, { doners: 42, goldenDoners: 3, campaignStage: 2, unlockedCharacterIds: ['altoha', 'integration-test-character'], selectedCharacterId: 'altoha' });
  const row = await db.user.findUniqueOrThrow({ where: { id: first.user.id } });
  assert.ok(row.lastLoginAt.getTime() > Date.now() - 60000);
  const me = await app.inject({ url: '/me', headers: { authorization: `Bearer ${body.accessToken}` } });
  assert.equal(me.statusCode, 200);
  assert.deepEqual(me.json(), { user: body.user, progress: body.progress });
  // A separate Prisma connection can read the committed profile.
  const secondConnection = createDatabase(databaseUrl);
  try { assert.deepEqual(await createPlayerStore(secondConnection).findById(first.user.id), me.json()); }
  finally { await secondConnection.$disconnect(); }

  const duplicate = (error: unknown) => !!error && typeof error === 'object' && 'code' in error && error.code === 'P2002';
  await assert.rejects(db.user.create({ data: identity }), duplicate);
  await assert.rejects(db.playerProgress.create({ data: { userId: first.user.id } }), duplicate);
  await assert.rejects(db.unlockedCharacter.create({ data: { userId: first.user.id, characterId: 'integration-test-character' } }), duplicate);

  const concurrent = await Promise.all(Array.from({ length: 6 }, () => store.login({ ...identity, telegramId: telegramId + 1n })));
  assert.equal(new Set(concurrent.map(result => result.user.id)).size, 1);
  assert.equal(await db.playerProgress.count({ where: { userId: concurrent[0]!.user.id } }), 1);
  await db.playerProgress.delete({ where: { userId: first.user.id } });
  const repaired = await store.login(identity);
  assert.equal(repaired.progress.doners, 0);
  assert.deepEqual(repaired.progress.unlockedCharacterIds, ['altoha', 'integration-test-character']);
  assert.equal(repaired.user.username, null);
});
