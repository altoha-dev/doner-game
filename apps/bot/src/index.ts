import { AbortController } from 'abort-controller';
import { createBot } from './bot.js';
import { loadConfig } from './config.js';
import { describeError } from './errors.js';

async function main(): Promise<void> {
  const { token, username } = loadConfig();
  const bot = createBot(token);
  const startupAbort = new AbortController();
  let stopping = false;

  const shutdown = (): void => {
    if (stopping) return;
    stopping = true;
    console.info('DONER GAME BOT stopping');
    startupAbort.abort();

    if (bot.isRunning()) {
      void bot.stop().catch((error: unknown) => {
        console.error(describeError(error));
        process.exitCode = 1;
      });
    }
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  try {
    // Initialize first so a signal received during startup cannot start polling later.
    await bot.init(startupAbort.signal);
    if (stopping) return;

    if (bot.botInfo.username.toLowerCase() !== username.toLowerCase()) {
      console.warn('BOT_USERNAME не совпадает с username бота в Telegram. Проверьте apps/bot/.env.');
    }

    await bot.api.setMyCommands(
      [
        { command: 'start', description: 'Главное меню' },
        { command: 'game', description: 'Открыть игру' },
        { command: 'help', description: 'Помощь' },
      ],
      undefined,
      startupAbort.signal,
    );
    if (stopping) return;

    await bot.start({
      onStart: () => console.info('DONER GAME BOT started'),
    });
  } catch (error) {
    if (!stopping) throw error;
  } finally {
    process.off('SIGINT', shutdown);
    process.off('SIGTERM', shutdown);
  }
}

void main().catch((error: unknown) => {
  console.error(describeError(error));
  process.exitCode = 1;
});
