import assert from 'node:assert/strict';
import test from 'node:test';
import { ConfigurationError, parseConfig } from '../src/config.ts';
import { config } from './helpers.ts';

const environment = { DATABASE_URL: config.databaseUrl, BOT_TOKEN: config.botToken, JWT_SECRET: config.jwtSecret, CORS_ORIGINS: config.corsOrigins.join(', ') };

test('config uses explicit origins and documented defaults', () => {
  const result = parseConfig(environment);
  assert.deepEqual(result.corsOrigins, config.corsOrigins);
  assert.equal(result.port, 3001);
  assert.equal(result.telegramMaxAgeSeconds, 86400);
  assert.equal(result.trustProxyHops, 0);
});

test('invalid configuration fails without including environment values', () => {
  for (const overrides of [
    { JWT_SECRET: 'weak' }, { BOT_TOKEN: '' }, { DATABASE_URL: 'invalid-private-connection' },
    { CORS_ORIGINS: '*' }, { CORS_ORIGINS: 'https://example.com/path' }, { CORS_ORIGINS: 'https://example.com/' },
    { PORT: '0' }, { TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: '-1' }, { TRUST_PROXY_HOPS: 'invalid' },
  ]) {
    assert.throws(() => parseConfig({ ...environment, ...overrides }), error => {
      assert.ok(error instanceof ConfigurationError);
      assert.ok(!error.message.includes(config.botToken));
      assert.ok(!error.message.includes(config.jwtSecret));
      assert.ok(!error.message.includes('invalid-private-connection'));
      return true;
    });
  }
});
