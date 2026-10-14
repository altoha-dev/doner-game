import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiClientError, createApiClient, getAuthErrorMessage } from '../src/api.ts';

test('client sends original initData then authenticates /me using only its in-memory token', async (t) => {
  const calls: { url: string; options: RequestInit }[] = [];
  const profile = { user: { id: 'internal-id', firstName: 'Server identity' }, progress: { doners: 0 } };
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    calls.push({ url, options });
    return Response.json(url.endsWith('/auth/telegram') ? { accessToken: 'test-access-token', user: { firstName: 'Ignore login copy' } } : profile);
  });
  const client = createApiClient('https://api.example.com/');
  const original = 'user=%7B%22id%22%3A123%7D&signature=A%2B%2F%3D&hash=original';
  await client.login(original);
  assert.deepEqual(await client.getMe(), profile);
  assert.equal(calls[0]!.url, 'https://api.example.com/auth/telegram');
  assert.deepEqual(JSON.parse(String(calls[0]!.options.body)), { initData: original });
  assert.equal(calls[1]!.url, 'https://api.example.com/me');
  assert.deepEqual(calls[1]!.options.headers, { Authorization: 'Bearer test-access-token' });
  assert.equal(calls[1]!.options.credentials, 'omit');
  assert.equal(calls[1]!.options.cache, 'no-store');
  client.clear();
  await assert.rejects(client.getMe(), ApiClientError);
  await assert.rejects(createApiClient('https://api.example.com').getMe(), ApiClientError);
  assert.equal(calls.length, 2);
});

test('API errors never expose server messages and a rejected session is cleared', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return calls === 1 ? Response.json({ accessToken: 'test-token' }) : Response.json({ error: { code: 'INVALID_ACCESS_TOKEN', message: 'PRIVATE STACK' } }, { status: 401 });
  });
  const client = createApiClient('https://api.example.com');
  await client.login('original');
  await assert.rejects(client.getMe(), error => {
    assert.ok(error instanceof ApiClientError);
    assert.equal(error.status, 401);
    assert.match(getAuthErrorMessage(error), /Сессия истекла/);
    assert.ok(!getAuthErrorMessage(error).includes('PRIVATE STACK'));
    return true;
  });
  await assert.rejects(client.getMe(), ApiClientError);
  assert.equal(calls, 2);
  assert.match(getAuthErrorMessage(new ApiClientError('INVALID_TELEGRAM_AUTH', 401)), /откройте его снова/);
  assert.match(getAuthErrorMessage(new ApiClientError('RATE_LIMITED', 429)), /Подождите минуту/);
  assert.equal(getAuthErrorMessage(new Error('private details')), 'Не удалось подключиться к серверу.');
});

test('aborted authentication cannot establish a session', async (t) => {
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async () => {
    controller.abort();
    return Response.json({ accessToken: 'test-token' });
  });
  const client = createApiClient('https://api.example.com');
  await client.login('data', controller.signal);
  await assert.rejects(client.getMe(), ApiClientError);
});

test('missing or unsafe API URLs fail locally', () => {
  for (const url of [undefined, '', 'relative-url', 'ftp://example.com', 'https://user:password@example.com', 'https://example.com?token=secret']) {
    assert.throws(() => createApiClient(url), ApiClientError);
  }
});

test('unlock and selection send no balance/user ID, return committed progress and retain session after business errors', async (t) => {
  const calls: { url: string; options: RequestInit }[] = [];
  let enough = false;
  const progress = { doners: 0, goldenDoners: 0, campaignStage: 0, unlockedCharacterIds: ['altoha', 'aigerim'], selectedCharacterId: 'aigerim' };
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    calls.push({ url, options });
    if (url.endsWith('/auth/telegram')) return Response.json({ accessToken: 'test-token' });
    if (url.endsWith('/unlock') && !enough) return Response.json({ error: { code: 'INSUFFICIENT_DONERS' } }, { status: 409 });
    return Response.json({ progress, result: 'unlocked' });
  });
  const client = createApiClient('https://api.example.com');
  await client.login('original');
  await assert.rejects(client.unlockCharacter('aigerim'), error => error instanceof ApiClientError && error.code === 'INSUFFICIENT_DONERS');
  enough = true;
  assert.deepEqual((await client.unlockCharacter('aigerim')).progress, progress);
  assert.deepEqual((await client.selectCharacter('aigerim')).progress, progress);
  for (const call of calls.slice(1)) assert.equal((call.options.headers as Record<string, string>).Authorization, 'Bearer test-token');
  assert.equal(calls[2]!.options.method, 'POST');
  assert.equal(calls[2]!.options.body, undefined);
  assert.equal(calls[3]!.options.method, 'PUT');
  assert.deepEqual(JSON.parse(String(calls[3]!.options.body)), { characterId: 'aigerim' });
});
