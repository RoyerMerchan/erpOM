import { purchaseInput } from '@max-sport/shared';
import type {
  PurchaseDetail,
  PurchaseInput,
  PurchaseSummary,
  SessionUser,
} from '@max-sport/shared';
import type { Database } from '../database.js';
import type { Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../http/errors.js';
import { decimal, previewPurchase } from './money.js';

export const purchaseSummarySelect = {
  id: true,
  documentAt: true,
  reference: true,
  currencyCode: true,
  status: true,
  receivedAt: true,
  minorUnits: true,
  pairCount: true,
  supplier: { select: { name: true } },
  subtotalOriginal: true,
  freightOriginal: true,
  totalOriginal: true,
  totalUsd: true,
  paidUsd: true,
  unitsPerUsd: true,
  exchangeRateId: true,
} satisfies Prisma.PurchaseSelect;
const detailsSelect = {
  ...purchaseSummarySelect,
  notes: true,
  voidReason: true,
  draftData: true,
  revision: true,
  items: { orderBy: { position: 'asc' } },
  payments: {
    orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
    include: { account: { select: { name: true } } },
  },
} satisfies Prisma.PurchaseSelect;

export function purchaseSummary(
  row: Prisma.PurchaseGetPayload<{ select: typeof purchaseSummarySelect }>,
  actor: SessionUser,
): PurchaseSummary {
  const balance =
    row.status === 'CONFIRMED' && row.totalUsd !== null
      ? decimal(row.totalUsd).sub(row.paidUsd)
      : null;
  return {
    id: row.id,
    documentAt: row.documentAt.toISOString(),
    reference: row.reference,
    currencyCode: row.currencyCode,
    supplierName: row.supplier.name,
    status: row.status,
    pairCount: row.pairCount,
    receivedAt: row.receivedAt?.toISOString() ?? null,
    paymentStatus:
      balance === null
        ? null
        : balance.isZero()
          ? 'PAID'
          : row.paidUsd.isZero()
            ? 'PENDING'
            : 'PARTIAL',
    ...(actor.permissions.includes('costs.read')
      ? {
          financial: {
            pairCount: row.pairCount,
            subtotalOriginal: row.subtotalOriginal.toFixed(row.minorUnits),
            freightOriginal: row.freightOriginal.toFixed(row.minorUnits),
            totalOriginal: row.totalOriginal.toFixed(row.minorUnits),
            totalUsd: row.totalUsd?.toFixed(2) ?? null,
            unitsPerUsd: row.unitsPerUsd?.toFixed() ?? null,
            exchangeRateId: row.exchangeRateId,
            paidUsd: row.paidUsd.toFixed(2),
            balanceUsd: balance?.toFixed(2) ?? null,
            balanceOriginal:
              balance && row.paidUsd.isZero() ? row.totalOriginal.toFixed(row.minorUnits) : null,
          },
        }
      : {}),
  };
}

async function draftModelLabels(db: Database, draft: PurchaseInput) {
  const modelIds = draft.groups.flatMap(({ model }) =>
    model.mode === 'existing' ? [model.id] : [],
  );
  const brandIds = draft.groups.flatMap(({ model }) =>
    model.mode === 'new' && model.brand.mode === 'existing' ? [model.brand.id] : [],
  );
  const [models, brands] = await Promise.all([
    db.productModel.findMany({
      where: { id: { in: modelIds } },
      select: { id: true, name: true, brand: { select: { name: true } } },
    }),
    db.brand.findMany({ where: { id: { in: brandIds } }, select: { id: true, name: true } }),
  ]);
  const modelNames = new Map(models.map((item) => [item.id, item.brand.name + ' · ' + item.name]));
  const brandNames = new Map(brands.map((item) => [item.id, item.name]));
  return draft.groups.map(({ model, color }) => {
    const label =
      model.mode === 'existing'
        ? (modelNames.get(model.id) ?? 'Modelo no disponible')
        : [
            model.brand.mode === 'new' ? model.brand.name : brandNames.get(model.brand.id),
            model.name,
          ]
            .filter(Boolean)
            .join(' · ');
    return color ? label + ' · ' + color : label;
  });
}

export async function purchaseDetail(
  db: Database,
  id: string,
  actor: SessionUser,
): Promise<PurchaseDetail> {
  const row = await db.purchase.findUnique({ where: { id }, select: detailsSelect });
  if (!row) throw new HttpError(404, 'PURCHASE_NOT_FOUND', 'La compra no existe.');
  const summary = purchaseSummary(row, actor);
  const canReadCosts = Boolean(summary.financial);
  const activePayments = row.payments.filter(({ reversedAt }) => !reversedAt);
  if (summary.financial && row.status === 'CONFIRMED' && activePayments.length) {
    const close = activePayments.every(
      (payment) =>
        payment.currencyCode === row.currencyCode &&
        row.unitsPerUsd !== null &&
        payment.unitsPerUsd.eq(row.unitsPerUsd),
    );
    if (close) {
      const amount = activePayments.reduce(
        (remaining, payment) => remaining.sub(payment.amountOriginal),
        decimal(row.totalOriginal),
      );
      if (amount.gte(0)) {
        const zeroUsd = summary.financial.balanceUsd === '0.00';
        if (zeroUsd === amount.isZero())
          summary.financial.balanceOriginal = amount.toFixed(row.minorUnits);
      }
    }
  }
  const draft =
    canReadCosts && row.status === 'DRAFT' ? purchaseInput.parse(row.draftData) : undefined;
  return {
    ...summary,
    revision: row.revision,
    notes: row.notes,
    voidReason: row.voidReason,
    ...(draft
      ? {
          draft,
          draftModelLabels: await draftModelLabels(db, draft),
          preview: previewPurchase(draft, row.minorUnits),
        }
      : {}),
    items: row.items.map((item) => ({
      id: item.id,
      variantId: item.variantId,
      modelName: item.modelName,
      brandName: item.brandName,
      size: item.size,
      sku: item.sku,
      color: item.color,
      quantity: item.quantity,
      salePriceUsd: item.salePriceUsd.toFixed(2),
      ...(canReadCosts
        ? {
            costs: {
              unitCostOriginal: item.unitCostOriginal.toFixed(row.minorUnits),
              freightOriginal: item.freightOriginal.toFixed(row.minorUnits),
              totalOriginal: item.totalOriginal.toFixed(row.minorUnits),
              totalUsd: item.totalUsd.toFixed(2),
              unitCostUsd: item.unitCostUsd.toFixed(),
            },
          }
        : {}),
    })),
    ...(canReadCosts
      ? {
          payments: row.payments.map((payment) => ({
            id: payment.id,
            accountName: payment.account.name,
            currencyCode: payment.currencyCode,
            amountOriginal: payment.amountOriginal.toFixed(),
            unitsPerUsd: payment.unitsPerUsd.toFixed(),
            amountUsd: payment.amountUsd.toFixed(2),
            paidAt: payment.paidAt.toISOString(),
            reference: payment.reference,
            reversedAt: payment.reversedAt?.toISOString() ?? null,
            reversalReason: payment.reversalReason,
          })),
        }
      : {}),
  };
}
