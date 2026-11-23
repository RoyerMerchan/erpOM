import type { SaleDetail, SaleSummary, SessionUser, saleQuery } from '@max-sport/shared';
import type { z } from 'zod';
import type { Database } from '../database.js';
import type { Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../http/errors.js';
import { buildPage, insensitive } from '../master-data/catalog.js';
import { canViewProfit } from './quotes.js';

const summarySelect = {
  id: true,
  receiptNumber: true,
  customerName: true,
  sellerName: true,
  confirmedAt: true,
  subtotalUsd: true,
  discountUsd: true,
  totalUsd: true,
  cogsUsd: true,
  grossProfitUsd: true,
  items: { select: { quantity: true } },
} satisfies Prisma.SaleSelect;
type RecordSummary = Prisma.SaleGetPayload<{ select: typeof summarySelect }>;

const detailsSelect = {
  ...summarySelect,
  shopName: true,
  notes: true,
  items: { orderBy: { position: 'asc' } },
  tenders: { orderBy: { position: 'asc' } },
  discounts: { orderBy: { id: 'asc' } },
} satisfies Prisma.SaleSelect;

function saleScope(actor: SessionUser) {
  return actor.permissions.includes('sales.read.all') ? {} : { sellerId: actor.id };
}

function saleSummary(record: RecordSummary, actor: SessionUser): SaleSummary {
  return {
    id: record.id,
    receiptNumber: 'V-' + record.receiptNumber.toString().padStart(6, '0'),
    customerName: record.customerName,
    sellerName: record.sellerName,
    confirmedAt: record.confirmedAt.toISOString(),
    pairCount: record.items.reduce((sum, item) => sum + item.quantity, 0),
    subtotalUsd: record.subtotalUsd.toFixed(2),
    discountUsd: record.discountUsd.toFixed(2),
    totalUsd: record.totalUsd.toFixed(2),
    ...(actor.permissions.includes('costs.read') ? { cogsUsd: record.cogsUsd.toFixed(2) } : {}),
    ...(canViewProfit(actor) ? { grossProfitUsd: record.grossProfitUsd.toFixed(2) } : {}),
  };
}

function referenceNumber(q: string) {
  const digits = /^(?:V-)?(\d{1,19})$/i.exec(q)?.[1];
  const number = digits ? BigInt(digits) : 0n;
  return number > 0n && number <= 9_223_372_036_854_775_807n ? number : undefined;
}

export async function salesPage(
  db: Database,
  query: z.output<typeof saleQuery>,
  actor: SessionUser,
) {
  const receiptNumber = referenceNumber(query.q);
  const where: Prisma.SaleWhereInput = {
    AND: [saleScope(actor), query.sellerId ? { sellerId: query.sellerId } : {}],
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.currencyCode
      ? { tenders: { some: { currencyCode: query.currencyCode, kind: 'PAYMENT' } } }
      : {}),
    ...(query.from || query.to
      ? {
          confirmedAt: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lt: new Date(query.to) } : {}),
          },
        }
      : {}),
    ...(query.q
      ? {
          OR: [
            ...(receiptNumber ? [{ receiptNumber }] : []),
            { customerName: insensitive(query.q) },
            { sellerName: insensitive(query.q) },
            {
              items: {
                some: { OR: [{ sku: insensitive(query.q) }, { modelName: insensitive(query.q) }] },
              },
            },
          ],
        }
      : {}),
  };
  const page = await buildPage(
    db.sale.findMany({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: [{ confirmedAt: 'desc' }, { id: 'desc' }],
      select: summarySelect,
    }),
    db.sale.count({ where }),
  );
  return { items: page.items.map((record) => saleSummary(record, actor)), total: page.total };
}

export async function saleDetail(
  db: Database,
  id: string,
  actor: SessionUser,
): Promise<SaleDetail> {
  const record = await db.sale.findFirst({
    where: { id, ...saleScope(actor) },
    select: detailsSelect,
  });
  if (!record) throw new HttpError(404, 'SALE_NOT_FOUND', 'No se encontró la venta.');
  const showCosts = actor.permissions.includes('costs.read');
  return {
    ...saleSummary(record, actor),
    notes: record.notes,
    shopName: record.shopName,
    items: record.items.map((line) => ({
      id: line.id,
      variantId: line.variantId,
      brandName: line.brandName,
      modelName: line.modelName,
      sku: line.sku,
      size: line.size,
      color: line.color,
      quantity: line.quantity,
      unitPriceUsd: line.unitPriceUsd.toFixed(2),
      grossUsd: line.grossUsd.toFixed(2),
      lineDiscountUsd: line.lineDiscountUsd.toFixed(2),
      globalDiscountUsd: line.globalDiscountUsd.toFixed(2),
      netUsd: line.netUsd.toFixed(2),
      ...(showCosts ? { cogsUsd: line.cogsUsd.toFixed(2) } : {}),
    })),
    tenders: record.tenders.map((entry) => ({
      kind: entry.kind,
      accountName: entry.accountName,
      accountId: entry.accountId,
      currencyCode: entry.currencyCode,
      amountOriginal: entry.amountOriginal.toFixed(),
      amountUsd: entry.amountUsd.toFixed(2),
      unitsPerUsd: entry.unitsPerUsd.toFixed(),
      reference: entry.reference,
    })),
    discounts: record.discounts.map((discount) => ({
      saleItemId: discount.saleItemId,
      kind: discount.kind,
      currencyCode: discount.currencyCode,
      amountOriginal: discount.amountOriginal?.toFixed() ?? null,
      unitsPerUsd: discount.unitsPerUsd?.toFixed() ?? null,
      percentage: discount.percentage?.toFixed() ?? null,
      amountUsd: discount.amountUsd.toFixed(2),
    })),
  };
}
