import type { FinanceDebtQuery } from '@max-sport/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { insensitive, pageArgs } from '../master-data/catalog.js';
import { decimal } from '../purchasing/money.js';
import type { Transaction } from '../purchasing/transaction.js';

export async function receivables(tx: Transaction, query: FinanceDebtQuery) {
  const match = insensitive(query.q);
  const number = /^A-(\d{1,18})$/i.exec(query.q)?.[1];
  const where: Prisma.LayawayWhereInput = {
    status: 'ACTIVE',
    ...(query.q
      ? { OR: [{ customerName: match }, ...(number ? [{ number: BigInt(number) }] : [])] }
      : {}),
  };
  const rows = await tx.layaway.findMany({
    where,
    ...pageArgs(query),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      number: true,
      customerName: true,
      createdAt: true,
      expiresAt: true,
      totalUsd: true,
      paidUsd: true,
    },
  });
  const totals = await tx.layaway.aggregate({
    where,
    _count: true,
    _sum: { totalUsd: true, paidUsd: true },
  });
  const now = new Date();
  return {
    total: totals._count,
    balanceUsd: decimal(totals._sum.totalUsd ?? 0)
      .sub(totals._sum.paidUsd ?? 0)
      .toFixed(2),
    items: rows.map((row) => ({
      id: row.id,
      number: 'A-' + row.number.toString().padStart(6, '0'),
      partyName: row.customerName,
      occurredAt: row.createdAt.toISOString(),
      dueAt: row.expiresAt?.toISOString() ?? null,
      overdue: !!row.expiresAt && row.expiresAt <= now,
      totalUsd: row.totalUsd.toFixed(2),
      paidUsd: row.paidUsd.toFixed(2),
      balanceUsd: row.totalUsd.sub(row.paidUsd).toFixed(2),
    })),
  };
}

export async function payables(tx: Transaction, query: FinanceDebtQuery) {
  const match = insensitive(query.q);
  const where: Prisma.PurchaseWhereInput = {
    status: 'CONFIRMED',
    paidUsd: { lt: tx.purchase.fields.totalUsd },
    ...(query.q ? { OR: [{ reference: match }, { supplier: { name: match } }] } : {}),
  };
  const rows = await tx.purchase.findMany({
    where,
    ...pageArgs(query),
    orderBy: [{ documentAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      reference: true,
      documentAt: true,
      totalUsd: true,
      paidUsd: true,
      supplier: { select: { name: true } },
    },
  });
  const totals = await tx.purchase.aggregate({
    where,
    _count: true,
    _sum: { totalUsd: true, paidUsd: true },
  });
  return {
    total: totals._count,
    balanceUsd: decimal(totals._sum.totalUsd ?? 0)
      .sub(totals._sum.paidUsd ?? 0)
      .toFixed(2),
    items: rows.map((row) => {
      const amount = decimal(row.totalUsd ?? 0);
      return {
        id: row.id,
        number: row.reference ?? 'Compra ' + row.id.slice(0, 8),
        partyName: row.supplier.name,
        occurredAt: row.documentAt.toISOString(),
        dueAt: null,
        overdue: false,
        totalUsd: amount.toFixed(2),
        paidUsd: row.paidUsd.toFixed(2),
        balanceUsd: amount.sub(row.paidUsd).toFixed(2),
      };
    }),
  };
}
