import assert from 'node:assert/strict';
import test from 'node:test';
import { CHARACTERS, STARTER_CHARACTER, getCharacter } from '@doner-game/shared';
import { createDatabase } from '../src/db.ts';
import { createPlayerStore } from '../src/players.ts';
import { ApiError } from '../src/errors.ts';
import { buildApp } from '../src/app.ts';
import { config, memoryPlayers, profile } from './helpers.ts';

test('catalog preserves the starter/legacy costs and adds stable free Ayazhan', () => {
  assert.equal(STARTER_CHARACTER.id, 'altoha');
  assert.equal(CHARACTERS.filter(character => character.starter).length, 1);
  assert.deepEqual(CHARACTERS.map(({ id, unlockCost }) => [id, unlockCost]), [['altoha', 0], ['aigerim', 1], ['temik', 1], ['ayazhan', 0]]);
  assert.equal(getCharacter('ayazhan')?.displayName, 'Ayazhan');
  assert.equal(getCharacter('AYAZHAN'), undefined);
  assert.equal(new Set(CHARACTERS.map(c => c.order)).size, 4);
});

test('character routes require JWT, reject client economy fields, and use the internal subject', async t => {
  const calls: string[][] = [];
  const app = await buildApp(config, {
    ...memoryPlayers(),
    async unlockCharacter(id, characterId) { calls.push([id, characterId]); return { result: 'unlocked', progress: profile.progress }; },
    async selectCharacter(id, characterId) { calls.push([id, characterId]); return profile.progress; },
  }, false);
  t.after(() => app.close());
  await app.ready();
  const headers = { authorization: `Bearer ${app.jwt.sign({ sub: profile.user.id })}` };
  assert.equal((await app.inject({ method: 'POST', url: '/characters/aigerim/unlock' })).statusCode, 401);
  assert.equal((await app.inject({ method: 'PUT', url: '/me/character', payload: { characterId: 'altoha' } })).statusCode, 401);
  for (const payload of [{ doners: 100 }, { userId: 'other' }, { campaignStage: 3 }, {}]) {
    assert.equal((await app.inject({ method: 'POST', url: '/characters/aigerim/unlock', headers, payload })).statusCode, 400);
  }
  for (const payload of [{}, { characterId: 1 }, { characterId: 'altoha', doners: 100 }, { characterId: 'altoha', userId: 'other' }]) {
    assert.equal((await app.inject({ method: 'PUT', url: '/me/character', headers, payload })).statusCode, 400);
  }
  assert.deepEqual(calls, []);
  assert.equal((await app.inject({ method: 'POST', url: '/characters/aigerim/unlock?userId=other', headers })).statusCode, 200);
  assert.equal((await app.inject({ method: 'PUT', url: '/me/character', headers, payload: { characterId: 'altoha' } })).statusCode, 200);
  assert.deepEqual(calls, [[profile.user.id, 'aigerim'], [profile.user.id, 'altoha']]);
  const preflight = await app.inject({ method: 'OPTIONS', url: '/me/character', headers: { origin: config.corsOrigins[0]!, 'access-control-request-method': 'PUT' } });
  assert.equal(preflight.statusCode, 204);
  assert.match(String(preflight.headers['access-control-allow-methods']), /PUT/);
  for (const url of ['/give-doners', '/add-doners', '/debug-money', '/me/campaign']) {
    assert.equal((await app.inject({ method: 'POST', url, headers })).statusCode, 404);
  }
});

const databaseUrl = process.env.TEST_DATABASE_URL;
test('PostgreSQL character ownership and economy', { skip: !databaseUrl && 'Set TEST_DATABASE_URL to a migrated disposable *_test database' }, async t => {
  assert.ok(databaseUrl);
  assert.match(new URL(databaseUrl).pathname, /_test$/);
  const db = createDatabase(databaseUrl);
  const store = createPlayerStore(db);
  const app = await buildApp({ ...config, databaseUrl }, store, false);
  await app.ready();
  const ids: string[] = [];
  let telegramId = 4300000000000000n + BigInt(Date.now());
  const fresh = async (doners = 0) => {
    const identity = { telegramId: telegramId++, firstName: 'Test', lastName: null, username: null, photoUrl: null, languageCode: null };
    const player = await store.login(identity);
    ids.push(player.user.id);
    if (doners) await db.playerProgress.update({ where: { userId: player.user.id }, data: { doners } });
    return { id: player.user.id, identity };
  };
  const errorCode = (code: string) => (error: unknown) => error instanceof ApiError && error.code === code;
  t.after(async () => {
    await app.close();
    try { await db.user.deleteMany({ where: { id: { in: ids } } }); }
    finally { await db.$disconnect(); }
  });

  await t.test('new player gets starter and repeat/concurrent login creates no duplicate', async () => {
    const { id, identity } = await fresh();
    await Promise.all(Array.from({ length: 4 }, () => store.login(identity)));
    const player = await store.findById(id);
    assert.deepEqual(player!.progress.unlockedCharacterIds, ['altoha']);
    assert.equal(player!.progress.selectedCharacterId, 'altoha');
    assert.equal(await db.unlockedCharacter.count({ where: { userId: id } }), 1);
  });
  await t.test('GET /me backfills a Stage 3 user without login or balance/progress reset', async () => {
    const user = await db.user.create({ data: { telegramId: telegramId++, firstName: 'Existing', progress: { create: { doners: 8, goldenDoners: 2, campaignStage: 1 } } } });
    ids.push(user.id);
    const response = await app.inject({ url: '/me', headers: { authorization: `Bearer ${app.jwt.sign({ sub: user.id })}` } });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json().progress, { doners: 8, goldenDoners: 2, campaignStage: 1, unlockedCharacterIds: ['altoha'], selectedCharacterId: 'altoha' });
    await store.findById(user.id);
    assert.equal(await db.unlockedCharacter.count({ where: { userId: user.id } }), 1);
  });
  await t.test('locked selection and unknown IDs fail without writes', async () => {
    const { id } = await fresh();
    await assert.rejects(store.selectCharacter(id, 'aigerim'), errorCode('CHARACTER_LOCKED'));
    for (const characterId of ['unknown', '__proto__', 'ALTOHA']) {
      await assert.rejects(store.selectCharacter(id, characterId), errorCode('INVALID_CHARACTER'));
      await assert.rejects(store.unlockCharacter(id, characterId), errorCode('INVALID_CHARACTER'));
    }
    assert.equal((await store.findById(id))!.progress.selectedCharacterId, 'altoha');
  });
  await t.test('insufficient funds reject both paid characters with no state change', async () => {
    const { id } = await fresh();
    const before = await store.findById(id);
    for (const characterId of ['aigerim', 'temik']) await assert.rejects(store.unlockCharacter(id, characterId), errorCode('INSUFFICIENT_DONERS'));
    assert.deepEqual(await store.findById(id), before);
  });
  for (const characterId of ['aigerim', 'temik']) await t.test(`${characterId} can be the first purchase, costs one Doner, can be selected and persists`, async () => {
    const { id, identity } = await fresh(2);
    const result = await store.unlockCharacter(id, characterId);
    assert.equal(result.result, 'unlocked');
    assert.equal(result.progress.doners, 1);
    assert.deepEqual(result.progress.unlockedCharacterIds, ['altoha', characterId]);
    assert.equal(result.progress.selectedCharacterId, 'altoha');
    assert.equal((await store.selectCharacter(id, characterId)).selectedCharacterId, characterId);
    assert.equal((await store.login(identity)).progress.selectedCharacterId, characterId);
    assert.equal((await store.unlockCharacter(id, characterId)).result, 'already_unlocked');
    assert.equal((await store.findById(id))!.progress.doners, 1);
  });
  await t.test('starter unlock is idempotent and free', async () => {
    const { id } = await fresh(2);
    const result = await store.unlockCharacter(id, 'altoha');
    assert.equal(result.result, 'already_unlocked');
    assert.equal(result.progress.doners, 2);
  });
  await t.test('concurrent duplicate unlock from independent API connections charges exactly once', async () => {
    const { id } = await fresh(3);
    const otherDb = createDatabase(databaseUrl);
    try {
      const other = createPlayerStore(otherDb);
      const results = await Promise.all([store.unlockCharacter(id, 'aigerim'), other.unlockCharacter(id, 'aigerim'), store.unlockCharacter(id, 'aigerim')]);
      assert.equal(results.filter(result => result.result === 'unlocked').length, 1);
      assert.equal((await store.findById(id))!.progress.doners, 2);
      assert.equal(await db.unlockedCharacter.count({ where: { userId: id, characterId: 'aigerim' } }), 1);
    } finally { await otherDb.$disconnect(); }
  });
  await t.test('concurrent different purchases cannot spend the same last Doner', async () => {
    const { id } = await fresh(1);
    const results = await Promise.allSettled([store.unlockCharacter(id, 'aigerim'), store.unlockCharacter(id, 'temik')]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const failed = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
    assert.equal(failed.reason.code, 'INSUFFICIENT_DONERS');
    const progress = (await store.findById(id))!.progress;
    assert.equal(progress.doners, 0);
    assert.equal(progress.unlockedCharacterIds.length, 2);
  });
  await t.test('failure after debit rolls back balance and ownership in the real transaction', async () => {
    const { id } = await fresh(1);
    const failing = db.$extends({ query: { unlockedCharacter: { async create() { throw new Error('Injected insert failure'); } } } });
    await assert.rejects(createPlayerStore(failing as unknown as typeof db).unlockCharacter(id, 'aigerim'), /Injected insert failure/);
    const progress = (await store.findById(id))!.progress;
    assert.equal(progress.doners, 1);
    assert.deepEqual(progress.unlockedCharacterIds, ['altoha']);
  });
  await t.test('real HTTP responses enforce ownership, insufficient funds and return new progress', async () => {
    const { id } = await fresh();
    const headers = { authorization: `Bearer ${app.jwt.sign({ sub: id })}` };
    assert.equal((await app.inject({ method: 'POST', url: '/characters/unknown/unlock', headers })).statusCode, 400);
    assert.equal((await app.inject({ method: 'PUT', url: '/me/character', headers, payload: { characterId: 'temik' } })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: '/characters/temik/unlock', headers })).statusCode, 409);
    await db.playerProgress.update({ where: { userId: id }, data: { doners: 1 } });
    const unlocked = await app.inject({ method: 'POST', url: '/characters/temik/unlock', headers });
    assert.equal(unlocked.statusCode, 200);
    assert.equal(unlocked.json().progress.doners, 0);
    const selected = await app.inject({ method: 'PUT', url: '/me/character', headers, payload: { characterId: 'temik' } });
    assert.equal(selected.statusCode, 200);
    assert.equal(selected.json().progress.selectedCharacterId, 'temik');
  });
});
