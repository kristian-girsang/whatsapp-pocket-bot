require('dotenv').config();

const express = require('express');
const logger = require('./utils/logger');
const { getEnvConfig } = require('./config');
const { createDb, initDatabase } = require('./db/database');
const { createBot } = require('./whatsapp/bot');

async function bootstrap() {
  const config = getEnvConfig();
  const db = createDb(config.dbPath);

  await initDatabase(db);

  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'whatsapp-ai-expense-tracker',
      timestamp: new Date().toISOString(),
    });
  });

  const server = app.listen(config.port, () => {
    logger.info('http_server_started', { port: config.port });
  });

  const bot = createBot({ config, db });
  await bot.initialize();

  const shutdown = async () => {
    logger.info('graceful_shutdown_started');
    try {
      await bot.destroy();
    } catch (error) {
      logger.warn('bot_destroy_failed', { error: error.message });
    }

    await db.close();
    server.close(() => {
      logger.info('server_closed');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((error) => {
  logger.error('bootstrap_failed', { error: error.message });
  process.exit(1);
});
