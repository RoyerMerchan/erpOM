import type {
  AnalyticsBlock,
  AnalyticsQuery,
  AnalyticsTable,
  SessionUser,
} from '@max-sport/shared';
import { Prisma } from '../generated/prisma/client.js';
import { decimal } from '../purchasing/money.js';
import type { Transaction } from '../purchasing/transaction.js';
import { canViewProfit } from '../sales/quotes.js';
import { formatSaleReceipt } from '../sales/read.js';
import { fillBuckets } from './calendar.js';
import type { AnalyticsWindow } from './calendar.js';
import { filterSale, filterVariants } from './filters.js';
import { cell, metric, quantity, row, target, usd } from './presentation.js';

const products = Prisma.sql`
  JOIN product_variants v ON v.id = li.variant_id
  JOIN product_models model ON model.id = v.model_id
  JOIN brands b ON b.id = model.brand_id
`;

type Amounts = {
  documents: bigint;
  pairs: bigint;
  gross: Prisma.Decimal;
  discounts: Prisma.Decimal;
  net: Prisma.Decimal;
  cost: Prisma.Decimal;
  refunds: Prisma.Decimal;
};
type Bucket = Amounts & { date: string; previous: boolean };

function saleEvents(query: AnalyticsQuery, scope: AnalyticsWindow, actor: SessionUser) {
  const range = (field: Prisma.Sql) =>
    Prisma.sql`${field} >= ${new Date(scope.comparison.from)} AND ${field} < ${new Date(scope.window.to)}`;
  const scopeFilter = Prisma.sql`${filterVariants(query)} ${filterSale(query, actor)}`;
  return Prisma.sql`events AS (
    SELECT s.confirmed_at AS event_at, s.id AS sale_id, s.receipt_number, s.customer_name, s.seller_name,
      b.name AS brand, model.name AS model, v.size, li.sku, li.quantity AS pairs,
      li.gross_usd AS gross, li.line_discount_usd + li.global_discount_usd AS discounts,
      li.net_usd AS net, li.cogs_usd AS cost, 0::numeric AS refunds
    FROM sale_items li JOIN sales s ON s.id = li.sale_id ${products}
    WHERE ${range(Prisma.sql`s.confirmed_at`)} ${scopeFilter}
    UNION ALL
    SELECT c.created_at, NULL::uuid, s.receipt_number, s.customer_name, s.seller_name,
      b.name, model.name, v.size, li.sku, -ci.quantity,
      0, 0, -ci.credit_usd, -ci.restored_cogs_usd, ci.credit_usd
    FROM sale_correction_items ci JOIN sale_corrections c ON c.id = ci.correction_id
    JOIN sale_items li ON li.id = ci.sale_item_id JOIN sales s ON s.id = c.sale_id ${products}
    WHERE ${range(Prisma.sql`c.created_at`)} ${scopeFilter}
  )`;
}

function total(rows: Bucket[]): Amounts {
  return rows.reduce<Amounts>(
    (sum, bucket) => ({
      documents: sum.documents + bucket.documents,
      pairs: sum.pairs + bucket.pairs,
      gross: sum.gross.add(bucket.gross),
      discounts: sum.discounts.add(bucket.discounts),
      net: sum.net.add(bucket.net),
      cost: sum.cost.add(bucket.cost),
      refunds: sum.refunds.add(bucket.refunds),
    }),
    {
      documents: 0n,
      pairs: 0n,
      gross: decimal(0),
      discounts: decimal(0),
      net: decimal(0),
      cost: decimal(0),
      refunds: decimal(0),
    },
  );
}

async function expenses(tx: Transaction, from: string, to: string) {
  const [amount] = await tx.$queryRaw<{ value: Prisma.Decimal }[]>`
    SELECT COALESCE(SUM(CASE WHEN l.direction = 'OUT' THEN l.amount_usd ELSE -l.amount_usd END), 0) AS value
    FROM finance_entries e JOIN finance_lines l ON l.entry_id = e.id
    WHERE e.kind = 'EXPENSE' AND e.occurred_at >= ${new Date(from)} AND e.occurred_at < ${new Date(to)}
  `;
  return decimal(amount?.value ?? 0);
}

type Rank = {
  grouping: 'BRAND' | 'MODEL' | 'SIZE' | 'SKU';
  brand: string | null;
  model: string | null;
  size: number | null;
  sku: string | null;
  pairs: bigint;
  net: Prisma.Decimal;
  cost: Prisma.Decimal;
};
async function rankings(
  tx: Transaction,
  events: Prisma.Sql,
  since: Date,
  canCost: boolean,
  canProfit: boolean,
) {
  const stats = await tx.$queryRaw<Rank[]>`
    WITH ${events}, ranked AS (
      SELECT CASE WHEN GROUPING(sku) = 0 THEN 'SKU' WHEN GROUPING(model) = 0 THEN 'MODEL'
        WHEN GROUPING(size) = 0 THEN 'SIZE' ELSE 'BRAND' END AS grouping,
        brand, model, size, sku, SUM(pairs) AS pairs, SUM(net) AS net, SUM(cost) AS cost
      FROM events WHERE event_at >= ${since}
      GROUP BY GROUPING SETS ((brand), (brand, model), (size), (brand, model, size, sku))
    ), numbered AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY grouping ORDER BY pairs DESC, net DESC, brand, model, size, sku) AS placement
      FROM ranked
    )
    SELECT grouping, brand, model, size, sku, pairs, net, cost FROM numbered
    WHERE placement <= 12 ORDER BY grouping, placement
  `;
  const groups = [
    { kind: 'MODEL', id: 'models', title: 'Modelos por pares vendidos' },
    { kind: 'BRAND', id: 'brands', title: 'Marcas por pares vendidos' },
    { kind: 'SIZE', id: 'sizes', title: 'Tallas por pares vendidos' },
    {
      kind: 'SKU',
      id: 'profit-by-sku',
      title: canProfit ? 'Rentabilidad por variante' : 'Ventas por variante',
    },
  ] as const;
  return groups.map<AnalyticsTable>(({ kind, id, title }) => ({
    id,
    title: title + ' · Top 12',
    columns: [
      cell('Producto'),
      cell('Pares netos', 'COUNT'),
      cell('Ventas netas', 'USD'),
      ...(canCost ? [cell('Costo FIFO', 'USD')] : []),
      ...(canProfit ? [cell('Utilidad bruta', 'USD'), cell('Margen bruto', 'PERCENT')] : []),
    ],
    rows: stats
      .filter((item) => item.grouping === kind)
      .map((item) =>
        row([
          [item.brand, item.model, item.size != null ? 'Talla ' + item.size : null, item.sku]
            .filter(Boolean)
            .join(' · '),
          quantity(item.pairs),
          usd(item.net),
          ...(canCost ? [usd(item.cost)] : []),
          ...(canProfit
            ? [
                usd(item.net.sub(item.cost)),
                item.net.gt(0) ? usd(item.net.sub(item.cost).div(item.net).mul(100)) : '',
              ]
            : []),
        ]),
      ),
  }));
}

export async function salesBlock(
  tx: Transaction,
  query: AnalyticsQuery,
  scope: AnalyticsWindow,
  actor: SessionUser,
): Promise<AnalyticsBlock> {
  const events = saleEvents(query, scope, actor);
  const since = new Date(scope.window.from);
  const interval = scope.interval.toLowerCase();
  const buckets = await tx.$queryRaw<Bucket[]>`
    WITH ${events}
    SELECT to_char(date_trunc(${interval}::text, event_at AT TIME ZONE ${scope.window.timezone}), 'YYYY-MM-DD') AS date,
      event_at < ${since} AS previous, COUNT(DISTINCT sale_id) AS documents,
      SUM(pairs) AS pairs, SUM(gross) AS gross, SUM(discounts) AS discounts,
      SUM(net) AS net, SUM(cost) AS cost, SUM(refunds) AS refunds
    FROM events GROUP BY 1, 2 ORDER BY 1
  `;
  const currentRows = buckets.filter(({ previous }) => !previous);
  const previousRows = buckets.filter(({ previous }) => previous);
  const current = total(currentRows);
  const previous = total(previousRows);
  const canCost = actor.permissions.includes('costs.read');
  const profit = canViewProfit(actor);
  const hasScope =
    query.sellerId ||
    query.customerId ||
    query.brandId ||
    query.modelId ||
    query.size ||
    query.accountId ||
    query.currencyCode ||
    query.method;
  const operating =
    actor.permissions.includes('finance.read') &&
    actor.permissions.includes('sales.read.all') &&
    !hasScope;
  const metrics = [
    metric(
      'net-sales',
      'Ventas netas',
      usd(current.net),
      'USD',
      usd(previous.net),
      target('sales'),
    ),
    metric(
      'sales-count',
      'Ventas confirmadas',
      quantity(current.documents),
      'COUNT',
      quantity(previous.documents),
    ),
    metric(
      'pairs-sold',
      'Pares vendidos netos',
      quantity(current.pairs),
      'COUNT',
      quantity(previous.pairs),
    ),
    metric(
      'average-ticket',
      'Ticket promedio',
      current.documents ? usd(current.net.div(current.documents.toString())) : null,
      'USD',
      previous.documents ? usd(previous.net.div(previous.documents.toString())) : null,
    ),
    metric('gross-sales', 'Ventas brutas', usd(current.gross), 'USD', usd(previous.gross)),
    metric('discounts', 'Descuentos', usd(current.discounts), 'USD', usd(previous.discounts)),
    metric(
      'refunds',
      'Rectificaciones de venta',
      usd(current.refunds),
      'USD',
      usd(previous.refunds),
    ),
  ];
  if (canCost)
    metrics.push(
      metric('cogs', 'Costo de ventas FIFO', usd(current.cost), 'USD', usd(previous.cost)),
    );
  if (profit) {
    const gross = current.net.sub(current.cost);
    const previousGross = previous.net.sub(previous.cost);
    metrics.push(
      metric('gross-profit', 'Utilidad bruta', usd(gross), 'USD', usd(previousGross)),
      metric(
        'margin',
        'Margen bruto',
        current.net.gt(0) ? usd(gross.div(current.net).mul(100)) : null,
        'PERCENT',
        previous.net.gt(0) ? usd(previousGross.div(previous.net).mul(100)) : null,
      ),
    );
  }
  if (operating) {
    const currentExpense = await expenses(tx, scope.window.from, scope.window.to);
    const previousExpense = await expenses(tx, scope.comparison.from, scope.comparison.to);
    metrics.push(
      metric(
        'operating-expense',
        'Gasto operativo',
        usd(currentExpense),
        'USD',
        usd(previousExpense),
      ),
    );
    if (profit)
      metrics.push(
        metric(
          'net-profit',
          'Utilidad neta estimada',
          usd(current.net.sub(current.cost).sub(currentExpense)),
          'USD',
          usd(previous.net.sub(previous.cost).sub(previousExpense)),
        ),
      );
  }

  const recent = await tx.$queryRaw<
    {
      id: string;
      receipt: bigint;
      at: Date;
      customer: string;
      seller: string;
      pairs: bigint;
      net: Prisma.Decimal;
    }[]
  >`
    WITH ${events}
    SELECT sale_id AS id, receipt_number AS receipt, event_at AS at, customer_name AS customer,
      seller_name AS seller, SUM(pairs) AS pairs, SUM(net) AS net
    FROM events WHERE sale_id IS NOT NULL AND event_at >= ${since}
    GROUP BY 1, 2, 3, 4, 5 ORDER BY event_at DESC, receipt_number DESC LIMIT 16
  `;
  const table: AnalyticsTable = {
    id: 'recent-sales',
    title: 'Últimas 16 ventas del período',
    columns: [
      cell('Comprobante'),
      cell('Fecha', 'TIME'),
      cell('Cliente'),
      cell('Vendedor'),
      cell('Pares', 'COUNT'),
      cell('Ventas', 'USD'),
    ],
    rows: recent.map((item) =>
      row(
        [
          formatSaleReceipt(item.receipt),
          item.at.toISOString(),
          item.customer,
          item.seller,
          quantity(item.pairs),
          usd(item.net),
        ],
        target('sale-detail', item.id),
      ),
    ),
  };
  const points = (bucketRows: Bucket[]) =>
    new Map(bucketRows.map((point) => [point.date, usd(point.net)]));
  return {
    section: 'SALES',
    metrics,
    trend: {
      label: 'Ventas netas',
      current: fillBuckets(scope.window, scope.interval, points(currentRows)),
      previous: fillBuckets(scope.comparison, scope.interval, points(previousRows)),
    },
    tables: [table, ...(await rankings(tx, events, since, canCost, profit))],
  };
}
