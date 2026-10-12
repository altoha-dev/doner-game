import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError } from '../src/errors.ts';
import { validateTelegramInitData } from '../src/telegram-auth.ts';
import { config, signInitData } from './helpers.ts';

const now = 1700000000;
const validate = (data: string, token = config.botToken) => validateTelegramInitData(data, token, 86400, now);
const signed = (fields: Record<string, string> = {}) => signInitData({ auth_date: String(now), ...fields });
const rejected = (data: string) => assert.throws(() => validate(data), (error) => error instanceof ApiError && error.statusCode === 401 && error.code === 'INVALID_TELEGRAM_AUTH');

test('official HMAC algorithm matches an independently generated fixed fixture, including signature', () => {
  const fixture = 'auth_date=1700000000&query_id=test-query&user=%7B%22id%22%3A4503599627370495%2C%22first_name%22%3A%22Altoha%22%2C%22username%22%3A%22altoha%22%7D&signature=test-third-party-signature&hash=7401c9cc1d63ce64d5d5b175789a164002bc7064903d5203a7dc817eaced8db5';
  assert.deepEqual(validate(fixture), { telegramId: 4503599627370495n, firstName: 'Altoha', username: 'altoha', lastName: null, photoUrl: null, languageCode: null });
});

test('valid unicode and URL encoding preserve Telegram identity', () => {
  const user = { id: 123, first_name: 'Алтоха + & =', last_name: 'Игрок', language_code: 'ru', photo_url: 'https://example.com/a?b=c&d=e' };
  const result = validate(signed({ user: JSON.stringify(user), start_param: 'party' }));
  assert.equal(result.firstName, user.first_name);
  assert.equal(result.photoUrl, user.photo_url);
  assert.equal(result.username, null);
});

test('invalid hash, tampered identity, signature and wrong bot token fail', () => {
  const data = signed({ signature: 'example-signature' });
  rejected(data.replace(/hash=[a-f0-9]+/, `hash=${'0'.repeat(64)}`));
  rejected(data.replace('Altoha', 'Attacker'));
  rejected(data.replace('example-signature', 'tampered-signature'));
  assert.throws(() => validate(data, 'wrong-test-bot-token'), ApiError);
});

test('auth_date enforces expiry and future clock skew boundaries', () => {
  assert.equal(validate(signed({ auth_date: String(now - 86400) })).telegramId, 4503599627370495n);
  rejected(signed({ auth_date: String(now - 86401) }));
  rejected(signed({ auth_date: String(now + 31) }));
  assert.ok(validate(signed({ auth_date: String(now + 30) })));
  for (const auth_date of ['', '-1', 'NaN', '1700000000.1']) rejected(signed({ auth_date }));
});

test('malformed, ambiguous and missing initData fields fail safely', () => {
  for (const data of ['', 'foo', 'user=%ZZ', 'hash=abc', `${signed()}&user=other`, `${signed()}&hash=duplicate`, `${signed()}&bad=%E0%A4%A`, 'x'.repeat(16385)]) rejected(data);
  for (const user of ['', '{', 'null', '[]', '{}', '{"id":1}', '{"id":1,"first_name":1}', '{"id":1,"first_name":" "}']) rejected(signed({ user }));
  rejected(signed().replace(/&?user=[^&]+/, ''));
});

test('unsafe or nonnumeric Telegram IDs cannot be rounded into another identity', () => {
  for (const id of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '123', null]) rejected(signed({ user: JSON.stringify({ id, first_name: 'Test' }) }));
});
