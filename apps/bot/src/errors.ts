import { GrammyError, HttpError } from 'grammy';
import { ConfigurationError } from './config.js';

export function describeError(error: unknown): string {
  if (error instanceof ConfigurationError) return error.message;

  if (error instanceof GrammyError) {
    if (error.error_code === 401) return 'Telegram отклонил BOT_TOKEN. Проверьте apps/bot/.env.';
    if (error.error_code === 409) return 'Конфликт Telegram: проверьте, не запущен ли второй экземпляр бота или webhook.';
    return `Ошибка Telegram API (код ${error.error_code}).`;
  }

  if (error instanceof HttpError) return 'Не удалось связаться с Telegram. Проверьте сеть.';

  // Raw errors, request URLs and stacks may contain the bot token.
  return 'Непредвиденная ошибка бота. Проверьте конфигурацию и подключение к Telegram.';
}
