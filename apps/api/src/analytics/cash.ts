import type { AnalyticsBlock, AnalyticsQuery, FinanceLedgerRow } from '@max-sport/shared';
import { financeEntryLabels, financeLedgerLabels } from '@max-sport/shared';
import { incomingMovementKinds, ledgerPage } from '../finance/ledger.js';
import { cashBreakdown, cashTotals, expenseCategories } from '../finance/report.js';
import { Prisma } from '../generated/prisma/client.js';
import type { Transaction } from '../purchasing/transaction.js';
import { fillBuckets } from './calendar.js';
import type { AnalyticsWindow } from './calendar.js';
import { cell, metric, row, target, usd } from './presentation.js';

const link = {
  PURCHASE: 'purchase-detail',
  SALE: 'sale-detail',
  LAYAWAY: 'layaway-detail',
  RETURN: 'return-detail',
  FINANCE: 'finance-entry',
} as const;
const accountLabels: Record<string, string> = {
  CASH: 'Efectivo',
  BANK: 'Banco',
  MOBILE: 'Pago móvil',
  CRYPTO: 'Billetera',
  OTHER: 'Otro',
};
const incoming = Prisma.sql`m.kind::text IN (${Prisma.join(incomingMovementKinds)})`;
const collected = Prisma.sql`m.kind::text IN ('SALE_PAYMENT','EXCHANGE_PAYMENT','LAYAWAY_DEPOSIT')`;
const operating = Prisma.sql`COALESCE(e.kind::text, '') NOT IN ('TRANSFER', 'ADJUSTMENT')`;

function scopeSql(query: AnalyticsQuery, from: string, to: string) {
  return Prisma.sql`m.occurred_at >= ${new Date(from)} AND m.occurred_at < ${new Date(to)}
    ${query.accountId ? Prisma.sql`AND m.account_id = ${query.accountId}::uuid` : Prisma.empty}
    ${query.currencyCode ? Prisma.sql`AND m.currency_code = ${query.currencyCode}` : Prisma.empty}
    ${query.method ? Prisma.sql`AND a.kind::text = ${query.method}` : Prisma.empty}`;
}
const fromCash = Prisma.sql`
  FROM money_movements m JOIN money_accounts a ON a.id = m.account_id
  LEFT JOIN finance_lines l ON l.id = m.finance_line_id LEFT JOIN finance_entries e ON e.id = l.entry_id
`;

function entryName(item: FinanceLedgerRow) {
  return item.entryKind
    ? (item.reversed ? 'Reverso · ' : '') + financeEntryLabels[item.entryKind]
    : financeLedgerLabels[item.kind];
}

export async function cashBlock(
  tx: Transaction,
  query: AnalyticsQuery,
  scope: AnalyticsWindow,
): Promise<AnalyticsBlock> {
  const rollup = await cashTotals(tx, scope.window, query);
  const current = cashBreakdown(rollup);
  const previous = cashBreakdown(await cashTotals(tx, scope.comparison, query));
  const pairs = [
    ['collectedUsd', 'Cobros y anticipos'],
    ['salesCollectedUsd', 'Cobros de ventas y cambios'],
    ['advancesCollectedUsd', 'Anticipos de apartados'],
    ['cashFlowUsd', 'Flujo de caja operativo'],
    ['cashInUsd', 'Entradas de caja operativa'],
    ['cashOutUsd', 'Salidas de caja operativa'],
    ['refundsUsd', 'Reembolsos'],
    ['changeUsd', 'Vuelto'],
    ['supplierNetUsd', 'Pagos netos a proveedores'],
    ['expensesUsd', 'Gastos netos'],
    ['otherIncomeUsd', 'Otros ingresos netos'],
    ['transferNetUsd', 'Efecto de transferencias'],
    ['adjustmentsNetUsd', 'Ajustes netos'],
    ['accountNetUsd', 'Variación de saldos'],
  ] as const;
  const accounts = await tx.$queryRaw<
    {
      account: string;
      method: string;
      currency: string;
      original: Prisma.Decimal;
      collected: Prisma.Decimal;
      incoming: Prisma.Decimal;
      outgoing: Prisma.Decimal;
      operating: Prisma.Decimal;
    }[]
  >`
    SELECT a.name AS account, a.kind::text AS method, m.currency_code AS currency,
      COALESCE(SUM(m.amount_original) FILTER (WHERE ${collected}), 0) AS original,
      COALESCE(SUM(m.amount_usd) FILTER (WHERE ${collected}), 0) AS collected,
      COALESCE(SUM(m.amount_usd) FILTER (WHERE ${incoming}), 0) AS incoming,
      COALESCE(SUM(m.amount_usd) FILTER (WHERE NOT (${incoming})), 0) AS outgoing,
      COALESCE(SUM(CASE WHEN ${incoming} THEN m.amount_usd ELSE -m.amount_usd END) FILTER (WHERE ${operating}), 0) AS operating
    ${fromCash} WHERE ${scopeSql(query, scope.window.from, scope.window.to)}
    GROUP BY a.id, m.currency_code ORDER BY collected DESC, currency, account
  `;
  const buckets = await tx.$queryRaw<{ date: string; previous: boolean; value: Prisma.Decimal }[]>`
    SELECT to_char(date_trunc(${scope.interval.toLowerCase()}::text,
      m.occurred_at AT TIME ZONE ${scope.window.timezone}), 'YYYY-MM-DD') AS date,
      m.occurred_at < ${new Date(scope.window.from)} AS previous,
      SUM(CASE WHEN ${incoming} THEN m.amount_usd ELSE -m.amount_usd END) AS value
    ${fromCash} WHERE ${scopeSql(query, scope.comparison.from, scope.window.to)} AND ${operating}
    GROUP BY 1, 2 ORDER BY 1
  `;
  const entries = await ledgerPage(
    tx,
    {
      period: 'DAY',
      q: '',
      page: 1,
      limit: 16,
      accountId: query.accountId,
      currencyCode: query.currencyCode,
    },
    scope.window,
    query.method,
  );
  const trend = (prior: boolean) =>
    fillBuckets(
      prior ? scope.comparison : scope.window,
      scope.interval,
      new Map(
        buckets
          .filter((item) => item.previous === prior)
          .map(({ date, value }) => [date, usd(value)]),
      ),
    );
  return {
    section: 'CASH',
    metrics: pairs.map(([key, label], index) =>
      metric(
        key,
        label,
        current[key],
        'USD',
        previous[key],
        index === 0 ? target('finance-movements') : undefined,
      ),
    ),
    trend: { label: 'Flujo de caja operativo', current: trend(false), previous: trend(true) },
    tables: [
      {
        id: 'expense-categories',
        title: 'Gastos netos por categoría',
        columns: [cell('Categoría'), cell('Total', 'USD')],
        rows: expenseCategories(rollup).map((item) => row([item.name, item.usd])),
      },
      {
        id: 'cash-accounts',
        title: 'Cobros y movimientos por cuenta y moneda',
        columns: [
          cell('Cuenta'),
          cell('Método'),
          cell('Moneda'),
          cell('Cobros en moneda', 'COUNT'),
          cell('Cobros', 'USD'),
          cell('Entradas', 'USD'),
          cell('Salidas', 'USD'),
          cell('Flujo operativo', 'USD'),
        ],
        rows: accounts.map((item) =>
          row([
            item.account,
            accountLabels[item.method] ?? item.method,
            item.currency,
            item.original.toFixed(),
            usd(item.collected),
            usd(item.incoming),
            usd(item.outgoing),
            usd(item.operating),
          ]),
        ),
      },
      {
        id: 'recent-cash',
        title: 'Últimos 16 movimientos de caja',
        columns: [
          cell('Fecha', 'TIME'),
          cell('Movimiento'),
          cell('Cuenta'),
          cell('Moneda'),
          cell('USD histórico', 'USD'),
        ],
        rows: entries.items.map((item) =>
          row(
            [
              item.occurredAt,
              entryName(item),
              item.accountName,
              item.currencyCode,
              item.direction === 'OUT' ? '-' + item.amountUsd : item.amountUsd,
            ],
            target(link[item.sourceKind], item.sourceId),
          ),
        ),
        rowCount: entries.total,
      },
    ],
  };
}
