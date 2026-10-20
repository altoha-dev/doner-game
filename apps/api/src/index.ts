import { attachMultiplayer } from './multiplayer/socket.js';
import { buildApp } from './app.js';
import { ConfigurationError, loadApiEnvironment, parseConfig } from './config.js';
import { createDatabase } from './db.js';
import { createPlayerStore } from './players.js';

async function main(): Promise<void> {
  loadApiEnvironment();
  const config = parseConfig(process.env);
  const db = createDatabase(config.databaseUrl);
  const players = createPlayerStore(db);
  const app = await buildApp(config, players);
  app.addHook('onClose', async () => { await db.$disconnect(); });
  let stopping = false;
  const shutdown = (): void => {
    if (stopping) return;
    stopping = true;
    void app.close().catch(() => {
      console.error('Не удалось корректно завершить DONER GAME API.');
      process.exitCode = 1;
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  try {
    // Fail early if PostgreSQL is unavailable. /health is a simple liveness check.
    await db.$connect();
    await attachMultiplayer(app, config, players, db);
    if (stopping) return;
    await app.listen({ host: '0.0.0.0', port: config.port });
    app.log.info(`DONER GAME API started on http://localhost:${config.port}`);
  } catch (error) {
    await app.close();
    process.off('SIGINT', shutdown);
    process.off('SIGTERM', shutdown);
    if (!stopping) throw error;
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof ConfigurationError ? error.message : 'Не удалось запустить DONER GAME API. Проверьте PostgreSQL и конфигурацию.');
  process.exitCode = 1;
});
