import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

export class ConfigurationError extends Error {}

export function getBotUsername(): string {
  const username = process.env.BOT_USERNAME?.trim().replace(/^@/, '');

  if (!username || !/^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(username)) {
    throw new ConfigurationError(
      'Укажите BOT_USERNAME из BotFather в apps/bot/.env (username, а не URL).',
    );
  }

  return username;
}

export function loadConfig(): { token: string; username: string } {
  try {
    // Works both from src/ and dist/, regardless of the current directory.
    loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
      throw new ConfigurationError('Не удалось прочитать apps/bot/.env.');
    }
  }

  const token = process.env.BOT_TOKEN?.trim();

  if (!token) {
    throw new ConfigurationError(
      'Не задан BOT_TOKEN. Скопируйте apps/bot/.env.example в apps/bot/.env и заполните его.',
    );
  }

  return { token, username: getBotUsername() };
}
