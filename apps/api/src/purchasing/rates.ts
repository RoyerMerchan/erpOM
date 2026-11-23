import { currencyCodeSchema } from '@max-sport/shared';
import { z } from 'zod';
import { writeAudit } from '../audit/write.js';
import type { Database } from '../database.js';
import type { Transaction } from './transaction.js';

export const quoteQuery = z.object({
  currencyCode: currencyCodeSchema,
  at: z.iso.datetime({ offset: true }),
});

export function latestQuote(db: Database, code: string, at: Date) {
  return db.exchangeRate.findFirst({
    where: {
      currencyCode: code,
      archivedAt: null,
      effectiveAt: { lte: at },
      currency: { active: true },
    },
    orderBy: [{ effectiveAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true, unitsPerUsd: true, effectiveAt: true },
  });
}

export async function captureRate(
  tx: Transaction,
  code: string,
  rate: string,
  at: Date,
  actorId: string,
) {
  if (code === 'USD') return null;
  const existing = await tx.exchangeRate.findFirst({
    where: { currencyCode: code, unitsPerUsd: rate, archivedAt: null, effectiveAt: { lte: at } },
    orderBy: [{ effectiveAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await tx.exchangeRate.create({
    data: { currencyCode: code, unitsPerUsd: rate, effectiveAt: at, createdById: actorId },
    select: { id: true },
  });
  await writeAudit(tx, actorId, {
    action: 'rates.create',
    entity: 'ExchangeRate',
    entityId: created.id,
    after: { currencyCode: code, unitsPerUsd: rate, effectiveAt: at.toISOString() },
  });
  return created.id;
}
