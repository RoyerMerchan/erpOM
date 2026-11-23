import type { AnalyticsBlock, AnalyticsQuery, SessionUser } from '@max-sport/shared';
import { Prisma } from '../generated/prisma/client.js';
import { decimal } from '../purchasing/money.js';
import type { Transaction } from '../purchasing/transaction.js';
import { formatSaleReceipt } from '../sales/read.js';
import type { AnalyticsWindow } from './calendar.js';
import { filterSale, filterVariants } from './filters.js';
import { cell, metric, quantity, row, target, usd } from './presentation.js';

export async function returnsBlock(
  tx: Transaction,
  query: AnalyticsQuery,
  scope: AnalyticsWindow,
  actor: SessionUser,
): Promise<AnalyticsBlock> {
  const canCost = actor.permissions.includes('costs.read');
  const currentFrom = new Date(scope.window.from);
  const events = Prisma.sql`corrections AS (
    SELECT c.id, c.number, c.kind::text, c.created_at, s.receipt_number, s.customer_name,
      SUM(item.quantity) AS pairs, SUM(item.credit_usd) AS credit, SUM(item.restored_cogs_usd) AS restored,
      COALESCE(SUM(item.quantity) FILTER (WHERE item.condition = 'SELLABLE'), 0) AS restocked
    FROM sale_corrections c JOIN sale_correction_items item ON item.correction_id = c.id
    JOIN sales s ON s.id = c.sale_id JOIN sale_items li ON li.id = item.sale_item_id
    JOIN product_variants v ON v.id = li.variant_id JOIN product_models model ON model.id = v.model_id
    WHERE c.created_at >= ${new Date(scope.comparison.from)} AND c.created_at < ${new Date(scope.window.to)}
      ${filterSale(query, actor)} ${filterVariants(query)}
    GROUP BY c.id, s.receipt_number, s.customer_name
  )`;
  const summary = await tx.$queryRaw<
    {
      prior: boolean;
      total: bigint;
      exchanges: bigint;
      pairs: Prisma.Decimal;
      restocked: Prisma.Decimal;
      credit: Prisma.Decimal;
      cost: Prisma.Decimal;
    }[]
  >`
    WITH ${events}
    SELECT created_at < ${currentFrom} AS prior, COUNT(*) AS total,
      COUNT(*) FILTER (WHERE kind = 'EXCHANGE') AS exchanges, SUM(pairs) AS pairs, SUM(restocked) AS restocked,
      SUM(credit) AS credit, SUM(restored) AS cost
    FROM corrections GROUP BY 1
  `;
  const now = summary.find((item) => !item.prior);
  const before = summary.find((item) => item.prior);
  const items = await tx.$queryRaw<
    {
      id: string;
      number: bigint;
      kind: 'RETURN' | 'EXCHANGE';
      at: Date;
      receipt: bigint;
      customer: string;
      pairs: bigint;
      restocked: bigint;
      credit: Prisma.Decimal;
      restored: Prisma.Decimal;
    }[]
  >`
    WITH ${events}
    SELECT id, number, kind, created_at AS at, receipt_number AS receipt, customer_name AS customer,
      pairs, restocked, credit, restored
    FROM corrections WHERE created_at >= ${currentFrom} ORDER BY created_at DESC, id DESC LIMIT 40
  `;
  return {
    section: 'RETURNS',
    metrics: [
      metric(
        'corrections',
        'Cambios y devoluciones',
        quantity(now?.total ?? 0),
        'COUNT',
        quantity(before?.total ?? 0),
        target('returns'),
      ),
      metric(
        'exchanges',
        'Cambios',
        quantity(now?.exchanges ?? 0),
        'COUNT',
        quantity(before?.exchanges ?? 0),
      ),
      metric(
        'returned-pairs',
        'Pares devueltos',
        decimal(now?.pairs ?? 0).toFixed(0),
        'COUNT',
        decimal(before?.pairs ?? 0).toFixed(0),
      ),
      metric(
        'restocked-pairs',
        'Pares reingresados',
        decimal(now?.restocked ?? 0).toFixed(0),
        'COUNT',
        decimal(before?.restocked ?? 0).toFixed(0),
      ),
      metric(
        'returned-usd',
        'Rectificación de ventas',
        usd(decimal(now?.credit ?? 0)),
        'USD',
        usd(decimal(before?.credit ?? 0)),
      ),
      ...(canCost
        ? [
            metric(
              'restored-cost',
              'Costo FIFO recuperado',
              usd(decimal(now?.cost ?? 0)),
              'USD',
              usd(decimal(before?.cost ?? 0)),
            ),
          ]
        : []),
    ],
    tables: [
      {
        id: 'recent-returns',
        title: 'Últimos 40 cambios y devoluciones',
        rowCount: Number(now?.total ?? 0),
        columns: [
          cell('Movimiento'),
          cell('Venta'),
          cell('Fecha', 'TIME'),
          cell('Cliente'),
          cell('Tipo'),
          cell('Pares', 'COUNT'),
          cell('Reingresan', 'COUNT'),
          cell('Rectificación', 'USD'),
          ...(canCost ? [cell('Costo recuperado', 'USD')] : []),
        ],
        rows: items.map((item) =>
          row(
            [
              'R-' + item.number.toString().padStart(6, '0'),
              formatSaleReceipt(item.receipt),
              item.at.toISOString(),
              item.customer,
              item.kind === 'EXCHANGE' ? 'Cambio' : 'Devolución',
              quantity(item.pairs),
              quantity(item.restocked),
              usd(item.credit),
              ...(canCost ? [usd(item.restored)] : []),
            ],
            target('return-detail', item.id),
          ),
        ),
      },
    ],
  };
}
