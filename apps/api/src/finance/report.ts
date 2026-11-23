import { currencyCodeSchema } from '@max-sport/shared';
import type {
  FinanceAccount,
  FinanceReport,
  FinanceReportFilters,
  FinanceWindow,
  SessionUser,
} from '@max-sport/shared';
import type { FinanceEntryKind, MoneyMovementKind } from '../generated/prisma/client.js';
import { Prisma } from '../generated/prisma/client.js';
import { decimal } from '../purchasing/money.js';
import type { Transaction } from '../purchasing/transaction.js';
import { canViewProfit } from '../sales/quotes.js';
import { incomingMovementKinds, ledgerDirection } from './ledger.js';

type Scope = Pick<FinanceReportFilters, 'accountId' | 'currencyCode'>;
type Rollup = {
  kind: MoneyMovementKind;
  entryKind: FinanceEntryKind | null;
  categoryId: string | null;
  categoryName: string | null;
  usd: Prisma.Decimal;
};
type AccountTotals = {
  id: string;
  name: string;
  currencyCode: string;
  kind: FinanceAccount['kind'];
  active: boolean;
  openingOriginal: Prisma.Decimal;
  incomingOriginal: Prisma.Decimal;
  outgoingOriginal: Prisma.Decimal;
  openingUsd: Prisma.Decimal;
  incomingUsd: Prisma.Decimal;
  outgoingUsd: Prisma.Decimal;
};
const incomingSql = Prisma.sql`m.kind::text IN (${Prisma.join(incomingMovementKinds)})`;

async function cashTotals(tx: Transaction, window: FinanceWindow, scope: Scope): Promise<Rollup[]> {
  return tx.$queryRaw<Rollup[]>`
    SELECT m.kind::text AS "kind", e.kind::text AS "entryKind",
      c.id AS "categoryId", c.name AS "categoryName", SUM(m.amount_usd) AS "usd"
    FROM money_movements m
    LEFT JOIN finance_lines line ON line.id = m.finance_line_id
    LEFT JOIN finance_entries e ON e.id = line.entry_id
    LEFT JOIN finance_categories c ON c.id = e.category_id
    WHERE m.occurred_at >= ${new Date(window.from)} AND m.occurred_at < ${new Date(window.to)}
      ${scope.accountId ? Prisma.sql`AND m.account_id = ${scope.accountId}::uuid` : Prisma.empty}
      ${scope.currencyCode ? Prisma.sql`AND m.currency_code = ${scope.currencyCode}` : Prisma.empty}
    GROUP BY m.kind, e.kind, c.id, c.name
  `;
}

export async function balances(
  tx: Transaction,
  window: FinanceWindow,
  scope: Scope,
): Promise<FinanceAccount[]> {
  const start = new Date(window.from);
  const end = new Date(window.to);
  const rows = await tx.$queryRaw<AccountTotals[]>`
    SELECT a.id, a.name, a.currency_code AS "currencyCode", a.kind::text AS "kind", a.active,
      COALESCE(SUM(CASE WHEN ${incomingSql} THEN m.amount_original ELSE -m.amount_original END)
        FILTER (WHERE m.occurred_at < ${start}), 0) AS "openingOriginal",
      COALESCE(SUM(m.amount_original) FILTER (WHERE m.occurred_at >= ${start} AND ${incomingSql}), 0) AS "incomingOriginal",
      COALESCE(SUM(m.amount_original) FILTER (WHERE m.occurred_at >= ${start} AND NOT (${incomingSql})), 0) AS "outgoingOriginal",
      COALESCE(SUM(CASE WHEN ${incomingSql} THEN m.amount_usd ELSE -m.amount_usd END)
        FILTER (WHERE m.occurred_at < ${start}), 0) AS "openingUsd",
      COALESCE(SUM(m.amount_usd) FILTER (WHERE m.occurred_at >= ${start} AND ${incomingSql}), 0) AS "incomingUsd",
      COALESCE(SUM(m.amount_usd) FILTER (WHERE m.occurred_at >= ${start} AND NOT (${incomingSql})), 0) AS "outgoingUsd"
    FROM money_accounts a
    LEFT JOIN money_movements m ON m.account_id = a.id AND m.occurred_at < ${end}
    WHERE TRUE
      ${scope.accountId ? Prisma.sql`AND a.id = ${scope.accountId}::uuid` : Prisma.empty}
      ${scope.currencyCode ? Prisma.sql`AND a.currency_code = ${scope.currencyCode}` : Prisma.empty}
    GROUP BY a.id
    ORDER BY a.currency_code, a.name, a.id
  `;
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    currencyCode: currencyCodeSchema.parse(row.currencyCode),
    active: row.active,
    kind: row.kind,
    openingOriginal: row.openingOriginal.toFixed(),
    incomingOriginal: row.incomingOriginal.toFixed(),
    outgoingOriginal: row.outgoingOriginal.toFixed(),
    closingOriginal: decimal(row.openingOriginal)
      .add(row.incomingOriginal)
      .sub(row.outgoingOriginal)
      .toFixed(),
    openingUsd: row.openingUsd.toFixed(2),
    incomingUsd: row.incomingUsd.toFixed(2),
    outgoingUsd: row.outgoingUsd.toFixed(2),
    closingUsd: decimal(row.openingUsd).add(row.incomingUsd).sub(row.outgoingUsd).toFixed(2),
  }));
}

const sum = (rows: Rollup[]) => rows.reduce((total, row) => total.add(row.usd), decimal(0));
const signedSum = (rows: Rollup[], positive: 'IN' | 'OUT' = 'IN') =>
  rows.reduce(
    (total, row) =>
      ledgerDirection(row.kind) === positive ? total.add(row.usd) : total.sub(row.usd),
    decimal(0),
  );
const external = (row: Rollup) => row.entryKind !== 'TRANSFER' && row.entryKind !== 'ADJUSTMENT';
const onlyEntry = (rows: Rollup[], entry: FinanceEntryKind) =>
  rows.filter((row) => row.entryKind === entry);
const onlyKinds = (rows: Rollup[], ...kinds: MoneyMovementKind[]) =>
  rows.filter(({ kind }) => kinds.includes(kind));
const expenses = (rows: Rollup[]) => signedSum(onlyEntry(rows, 'EXPENSE'), 'OUT');

export function cashBreakdown(rows: Rollup[]): FinanceReport['cash'] {
  const sales = sum(onlyKinds(rows, 'SALE_PAYMENT', 'EXCHANGE_PAYMENT'));
  const advances = sum(onlyKinds(rows, 'LAYAWAY_DEPOSIT'));
  const incoming = rows.filter((row) => ledgerDirection(row.kind) === 'IN');
  const outgoing = rows.filter((row) => ledgerDirection(row.kind) === 'OUT');
  const cashIn = sum(incoming.filter(external));
  const cashOut = sum(outgoing.filter(external));
  const totalIn = sum(incoming);
  const totalOut = sum(outgoing);
  return {
    salesCollectedUsd: sales.toFixed(2),
    advancesCollectedUsd: advances.toFixed(2),
    collectedUsd: sales.add(advances).toFixed(2),
    changeUsd: sum(onlyKinds(rows, 'SALE_CHANGE')).toFixed(2),
    refundsUsd: sum(onlyKinds(rows, 'LAYAWAY_REFUND', 'SALE_REFUND')).toFixed(2),
    supplierNetUsd: signedSum(
      onlyKinds(rows, 'SUPPLIER_PAYMENT', 'SUPPLIER_PAYMENT_REVERSAL'),
      'OUT',
    ).toFixed(2),
    expensesUsd: expenses(rows).toFixed(2),
    otherIncomeUsd: signedSum(onlyEntry(rows, 'OTHER_INCOME')).toFixed(2),
    cashInUsd: cashIn.toFixed(2),
    cashOutUsd: cashOut.toFixed(2),
    cashFlowUsd: cashIn.sub(cashOut).toFixed(2),
    totalInUsd: totalIn.toFixed(2),
    totalOutUsd: totalOut.toFixed(2),
    accountNetUsd: totalIn.sub(totalOut).toFixed(2),
    transferNetUsd: signedSum(onlyEntry(rows, 'TRANSFER')).toFixed(2),
    adjustmentsNetUsd: signedSum(onlyEntry(rows, 'ADJUSTMENT')).toFixed(2),
  };
}

function expenseCategories(rows: Rollup[]): FinanceReport['expenseCategories'] {
  const groups = new Map<string, { name: string; rows: Rollup[] }>();
  for (const row of onlyEntry(rows, 'EXPENSE')) {
    if (!row.categoryId || !row.categoryName) continue;
    const group = groups.get(row.categoryId) ?? { name: row.categoryName, rows: [] };
    group.rows.push(row);
    groups.set(row.categoryId, group);
  }
  return Array.from(groups, ([id, group]) => ({
    id,
    name: group.name,
    usd: expenses(group.rows).toFixed(2),
  })).sort((left, right) => left.name.localeCompare(right.name, 'es'));
}

async function recognition(
  tx: Transaction,
  window: FinanceWindow,
  expenseTotal: Prisma.Decimal,
  actor: SessionUser,
): Promise<FinanceReport['recognition']> {
  const date = { gte: new Date(window.from), lt: new Date(window.to) };
  const costs = actor.permissions.includes('costs.read');
  const sales = await tx.sale.aggregate({
    where: { confirmedAt: date },
    _count: true,
    _sum: { subtotalUsd: true, discountUsd: true, totalUsd: true, cogsUsd: true },
  });
  const corrections = await tx.saleCorrection.aggregate({
    where: { createdAt: date },
    _sum: { returnedUsd: true, restoredCogsUsd: true },
  });
  const returned = decimal(corrections._sum.returnedUsd ?? 0);
  const net = decimal(sales._sum.totalUsd ?? 0).sub(returned);
  const recognizedCost = decimal(sales._sum.cogsUsd ?? 0).sub(
    corrections._sum.restoredCogsUsd ?? 0,
  );
  const grossProfit = net.sub(recognizedCost);
  return {
    salesCount: sales._count,
    grossSalesUsd: decimal(sales._sum.subtotalUsd ?? 0).toFixed(2),
    discountsUsd: decimal(sales._sum.discountUsd ?? 0).toFixed(2),
    returnedUsd: returned.toFixed(2),
    netSalesUsd: net.toFixed(2),
    expensesUsd: expenseTotal.toFixed(2),
    ...(costs ? { cogsUsd: recognizedCost.toFixed(2) } : {}),
    ...(canViewProfit(actor)
      ? {
          grossProfitUsd: grossProfit.toFixed(2),
          netProfitUsd: grossProfit.sub(expenseTotal).toFixed(2),
          grossMarginPct: net.gt(0) ? grossProfit.mul(100).div(net).toFixed(2) : null,
        }
      : {}),
  };
}

export async function financeReport(
  tx: Transaction,
  window: FinanceWindow,
  query: FinanceReportFilters,
  actor: SessionUser,
): Promise<FinanceReport> {
  const rows = await cashTotals(tx, window, query);
  const globalRows =
    query.accountId || query.currencyCode ? await cashTotals(tx, window, {}) : rows;
  return {
    window,
    cash: cashBreakdown(rows),
    accounts: await balances(tx, window, query),
    recognition: await recognition(tx, window, expenses(globalRows), actor),
    expenseCategories: expenseCategories(rows),
  };
}
