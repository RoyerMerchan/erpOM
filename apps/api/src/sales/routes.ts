import {
  confirmSaleInput,
  currencyCodeSchema,
  listQuerySchema,
  saleInput,
  saleQuery,
} from '@max-sport/shared';
import { json, Router } from 'express';
import { sessionActor, visibleUser } from '../auth/session.js';
import type { SessionSecurity } from '../auth/session.js';
import type { Database } from '../database.js';
import { idSchema, validate } from '../http/validation.js';
import { buildPage, insensitive, pageArgs } from '../master-data/catalog.js';
import { latestQuote } from '../purchasing/rates.js';
import { confirmSale, salesOperatorFilter } from './checkout.js';
import { visiblePreview } from './quotes.js';
import { saleDetail, salesPage } from './read.js';

export function createSalesRouter(database: Database, security: SessionSecurity) {
  const router = Router();
  const body = json({ limit: '96kb' });

  router.get('/', ...security.allow('sales.read'), async (request, response) => {
    response.json(
      await salesPage(database, validate(saleQuery, request.query), sessionActor(response)),
    );
  });
  router.get(
    '/operators',
    ...security.allow('sales.read', 'sales.read.all'),
    async (request, response) => {
      const query = validate(listQuerySchema, request.query);
      const where = {
        ...salesOperatorFilter,
        ...visibleUser(sessionActor(response).id),
        ...(query.q ? { displayName: insensitive(query.q) } : {}),
      };
      response.json(
        await buildPage(
          database.user.findMany({
            where,
            ...pageArgs(query),
            orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
            select: { id: true, displayName: true },
          }),
          database.user.count({ where }),
        ),
      );
    },
  );
  router.get(
    '/rates/:currencyCode',
    ...security.allow('sales.create', 'rates.read'),
    async (request, response) => {
      const code = validate(currencyCodeSchema, request.params.currencyCode);
      const entry = code === 'USD' ? null : await latestQuote(database, code, new Date());
      response.json(
        entry ? { unitsPerUsd: entry.unitsPerUsd.toFixed(), effectiveAt: entry.effectiveAt } : null,
      );
    },
  );
  router.get('/:id', ...security.allow('sales.read'), async (request, response) => {
    response.json(
      await saleDetail(database, validate(idSchema, request.params.id), sessionActor(response)),
    );
  });
  router.post(
    '/preview',
    security.requireOrigin,
    ...security.allow('sales.create'),
    body,
    async (request, response) => {
      const input = validate(saleInput, request.body);
      const actor = sessionActor(response);
      const preview = await database.$transaction((tx) => visiblePreview(tx, input, actor), {
        isolationLevel: 'RepeatableRead',
      });
      response.json(preview);
    },
  );
  router.post(
    '/',
    security.requireOrigin,
    ...security.allow('sales.create', 'sales.read'),
    body,
    async (request, response) => {
      const actor = sessionActor(response);
      const id = await confirmSale(database, validate(confirmSaleInput, request.body), actor);
      response.status(201).json(await saleDetail(database, id, actor));
    },
  );
  return router;
}
