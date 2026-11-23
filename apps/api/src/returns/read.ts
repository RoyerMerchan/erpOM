import type { CorrectionDetail, SessionUser, correctionQuery } from '@max-sport/shared';
import type { z } from 'zod';
import type { Database } from '../database.js';
import type { Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../http/errors.js';
import { buildPage, insensitive, pageArgs } from '../master-data/catalog.js';
import {
  correctionBrief,
  correctionBriefSelect,
  formatSaleReceipt,
  saleScope,
} from '../sales/read.js';

const summarySelect = {
  ...correctionBriefSelect,
  saleId: true,
  actorName: true,
  differenceUsd: true,
  sale: { select: { receiptNumber: true, customerName: true } },
} satisfies Prisma.SaleCorrectionSelect;
type Row = Prisma.SaleCorrectionGetPayload<{ select: typeof summarySelect }>;

function summary(row: Row, actor: SessionUser) {
  return {
    ...correctionBrief(row),
    customerName: row.sale.customerName,
    actorName: row.actorName,
    originalSaleId: row.saleId,
    originalReceipt: formatSaleReceipt(row.sale.receiptNumber),
    differenceUsd: row.differenceUsd.toFixed(2),
    ...(actor.permissions.includes('costs.read')
      ? { restoredCogsUsd: row.restoredCogsUsd.toFixed(2) }
      : {}),
  };
}

export async function correctionPage(
  db: Database,
  input: z.output<typeof correctionQuery>,
  actor: SessionUser,
) {
  const digits = /^(?:(R|V)-)?(\d{1,18})$/i.exec(input.q);
  const number = digits?.[2] ? BigInt(digits[2]) : null;
  const where: Prisma.SaleCorrectionWhereInput = {
    sale: saleScope(actor),
    ...(input.kind ? { kind: input.kind } : {}),
    ...(input.saleId ? { saleId: input.saleId } : {}),
    ...(input.q
      ? {
          OR: [
            ...(number !== null && digits?.[1]?.toUpperCase() !== 'V' ? [{ number }] : []),
            ...(number !== null && digits?.[1]?.toUpperCase() !== 'R'
              ? [{ sale: { receiptNumber: number } }]
              : []),
            { sale: { customerName: insensitive(input.q) } },
          ],
        }
      : {}),
  };
  const page = await buildPage(
    db.saleCorrection.findMany({
      where,
      ...pageArgs(input),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: summarySelect,
    }),
    db.saleCorrection.count({ where }),
  );
  return { total: page.total, items: page.items.map((row) => summary(row, actor)) };
}

export async function correctionDetail(
  db: Database,
  id: string,
  actor: SessionUser,
): Promise<CorrectionDetail> {
  const row = await db.saleCorrection.findFirst({
    where: { id, sale: saleScope(actor) },
    select: {
      ...summarySelect,
      reason: true,
      notes: true,
      replacementTotalUsd: true,
      tenders: { orderBy: { position: 'asc' } },
      items: {
        orderBy: { position: 'asc' },
        include: { saleItem: { select: { sku: true, modelName: true, size: true } } },
      },
    },
  });
  if (!row)
    throw new HttpError(404, 'RETURN_NOT_FOUND', 'No se encontró la devolución o el cambio.');
  const showCosts = actor.permissions.includes('costs.read');
  return {
    ...summary(row, actor),
    reason: row.reason,
    notes: row.notes,
    replacementTotalUsd: row.replacementTotalUsd.toFixed(2),
    items: row.items.map((item) => ({
      saleItemId: item.saleItemId,
      ...item.saleItem,
      condition: item.condition,
      quantity: item.quantity,
      creditUsd: item.creditUsd.toFixed(2),
      ...(showCosts ? { restoredCogsUsd: item.restoredCogsUsd.toFixed(2) } : {}),
    })),
    tenders: row.tenders.map((entry) => ({
      kind: entry.kind,
      accountId: entry.accountId,
      accountName: entry.accountName,
      currencyCode: entry.currencyCode,
      unitsPerUsd: entry.unitsPerUsd.toFixed(),
      amountOriginal: entry.amountOriginal.toFixed(),
      amountUsd: entry.amountUsd.toFixed(2),
      reference: entry.reference,
    })),
  };
}
