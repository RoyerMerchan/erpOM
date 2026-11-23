import type { SaleDetail, SaleSummary, SessionUser, saleQuery } from '@max-sport/shared';
import type { z } from 'zod';
import type { Database } from '../database.js';
import type { Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../http/errors.js';
import { buildPage, insensitive } from '../master-data/catalog.js';
import { decimal } from '../purchasing/money.js';
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
  corrections: { select: { returnedUsd: true, restoredCogsUsd: true } },
} satisfies Prisma.SaleSelect;
type RecordSummary = Prisma.SaleGetPayload<{ select: typeof summarySelect }>;

export const correctionBriefSelect = {
  id: true,
  number: true,
  kind: true,
  createdAt: true,
  returnedUsd: true,
  restoredCogsUsd: true,
  replacement: { select: { id: true } },
} satisfies Prisma.SaleCorrectionSelect;

export function correctionBrief(
  row: Prisma.SaleCorrectionGetPayload<{ select: typeof correctionBriefSelect }>,
) {
  return {
    id: row.id,
    kind: row.kind,
    number: 'R-' + row.number.toString().padStart(6, '0'),
    createdAt: row.createdAt.toISOString(),
    returnedUsd: row.returnedUsd.toFixed(2),
    replacementSaleId: row.replacement?.id ?? null,
  };
}

const detailsSelect = {
  ...summarySelect,
  shopName: true,
  notes: true,
  items: { orderBy: { position: 'asc' }, include: { corrections: { select: { quantity: true } } } },
  tenders: { orderBy: { position: 'asc' } },
  discounts: { orderBy: { id: 'asc' } },
  layawayId: true,
  layaway: {
    select: {
      actions: {
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
        select: { payments: { where: { kind: 'DEPOSIT' }, orderBy: { position: 'asc' } } },
      },
    },
  },
  exchangeId: true,
  exchange: {
    select: {
      returnedUsd: true,
      replacementTotalUsd: true,
      tenders: { where: { kind: 'PAYMENT' }, orderBy: { position: 'asc' } },
    },
  },
  corrections: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: correctionBriefSelect },
} satisfies Prisma.SaleSelect;

export function saleScope(actor: SessionUser) {
  return actor.permissions.includes('sales.read.all') ? {} : { sellerId: actor.id };
}

export const formatSaleReceipt = (number: bigint) => 'V-' + number.toString().padStart(6, '0');

function saleSummary(record: RecordSummary, actor: SessionUser): SaleSummary {
  const adjustedTotal = record.corrections.reduce(
    (sum, entry) => sum.sub(entry.returnedUsd),
    decimal(record.totalUsd),
  );
  const adjustedCogs = record.corrections.reduce(
    (sum, entry) => sum.sub(entry.restoredCogsUsd),
    decimal(record.cogsUsd),
  );
  const adjusted = record.corrections.length > 0;
  const costs = actor.permissions.includes('costs.read');
  const profit = canViewProfit(actor);
  return {
    id: record.id,
    receiptNumber: formatSaleReceipt(record.receiptNumber),
    customerName: record.customerName,
    sellerName: record.sellerName,
    confirmedAt: record.confirmedAt.toISOString(),
    pairCount: record.items.reduce((sum, item) => sum + item.quantity, 0),
    subtotalUsd: record.subtotalUsd.toFixed(2),
    discountUsd: record.discountUsd.toFixed(2),
    totalUsd: record.totalUsd.toFixed(2),
    ...(costs ? { cogsUsd: record.cogsUsd.toFixed(2) } : {}),
    ...(profit ? { grossProfitUsd: record.grossProfitUsd.toFixed(2) } : {}),
    ...(adjusted ? { adjustedTotalUsd: adjustedTotal.toFixed(2) } : {}),
    ...(adjusted && costs ? { adjustedCogsUsd: adjustedCogs.toFixed(2) } : {}),
    ...(adjusted && profit
      ? { adjustedProfitUsd: adjustedTotal.sub(adjustedCogs).toFixed(2) }
      : {}),
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
  const currencyCode = query.currencyCode;
  const where: Prisma.SaleWhereInput = {
    AND: [
      saleScope(actor),
      query.sellerId ? { sellerId: query.sellerId } : {},
      ...(currencyCode
        ? [
            {
              OR: [
                { tenders: { some: { currencyCode, kind: 'PAYMENT' as const } } },
                {
                  layaway: {
                    actions: {
                      some: { payments: { some: { currencyCode, kind: 'DEPOSIT' as const } } },
                    },
                  },
                },
                { exchange: { tenders: { some: { currencyCode, kind: 'PAYMENT' as const } } } },
              ],
            },
          ]
        : []),
    ],
    ...(query.customerId ? { customerId: query.customerId } : {}),
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

type Tender = SaleDetail['tenders'][number];
function tenderEntry(
  entry: {
    accountName: string;
    accountId: string;
    currencyCode: string;
    amountOriginal: Prisma.Decimal;
    amountUsd: Prisma.Decimal;
    unitsPerUsd: Prisma.Decimal;
    reference: string | null;
  },
  kind: Tender['kind'],
): Tender {
  return {
    kind,
    accountName: entry.accountName,
    accountId: entry.accountId,
    currencyCode: entry.currencyCode,
    amountOriginal: entry.amountOriginal.toFixed(),
    amountUsd: entry.amountUsd.toFixed(2),
    unitsPerUsd: entry.unitsPerUsd.toFixed(),
    reference: entry.reference,
  };
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
    layawayId: record.layawayId,
    exchangeId: record.exchangeId,
    exchangeCreditUsd: record.exchange
      ? (record.exchange.returnedUsd.lt(record.exchange.replacementTotalUsd)
          ? record.exchange.returnedUsd
          : record.exchange.replacementTotalUsd
        ).toFixed(2)
      : null,
    corrections: record.corrections.map(correctionBrief),
    items: record.items.map((line) => ({
      id: line.id,
      variantId: line.variantId,
      brandName: line.brandName,
      modelName: line.modelName,
      sku: line.sku,
      size: line.size,
      color: line.color,
      quantity: line.quantity,
      returnableQuantity:
        line.quantity - line.corrections.reduce((sum, entry) => sum + entry.quantity, 0),
      unitPriceUsd: line.unitPriceUsd.toFixed(2),
      grossUsd: line.grossUsd.toFixed(2),
      lineDiscountUsd: line.lineDiscountUsd.toFixed(2),
      globalDiscountUsd: line.globalDiscountUsd.toFixed(2),
      netUsd: line.netUsd.toFixed(2),
      ...(showCosts ? { cogsUsd: line.cogsUsd.toFixed(2) } : {}),
    })),
    tenders: [
      ...record.tenders.map((entry) => tenderEntry(entry, entry.kind)),
      ...(record.layaway?.actions.flatMap(({ payments }) =>
        payments.map((entry) => tenderEntry(entry, 'ADVANCE')),
      ) ?? []),
      ...(record.exchange?.tenders.map((entry) => tenderEntry(entry, 'PAYMENT')) ?? []),
    ],
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
