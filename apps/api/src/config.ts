import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

export class ConfigurationError extends Error {}

export interface ApiConfig {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  databaseUrl: string;
  botToken: string;
  jwtSecret: string;
  corsOrigins: string[];
  telegramMaxAgeSeconds: number;
  trustProxyHops: number;
}

export function loadApiEnvironment(): void {
  try {
    loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
      throw new ConfigurationError('Не удалось прочитать apps/api/.env.');
    }
  }
}

export function parseConfig(env: NodeJS.ProcessEnv): ApiConfig {
  const required = (name: string): string => {
    const value = env[name]?.trim();
    if (!value) throw new ConfigurationError(`Укажите ${name} в apps/api/.env или environment API.`);
    return value;
  };
  const integer = (name: string, fallback: number, min: number, max: number): number => {
    const value = env[name] === undefined ? fallback : Number(env[name]);
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new ConfigurationError(`Некорректный ${name}. Ожидается целое число от ${min} до ${max}.`);
    }
    return value;
  };

  const nodeEnv = env.NODE_ENV ?? 'development';
  if (!['development', 'production', 'test'].includes(nodeEnv)) {
    throw new ConfigurationError('Некорректный NODE_ENV.');
  }
  const databaseUrl = required('DATABASE_URL');
  try {
    const url = new URL(databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2) throw new Error();
  } catch {
    throw new ConfigurationError('DATABASE_URL должен быть URL PostgreSQL с именем базы данных.');
  }
  const jwtSecret = required('JWT_SECRET');
  if (Buffer.byteLength(jwtSecret) < 32) {
    throw new ConfigurationError('JWT_SECRET должен содержать минимум 32 байта. Используйте secure random generator.');
  }
  const corsOrigins = required('CORS_ORIGINS').split(',').map(value => value.trim());
  try {
    for (const origin of corsOrigins) {
      const url = new URL(origin);
      if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) throw new Error();
    }
  } catch {
    throw new ConfigurationError('CORS_ORIGINS: нужны origins через запятую, без путей, завершающего / и wildcard.');
  }

  return {
    nodeEnv: nodeEnv as ApiConfig['nodeEnv'],
    port: integer('PORT', 3001, 1, 65535),
    databaseUrl,
    botToken: required('BOT_TOKEN'),
    jwtSecret,
    corsOrigins,
    telegramMaxAgeSeconds: integer('TELEGRAM_INIT_DATA_MAX_AGE_SECONDS', 86400, 1, 604800),
    trustProxyHops: integer('TRUST_PROXY_HOPS', 0, 0, 10),
  };
}
