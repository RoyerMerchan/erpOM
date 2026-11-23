import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import express, { Router } from 'express';
import helmet from 'helmet';
import pino from 'pino';
import { createAuthRouter } from './auth/routes.js';
import { createSessionSecurity } from './auth/session.js';
import type { RuntimeConfig } from './config.js';
import type { Database } from './database.js';
import { createErrorHandler, HttpError } from './http/errors.js';
import { createInventoryRouter } from './inventory/routes.js';
import { createMasterDataRouter } from './master-data/routes.js';
import { createPurchaseRouter } from './purchasing/routes.js';

export function createApp(
  database: Database,
  config: RuntimeConfig,
  logger = pino({ level: config.LOG_LEVEL }),
) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY_HOPS);

  app.use((request, response, next) => {
    const requestId = randomUUID();
    const started = performance.now();
    response.locals.requestId = requestId;
    response.setHeader('X-Request-Id', requestId);
    response.on('finish', () => {
      logger.info(
        {
          requestId,
          method: request.method,
          route: typeof request.route?.path === 'string' ? request.route.path : undefined,
          status: response.statusCode,
          durationMs: Math.round(performance.now() - started),
        },
        'Solicitud HTTP',
      );
    });
    next();
  });

  app.use(helmet());

  const api = Router();
  api.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });

  api.get('/health/live', (_request, response) => {
    response.json({ status: 'ok' });
  });

  api.get('/health/ready', async (_request, response) => {
    try {
      await database.$queryRaw`SELECT 1`;
    } catch {
      throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'No se pudo conectar a PostgreSQL.');
    }
    response.json({ status: 'ready' });
  });

  const security = createSessionSecurity(database, config);
  api.use(cookieParser());
  api.use('/auth', createAuthRouter(database, security));
  api.use('/inventory', createInventoryRouter(database, security));
  api.use('/purchases', createPurchaseRouter(database, security));
  api.use(createMasterDataRouter(database, security));
  app.use('/api/v1', api);
  app.use((_request, _response, next) => {
    next(new HttpError(404, 'NOT_FOUND', 'La ruta solicitada no existe.'));
  });
  app.use(createErrorHandler(logger));

  return app;
}
