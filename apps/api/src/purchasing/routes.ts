import {
  paymentInput,
  purchaseInput,
  purchaseQuerySchema,
  reasonInput,
  receiveInput,
  updatePurchaseInput,
} from '@max-sport/shared';
import { json, Router } from 'express';
import type { RequestHandler } from 'express';
import { sessionActor } from '../auth/session.js';
import type { SessionSecurity } from '../auth/session.js';
import type { Database } from '../database.js';
import type { Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../http/errors.js';
import { idSchema, validate } from '../http/validation.js';
import { buildPage, insensitive, pageArgs } from '../master-data/catalog.js';
import { previewPurchase } from './money.js';
import { recordPayment, reversePayment } from './payment.js';
import { requireActiveCurrency } from '../master-data/accounts.js';
import { latestQuote, quoteQuery } from './rates.js';
import { purchaseDetail, purchaseSummary, purchaseSummarySelect } from './read.js';
import { lockPurchase, receivePurchase, saveDraft, voidPurchase } from './receipts.js';
import { operation } from './transaction.js';

export function createPurchaseRouter(database: Database, security: SessionSecurity) {
  const router = Router();
  const body = json({ limit: '192kb' });

  function list(payables: boolean): RequestHandler {
    return async (request, response) => {
      const query = validate(purchaseQuerySchema, request.query);
      const actor = sessionActor(response);
      const where: Prisma.PurchaseWhereInput = {
        ...(payables
          ? { status: 'CONFIRMED', totalUsd: { gt: database.purchase.fields.paidUsd } }
          : query.status
            ? { status: query.status }
            : {}),
        ...(query.q
          ? {
              OR: [
                { reference: insensitive(query.q) },
                { supplier: { name: insensitive(query.q) } },
              ],
            }
          : {}),
      };
      const page = await buildPage(
        database.purchase.findMany({
          where,
          ...pageArgs(query),
          orderBy: [{ documentAt: 'desc' }, { id: 'desc' }],
          select: purchaseSummarySelect,
        }),
        database.purchase.count({ where }),
      );
      response.json({
        items: page.items.map((row) => purchaseSummary(row, actor)),
        total: page.total,
      });
    };
  }

  router.get('/', ...security.allow('purchases.read'), list(false));
  router.get('/payables', ...security.allow('purchases.read', 'costs.read'), list(true));
  router.get(
    '/quote',
    ...security.allow('purchases.read', 'rates.read'),
    async (request, response) => {
      const { currencyCode, at } = validate(quoteQuery, request.query);
      const quote =
        currencyCode === 'USD' ? null : await latestQuote(database, currencyCode, new Date(at));
      response.json(
        quote
          ? {
              id: quote.id,
              unitsPerUsd: quote.unitsPerUsd.toFixed(),
              effectiveAt: quote.effectiveAt,
            }
          : null,
      );
    },
  );
  router.get('/:id', ...security.allow('purchases.read'), async (request, response) => {
    response.json(
      await purchaseDetail(database, validate(idSchema, request.params.id), sessionActor(response)),
    );
  });
  router.post(
    '/preview',
    security.requireOrigin,
    ...security.allow('purchases.read', 'costs.read'),
    body,
    async (request, response) => {
      const input = validate(purchaseInput, request.body);
      const { minorUnits } = await requireActiveCurrency(database, input.currencyCode);
      response.json(previewPurchase(input, minorUnits));
    },
  );
  router.post(
    '/',
    security.requireOrigin,
    ...security.allow('purchases.create', 'costs.read'),
    body,
    async (request, response) => {
      const actor = sessionActor(response);
      const id = await saveDraft(database, validate(purchaseInput, request.body), actor.id);
      response.status(201).json(await purchaseDetail(database, id, actor));
    },
  );
  router.put(
    '/:id',
    security.requireOrigin,
    ...security.allow('purchases.update', 'costs.read'),
    body,
    async (request, response) => {
      const id = validate(idSchema, request.params.id);
      const { draft, revision } = validate(updatePurchaseInput, request.body);
      const actor = sessionActor(response);
      await saveDraft(database, draft, actor.id, { id, revision });
      response.json(await purchaseDetail(database, id, actor));
    },
  );
  router.post(
    '/:id/receive',
    security.requireOrigin,
    ...security.allow('purchases.confirm', 'costs.read'),
    body,
    async (request, response) => {
      const id = validate(idSchema, request.params.id);
      const input = validate(receiveInput, request.body);
      const actor = sessionActor(response);
      if (input.initialPayment && !actor.permissions.includes('purchases.pay')) {
        throw new HttpError(403, 'PERMISSION_DENIED', 'Tu rol no puede registrar pagos.');
      }
      await receivePurchase(database, id, input, actor);
      response.json(await purchaseDetail(database, id, actor));
    },
  );
  router.post(
    '/:id/void',
    security.requireOrigin,
    ...security.allow('purchases.void'),
    body,
    async (request, response) => {
      const id = validate(idSchema, request.params.id);
      const { reason } = validate(reasonInput, request.body);
      const actor = sessionActor(response);
      await voidPurchase(database, id, reason, actor.id);
      response.json(await purchaseDetail(database, id, actor));
    },
  );
  router.post(
    '/:id/payments',
    security.requireOrigin,
    ...security.allow('purchases.pay', 'costs.read'),
    body,
    async (request, response) => {
      const id = validate(idSchema, request.params.id);
      const input = validate(paymentInput, request.body);
      const actor = sessionActor(response);
      await operation(database, async (tx) =>
        recordPayment(tx, await lockPurchase(tx, id), input, actor.id),
      );
      response.json(await purchaseDetail(database, id, actor));
    },
  );
  router.post(
    '/:id/payments/:paymentId/reverse',
    security.requireOrigin,
    ...security.allow('purchases.pay', 'costs.read'),
    body,
    async (request, response) => {
      const id = validate(idSchema, request.params.id);
      const paymentId = validate(idSchema, request.params.paymentId);
      const { reason } = validate(reasonInput, request.body);
      const actor = sessionActor(response);
      await operation(database, async (tx) =>
        reversePayment(tx, await lockPurchase(tx, id), paymentId, reason, actor.id),
      );
      response.json(await purchaseDetail(database, id, actor));
    },
  );
  return router;
}
