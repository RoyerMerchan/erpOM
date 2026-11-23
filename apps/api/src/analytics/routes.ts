import { analyticsExportQuery, analyticsQuery, analyticsSectionsFor } from '@max-sport/shared';
import type {
  AnalyticsBlock,
  AnalyticsQuery,
  AnalyticsResponse,
  SessionUser,
} from '@max-sport/shared';
import { Router } from 'express';
import { sessionActor } from '../auth/session.js';
import type { SessionSecurity } from '../auth/session.js';
import type { Database } from '../database.js';
import { exportReport } from '../exports/reports.js';
import { HttpError } from '../http/errors.js';
import { validate } from '../http/validation.js';
import type { Transaction } from '../purchasing/transaction.js';
import { analyticsWindow } from './calendar.js';
import type { AnalyticsWindow } from './calendar.js';
import { cashBlock } from './cash.js';
import { layawaysBlock } from './layaways.js';
import { purchasesBlock } from './purchases.js';
import { returnsBlock } from './returns.js';
import { salesBlock } from './sales.js';
import { stockBlock } from './stock.js';

type Reader = (
  tx: Transaction,
  query: AnalyticsQuery,
  window: AnalyticsWindow,
  actor: SessionUser,
) => Promise<AnalyticsBlock>;
const readers = {
  SALES: salesBlock,
  CASH: cashBlock,
  STOCK: stockBlock,
  PURCHASES: purchasesBlock,
  LAYAWAYS: layawaysBlock,
  RETURNS: returnsBlock,
} satisfies Record<AnalyticsBlock['section'], Reader>;

export async function readAnalytics(
  db: Database,
  query: AnalyticsQuery,
  actor: SessionUser,
): Promise<AnalyticsResponse> {
  const allowed = analyticsSectionsFor(actor.permissions);
  if (query.section && !allowed.includes(query.section))
    throw new HttpError(403, 'PERMISSION_DENIED', 'Tu rol no puede consultar este reporte.');
  const sections = query.section ? [query.section] : allowed;
  return db.$transaction(
    async (tx) => {
      const window = await analyticsWindow(tx, query);
      const results: AnalyticsBlock[] = [];
      for (const section of sections)
        results.push(await readers[section](tx, query, window, actor));
      return { ...window, sections: results };
    },
    { isolationLevel: 'RepeatableRead', timeout: 20_000 },
  );
}

export function createAnalyticsRouter(db: Database, security: SessionSecurity) {
  const router = Router();
  router.get('/', ...security.allow('analytics.read'), async (request, response) => {
    response.json(
      await readAnalytics(db, validate(analyticsQuery, request.query), sessionActor(response)),
    );
  });
  router.get(
    '/export',
    ...security.allow('analytics.read', 'analytics.export'),
    async (request, response) => {
      const { format, ...query } = validate(analyticsExportQuery, request.query);
      const data = await readAnalytics(db, query, sessionActor(response));
      const file = await exportReport(data, format);
      response
        .attachment(
          'reporte-' +
            query.section.toLowerCase() +
            '-' +
            data.window.endDate +
            '.' +
            file.extension,
        )
        .type(file.contentType)
        .send(file.body);
    },
  );
  return router;
}
