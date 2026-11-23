import {
  listQuerySchema,
  rateInput,
  rateRevisionInput,
  resourcePermission,
  unitRate,
} from '@max-sport/shared';
import { json, Router } from 'express';
import { writeAudit } from '../audit/write.js';
import { sessionActor } from '../auth/session.js';
import type { SessionSecurity } from '../auth/session.js';
import type { Database } from '../database.js';
import type { Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../http/errors.js';
import { idSchema, validate } from '../http/validation.js';
import { requireActiveCurrency } from './accounts.js';
import { buildPage, insensitive, masterNotFound, pageArgs } from './catalog.js';

const select = {
  id: true,
  currencyCode: true,
  unitsPerUsd: true,
  effectiveAt: true,
  createdAt: true,
  createdBy: { select: { displayName: true } },
  archivedAt: true,
  replacesId: true,
} satisfies Prisma.ExchangeRateSelect;
type Rate = Prisma.ExchangeRateGetPayload<{ select: typeof select }>;

function toRate(row: Rate) {
  return { ...row, unitsPerUsd: row.unitsPerUsd.toFixed(), active: row.archivedAt === null };
}

function snapshot(row: Rate): Prisma.InputJsonObject {
  return {
    currencyCode: row.currencyCode,
    unitsPerUsd: row.unitsPerUsd.toFixed(),
    effectiveAt: row.effectiveAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
    replacesId: row.replacesId,
  };
}

function ensureUsd(currencyCode: string, unitsPerUsd: string) {
  if (currencyCode === 'USD' && !unitRate(unitsPerUsd)) {
    throw new HttpError(400, 'INVALID_INPUT', 'Para USD, la tasa debe ser exactamente 1.');
  }
}

export function createRatesRouter(database: Database, security: SessionSecurity) {
  const router = Router();
  const auth = (action: 'read' | 'create' | 'update' | 'archive') =>
    security.allow(resourcePermission('rates', action));
  const body = json({ limit: '16kb' });

  router.get('/', ...auth('read'), async (request, response) => {
    const query = validate(listQuerySchema, request.query);
    const where: Prisma.ExchangeRateWhereInput = {
      ...(query.status === 'active' ? { archivedAt: null } : {}),
      ...(query.status === 'archived' ? { archivedAt: { not: null } } : {}),
      ...(query.currencyCode ? { currencyCode: query.currencyCode } : {}),
      ...(query.q
        ? {
            OR: [
              { currencyCode: insensitive(query.q) },
              { createdBy: { displayName: insensitive(query.q) } },
            ],
          }
        : {}),
    };
    const page = await buildPage(
      database.exchangeRate.findMany({
        where,
        ...pageArgs(query),
        orderBy: [{ effectiveAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        select,
      }),
      database.exchangeRate.count({ where }),
    );
    response.json({ items: page.items.map(toRate), total: page.total });
  });

  router.get('/:id', ...auth('read'), async (request, response) => {
    const rate = await database.exchangeRate.findUnique({
      where: { id: validate(idSchema, request.params.id) },
      select,
    });
    if (!rate) throw masterNotFound();
    response.json(toRate(rate));
  });

  router.post('/', security.requireOrigin, ...auth('create'), body, async (request, response) => {
    const input = validate(rateInput, request.body);
    const actor = sessionActor(response);
    const item = await database.$transaction(
      async (tx) => {
        await requireActiveCurrency(tx, input.currencyCode);
        const created = await tx.exchangeRate.create({
          data: { ...input, effectiveAt: new Date(input.effectiveAt), createdById: actor.id },
          select,
        });
        await writeAudit(tx, actor.id, {
          action: 'rates.create',
          entity: 'ExchangeRate',
          entityId: created.id,
          after: snapshot(created),
        });
        return toRate(created);
      },
      { isolationLevel: 'Serializable' },
    );
    response.status(201).json(item);
  });

  router.put('/:id', security.requireOrigin, ...auth('update'), body, async (request, response) => {
    const id = validate(idSchema, request.params.id);
    const input = validate(rateRevisionInput, request.body);
    const actor = sessionActor(response);
    const item = await database.$transaction(
      async (tx) => {
        const previous = await tx.exchangeRate.findUnique({ where: { id }, select });
        if (!previous) throw masterNotFound();
        if (previous.archivedAt)
          throw new HttpError(409, 'RATE_ARCHIVED', 'Esta versión ya está archivada.');
        ensureUsd(previous.currencyCode, input.unitsPerUsd);
        const archivedAt = new Date();
        await tx.exchangeRate.update({ where: { id }, data: { archivedAt } });
        const replacement = await tx.exchangeRate.create({
          data: {
            unitsPerUsd: input.unitsPerUsd,
            effectiveAt: new Date(input.effectiveAt),
            currencyCode: previous.currencyCode,
            createdById: actor.id,
            replacesId: id,
          },
          select,
        });
        await writeAudit(tx, actor.id, {
          action: 'rates.correct',
          entity: 'ExchangeRate',
          entityId: id,
          before: snapshot(previous),
          after: { ...snapshot(replacement), replacementId: replacement.id },
        });
        return toRate(replacement);
      },
      { isolationLevel: 'Serializable' },
    );
    response.json(item);
  });

  router.delete('/:id', security.requireOrigin, ...auth('archive'), async (request, response) => {
    const id = validate(idSchema, request.params.id);
    const actor = sessionActor(response);
    await database.$transaction(
      async (tx) => {
        const previous = await tx.exchangeRate.findUnique({ where: { id }, select });
        if (!previous) throw masterNotFound();
        if (previous.archivedAt) return;
        const updated = await tx.exchangeRate.update({
          where: { id },
          data: { archivedAt: new Date() },
          select,
        });
        await writeAudit(tx, actor.id, {
          action: 'rates.archive',
          entity: 'ExchangeRate',
          entityId: id,
          before: snapshot(previous),
          after: snapshot(updated),
        });
      },
      { isolationLevel: 'Serializable' },
    );
    response.status(204).end();
  });

  return router;
}
