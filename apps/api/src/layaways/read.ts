import type { LayawayDetail, SessionUser, layawayQuery } from '@max-sport/shared';
import type { z } from 'zod';
import type { Database } from '../database.js';
import type { Layaway, Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../http/errors.js';
import { buildPage, insensitive, pageArgs } from '../master-data/catalog.js';
import { decimal } from '../purchasing/money.js';

export function layawayScope(actor: SessionUser) {
  return actor.permissions.includes('layaways.read.all') ? {} : { sellerId: actor.id };
}

export const activeStatuses = ['ACTIVE', 'PAID'] as const;
export const holdsStock = (status: Layaway['status']) => status === 'ACTIVE' || status === 'PAID';
export const layawayMissing = () =>
  new HttpError(404, 'LAYAWAY_NOT_FOUND', 'No se encontró el apartado.');

function summary(row: Layaway) {
  return {
    id: row.id,
    number: 'A-' + row.number.toString().padStart(6, '0'),
    status: row.status,
    customerName: row.customerName,
    sellerName: row.sellerName,
    overdue: holdsStock(row.status) && !!row.expiresAt && row.expiresAt <= new Date(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    totalUsd: row.totalUsd.toFixed(2),
    paidUsd: row.paidUsd.toFixed(2),
    balanceUsd: holdsStock(row.status) ? row.totalUsd.sub(row.paidUsd).toFixed(2) : '0.00',
  };
}

export async function layawayPage(
  db: Database,
  query: z.output<typeof layawayQuery>,
  actor: SessionUser,
) {
  const now = new Date();
  const digits = /^(?:A-)?(\d{1,18})$/i.exec(query.q)?.[1];
  const where: Prisma.LayawayWhereInput = {
    ...layawayScope(actor),
    ...(query.status ? { status: query.status } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.overdue
      ? { AND: [{ status: { in: [...activeStatuses] }, expiresAt: { lte: now } }] }
      : {}),
    ...(query.q
      ? {
          OR: [
            ...(digits ? [{ number: BigInt(digits) }] : []),
            { customerName: insensitive(query.q) },
            { sellerName: insensitive(query.q) },
            {
              items: {
                some: { OR: [{ modelName: insensitive(query.q) }, { sku: insensitive(query.q) }] },
              },
            },
          ],
        }
      : {}),
  };
  const page = await buildPage(
    db.layaway.findMany({
      where,
      ...pageArgs(query),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
    db.layaway.count({ where }),
  );
  return { total: page.total, items: page.items.map(summary) };
}

export async function layawayDetail(
  db: Database,
  id: string,
  actor: SessionUser,
): Promise<LayawayDetail> {
  const row = await db.layaway.findFirst({
    where: { id, ...layawayScope(actor) },
    include: {
      items: { orderBy: { position: 'asc' } },
      actions: {
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
        include: { payments: { orderBy: { position: 'asc' } } },
      },
      sale: { select: { id: true } },
    },
  });
  if (!row) throw layawayMissing();
  let refunded = decimal(0);
  const actions = row.actions.map((action) => ({
    id: action.id,
    occurredAt: action.occurredAt.toISOString(),
    kind: action.kind,
    actorName: action.actorName,
    reason: action.reason,
    payments: action.payments.map((payment) => {
      if (payment.kind === 'REFUND') refunded = refunded.add(payment.amountUsd);
      return {
        id: payment.id,
        kind: payment.kind,
        accountId: payment.accountId,
        accountName: payment.accountName,
        currencyCode: payment.currencyCode,
        unitsPerUsd: payment.unitsPerUsd.toFixed(),
        amountOriginal: payment.amountOriginal.toFixed(),
        amountUsd: payment.amountUsd.toFixed(2),
        reference: payment.reference,
      };
    }),
  }));
  return {
    ...summary(row),
    notes: row.notes,
    refundPolicy: row.refundPolicy,
    saleId: row.sale?.id ?? null,
    refundedUsd: refunded.toFixed(2),
    retainedUsd:
      row.status === 'CANCELLED' || row.status === 'EXPIRED'
        ? row.paidUsd.sub(refunded).toFixed(2)
        : '0.00',
    items: row.items.map(
      ({
        id,
        brandName,
        modelName,
        sku,
        size,
        color,
        variantId,
        quantity,
        unitPriceUsd,
        totalUsd,
      }) => ({
        id,
        brandName,
        modelName,
        sku,
        size,
        color,
        variantId,
        quantity,
        unitPriceUsd: unitPriceUsd.toFixed(2),
        totalUsd: totalUsd.toFixed(2),
      }),
    ),
    actions,
  };
}
