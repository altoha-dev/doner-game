import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test, { type TestContext } from 'node:test';
import { buildApp } from '../src/app.ts';
import { config, memoryPlayers, profile, signInitData } from './helpers.ts';

async function setup(t: TestContext, players = memoryPlayers()) {
  const app = await buildApp(config, players, false);
  t.after(() => app.close());
  await app.ready();
  return app;
}

test('GET /health is public with security headers and no caching', async (t) => {
  const app = await setup(t);
  const response = await app.inject('/health');
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: 'ok' });
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
});

test('verified Telegram login returns a one-hour JWT and /me uses only its internal subject', async (t) => {
  const app = await setup(t);
  const response = await app.inject({ method: 'POST', url: '/auth/telegram', payload: { initData: signInitData() } });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.deepEqual(body.user, profile.user);
  assert.deepEqual(body.progress, profile.progress);
  assert.equal(body.expiresIn, 3600);
  const claims = app.jwt.verify<{ sub: string; exp: number; iat: number }>(body.accessToken);
  assert.equal(claims.sub, profile.user.id);
  assert.equal(claims.exp - claims.iat, 3600);
  assert.deepEqual(Object.keys(claims).sort(), ['aud', 'exp', 'iat', 'iss', 'sub']);
  const me = await app.inject({ url: '/me?userId=attacker&telegramId=1', headers: { authorization: `Bearer ${body.accessToken}` } });
  assert.equal(me.statusCode, 200);
  assert.deepEqual(me.json(), profile);
  assert.ok(!response.body.includes(config.botToken));
  assert.ok(!response.body.includes(config.jwtSecret));
});

test('/me rejects absent, invalid, expired, wrong-audience, wrong-issuer and unknown-user tokens', async (t) => {
  const app = await setup(t);
  // Sign exact claims independently: app.jwt.sign applies its default expiry.
  const fixtureToken = (claims: Record<string, unknown>, secret = config.jwtSecret) => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: profile.user.id, iss: 'doner-game', aud: 'doner-game-api', exp: Math.floor(Date.now() / 1000) + 3600, ...claims })).toString('base64url');
    const data = `${header}.${payload}`;
    return `${data}.${createHmac('sha256', secret).update(data).digest('base64url')}`;
  };
  const tokens = [undefined, 'broken', fixtureToken({ exp: 1 }),
    fixtureToken({ aud: 'other-api' }), fixtureToken({ iss: 'other-issuer' }), fixtureToken({}, 'wrong-test-secret'),
    app.jwt.sign({ sub: '123' }), app.jwt.sign({ sub: '6c4ddab7-19e0-4ae7-a7ee-8097ec9a38fc' })];
  for (const [index, token] of tokens.entries()) {
    const response = await app.inject({ url: '/me', headers: token ? { authorization: `Bearer ${token}` } : {} });
    assert.equal(response.statusCode, 401, `Invalid token case ${index}`);
    assert.equal(response.json().error.code, 'INVALID_ACCESS_TOKEN');
  }
});

test('unverified initData never reaches persistence', async (t) => {
  let calls = 0;
  const app = await setup(t, { ...memoryPlayers(), async login() { calls++; return profile; } });
  for (const initData of ['invalid', signInitData({}, 'wrong-test-bot-token'), signInitData({ auth_date: '1' })]) {
    const response = await app.inject({ method: 'POST', url: '/auth/telegram', payload: { initData } });
    assert.equal(response.statusCode, 401);
    assert.equal(response.json().error.code, 'INVALID_TELEGRAM_AUTH');
  }
  assert.equal(calls, 0);
});

test('invalid bodies and oversized requests use safe common errors', async (t) => {
  const app = await setup(t);
  for (const payload of [{}, { initData: 123 }, { initData: '' }, { initData: signInitData(), userId: 'attacker' }]) {
    const response = await app.inject({ method: 'POST', url: '/auth/telegram', payload });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, 'INVALID_REQUEST');
  }
  const malformed = await app.inject({ method: 'POST', url: '/auth/telegram', headers: { 'content-type': 'application/json' }, payload: '{' });
  assert.equal(malformed.statusCode, 400);
  const large = await app.inject({ method: 'POST', url: '/auth/telegram', payload: { initData: 'a'.repeat(40000) } });
  assert.equal(large.statusCode, 413);
  assert.equal(large.json().error.code, 'REQUEST_TOO_LARGE');
});

test('authentication is rate limited but /health remains public', async (t) => {
  const app = await setup(t);
  for (let i = 0; i < 10; i++) assert.equal((await app.inject({ method: 'POST', url: '/auth/telegram', payload: { initData: 'invalid' } })).statusCode, 401);
  const limited = await app.inject({ method: 'POST', url: '/auth/telegram', payload: { initData: 'invalid' }, headers: { 'x-forwarded-for': '1.2.3.4' } });
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.json().error.code, 'RATE_LIMITED');
  assert.equal((await app.inject('/health')).statusCode, 200);
});

test('CORS accepts only configured origins, including Authorization preflight', async (t) => {
  const app = await setup(t);
  for (const origin of config.corsOrigins) {
    const response = await app.inject({ method: 'OPTIONS', url: '/me', headers: { origin, 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization' } });
    assert.equal(response.statusCode, 204);
    assert.equal(response.headers['access-control-allow-origin'], origin);
    assert.match(String(response.headers['access-control-allow-headers']), /Authorization/);
  }
  const blocked = await app.inject({ url: '/health', headers: { origin: 'https://evil.example.com' } });
  assert.equal(blocked.headers['access-control-allow-origin'], undefined);
});

test('internal failures and unknown endpoints expose no stack or secrets', async (t) => {
  const app = await setup(t, { ...memoryPlayers(), async login() { throw new Error(`private connection ${config.databaseUrl} ${config.botToken}`); } });
  const response = await app.inject({ method: 'POST', url: '/auth/telegram', payload: { initData: signInitData() } });
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.json(), { error: { code: 'INTERNAL_ERROR', message: 'Internal server error.' } });
  const notFound = await app.inject('/auth/dev');
  assert.equal(notFound.statusCode, 404);
  assert.equal(notFound.json().error.code, 'NOT_FOUND');
});
