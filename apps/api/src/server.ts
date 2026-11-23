import pino from 'pino';
import { createApp } from './app.js';
import { loadProjectEnv, parseRuntimeConfig } from './config.js';
import { createDatabase } from './database.js';

loadProjectEnv();
const config = parseRuntimeConfig(process.env);
const logger = pino({ level: config.LOG_LEVEL });
const database = createDatabase(config.DATABASE_URL);

const server = createApp(database, config, logger).listen(config.API_PORT, config.API_HOST, () => {
  logger.info({ host: config.API_HOST, port: config.API_PORT }, 'API disponible');
});

server.on('error', (error: NodeJS.ErrnoException) => {
  logger.error({ code: error.code }, 'No se pudo iniciar la API');
  process.exitCode = 1;
});

function stop() {
  server.close(async (error) => {
    if (error) process.exitCode = 1;
    await database.$disconnect();
  });
}

process.once('SIGINT', stop);
process.once('SIGTERM', stop);
