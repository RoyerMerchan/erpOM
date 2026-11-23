import { currencyCodeSchema } from '@max-sport/shared';
import type { FinanceLedgerQuery, FinanceLedgerRow, FinanceWindow } from '@max-sport/shared';
import type { MoneyMovementKind, Prisma } from '../generated/prisma/client.js';
import { insensitive, pageArgs } from '../master-data/catalog.js';
import type { Transaction } from '../purchasing/transaction.js';

const incoming = new Set<MoneyMovementKind>([
  'SUPPLIER_PAYMENT_REVERSAL',
  'SALE_PAYMENT',
  'LAYAWAY_DEPOSIT',
  'EXCHANGE_PAYMENT',
  'FINANCE_IN',
]);
export const incomingMovementKinds = [...incoming];
export const ledgerDirection = (kind: MoneyMovementKind) => (incoming.has(kind) ? 'IN' : 'OUT');

const include = {
  account: { select: { name: true } },
  actor: { select: { displayName: true } },
  payment: {
    select: {
      purchaseId: true,
      reference: true,
      reversalReason: true,
      purchase: { select: { reference: true } },
    },
  },
  saleTender: { select: { saleId: true, reference: true, accountName: true } },
  layawayPayment: {
    select: { reference: true, accountName: true, action: { select: { layawayId: true } } },
  },
  correctionTender: { select: { correctionId: true, reference: true, accountName: true } },
  financeLine: {
    select: {
      accountName: true,
      entry: {
        select: {
          id: true,
          kind: true,
          description: true,
          reference: true,
          categoryName: true,
          actorName: true,
          reversesId: true,
        },
      },
    },
  },
} satisfies Prisma.MoneyMovementInclude;
type Movement = Prisma.MoneyMovementGetPayload<{ include: typeof include }>;

function source(
  row: Movement,
): Pick<
  FinanceLedgerRow,
  | 'sourceKind'
  | 'sourceId'
  | 'reference'
  | 'description'
  | 'categoryName'
  | 'entryKind'
  | 'reversed'
  | 'accountName'
  | 'actorName'
> {
  const saved = row.financeLine?.entry;
  const defaults = {
    accountName: row.account.name,
    actorName: row.actor.displayName,
    reference: null,
    description: null,
    categoryName: null,
    entryKind: null,
    reversed: false,
  };
  if (saved && row.financeLine)
    return {
      ...defaults,
      sourceKind: 'FINANCE',
      sourceId: saved.id,
      reference: saved.reference,
      accountName: row.financeLine.accountName,
      actorName: saved.actorName,
      description: saved.description,
      categoryName: saved.categoryName,
      entryKind: saved.kind,
      reversed: !!saved.reversesId,
    };
  if (row.payment)
    return {
      ...defaults,
      sourceKind: 'PURCHASE',
      sourceId: row.payment.purchaseId,
      reference: row.payment.reference ?? row.payment.purchase.reference,
      description: row.kind === 'SUPPLIER_PAYMENT_REVERSAL' ? row.payment.reversalReason : null,
      reversed: row.kind === 'SUPPLIER_PAYMENT_REVERSAL',
    };
  if (row.saleTender)
    return {
      ...defaults,
      sourceKind: 'SALE',
      sourceId: row.saleTender.saleId,
      reference: row.saleTender.reference,
      accountName: row.saleTender.accountName,
    };
  if (row.layawayPayment)
    return {
      ...defaults,
      sourceKind: 'LAYAWAY',
      sourceId: row.layawayPayment.action.layawayId,
      reference: row.layawayPayment.reference,
      accountName: row.layawayPayment.accountName,
    };
  if (row.correctionTender)
    return {
      ...defaults,
      sourceKind: 'RETURN',
      sourceId: row.correctionTender.correctionId,
      reference: row.correctionTender.reference,
      accountName: row.correctionTender.accountName,
    };
  throw new Error('Movimiento sin origen financiero.');
}

function kindFilter(filter: FinanceLedgerQuery['filter']): Prisma.MoneyMovementWhereInput {
  switch (filter) {
    case 'COLLECTION':
      return { kind: { in: ['SALE_PAYMENT', 'LAYAWAY_DEPOSIT', 'EXCHANGE_PAYMENT'] } };
    case 'REFUND':
      return { kind: { in: ['SALE_CHANGE', 'LAYAWAY_REFUND', 'SALE_REFUND'] } };
    case 'SUPPLIER':
      return { kind: { in: ['SUPPLIER_PAYMENT', 'SUPPLIER_PAYMENT_REVERSAL'] } };
    case 'MANUAL':
      return { financeLineId: { not: null } };
    case 'EXPENSE':
    case 'OTHER_INCOME':
    case 'TRANSFER':
    case 'ADJUSTMENT':
      return { financeLine: { entry: { kind: filter } } };
    default:
      return {};
  }
}

export async function ledgerPage(
  tx: Transaction,
  query: FinanceLedgerQuery,
  window: FinanceWindow,
) {
  const reference = insensitive(query.q);
  const digits = /^F-(\d{1,18})$/i.exec(query.q)?.[1];
  const where: Prisma.MoneyMovementWhereInput = {
    occurredAt: { gte: new Date(window.from), lt: new Date(window.to) },
    accountId: query.accountId,
    currencyCode: query.currencyCode,
    AND: [
      kindFilter(query.filter),
      ...(query.categoryId ? [{ financeLine: { entry: { categoryId: query.categoryId } } }] : []),
    ],
    ...(query.q
      ? {
          OR: [
            { actor: { displayName: reference } },
            { account: { name: reference } },
            { payment: { OR: [{ reference }, { purchase: { reference } }] } },
            { saleTender: { OR: [{ reference }, { accountName: reference }] } },
            { layawayPayment: { OR: [{ reference }, { accountName: reference }] } },
            { correctionTender: { OR: [{ reference }, { accountName: reference }] } },
            {
              financeLine: {
                OR: [
                  { accountName: reference },
                  {
                    entry: {
                      OR: [
                        { reference },
                        { description: reference },
                        { categoryName: reference },
                        ...(digits ? [{ number: BigInt(digits) }] : []),
                      ],
                    },
                  },
                ],
              },
            },
          ],
        }
      : {}),
  };
  const records = await tx.moneyMovement.findMany({
    where,
    ...pageArgs(query),
    include,
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
  });
  const items: FinanceLedgerRow[] = records.map((row) => ({
    ...source(row),
    id: row.id,
    accountId: row.accountId,
    currencyCode: currencyCodeSchema.parse(row.currencyCode),
    kind: row.kind,
    direction: ledgerDirection(row.kind),
    occurredAt: row.occurredAt.toISOString(),
    unitsPerUsd: row.unitsPerUsd.toFixed(),
    amountOriginal: row.amountOriginal.toFixed(),
    amountUsd: row.amountUsd.toFixed(2),
  }));
  return { items, total: await tx.moneyMovement.count({ where }), window };
}
