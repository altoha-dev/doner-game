import { createHmac, timingSafeEqual } from 'node:crypto';
import { ApiError } from './errors.js';

export interface VerifiedTelegramUser {
  telegramId: bigint;
  firstName: string;
  lastName: string | null;
  username: string | null;
  photoUrl: string | null;
  languageCode: string | null;
}

function invalidAuth(): never {
  throw new ApiError(401, 'INVALID_TELEGRAM_AUTH', 'Telegram authentication failed. Reopen the Mini App.');
}

export function validateTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds: number,
  nowSeconds = Math.floor(Date.now() / 1000),
): VerifiedTelegramUser {
  if (!initData || initData.length > 16384) invalidAuth();

  // URLSearchParams tolerates malformed escapes, so reject them explicitly first.
  try {
    for (const part of initData.split('&')) {
      if (!part.includes('=')) invalidAuth();
      decodeURIComponent(part.replace(/\+/g, ' '));
    }
  } catch {
    invalidAuth();
  }

  const params = new URLSearchParams(initData);
  const keys = new Set<string>();
  for (const [key] of params) {
    if (!/^[a-zA-Z0-9_]+$/.test(key) || keys.has(key)) invalidAuth();
    keys.add(key);
  }
  const hash = params.get('hash');
  if (!hash || !/^[a-fA-F0-9]{64}$/.test(hash)) invalidAuth();
  params.delete('hash');
  params.sort();

  // Official BOT_TOKEN-based HMAC algorithm. Only hash is excluded here;
  // signature is excluded only in Telegram's separate third-party Ed25519 flow.
  // https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
  const dataCheckString = [...params].map(([key, value]) => `${key}=${value}`).join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest();
  if (!timingSafeEqual(expectedHash, Buffer.from(hash, 'hex'))) invalidAuth();

  const rawDate = params.get('auth_date');
  if (!rawDate || !/^\d{1,12}$/.test(rawDate)) invalidAuth();
  const authDate = Number(rawDate);
  if (authDate > nowSeconds + 30 || nowSeconds - authDate > maxAgeSeconds) invalidAuth();

  // Parse and trust identity fields only AFTER signature and freshness checks.
  let user: unknown;
  try {
    user = JSON.parse(params.get('user') ?? 'null');
  } catch {
    invalidAuth();
  }
  if (!user || typeof user !== 'object' || Array.isArray(user)) invalidAuth();
  const fields = user as Record<string, unknown>;
  // Telegram IDs have at most 52 significant bits. Reject unsafe numbers before
  // conversion to BigInt rather than silently persisting a rounded identity.
  if (typeof fields.id !== 'number' || !Number.isSafeInteger(fields.id) || fields.id <= 0) invalidAuth();
  if (typeof fields.first_name !== 'string' || !fields.first_name.trim() || fields.first_name.length > 256) invalidAuth();

  const optionalString = (key: string, maxLength: number): string | null => {
    const value = fields[key];
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string' || value.length > maxLength) invalidAuth();
    return value || null;
  };

  return {
    telegramId: BigInt(fields.id),
    firstName: fields.first_name,
    lastName: optionalString('last_name', 256),
    username: optionalString('username', 64),
    photoUrl: optionalString('photo_url', 2048),
    languageCode: optionalString('language_code', 32),
  };
}
