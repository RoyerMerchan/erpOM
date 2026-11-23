import type { AnalyticsBlock, AnalyticsQuery, SessionUser } from '@max-sport/shared';
import { analyticsLayawayLabels } from '@max-sport/shared';
import { Prisma } from '../generated/prisma/client.js';
import type { LayawayStatus } from '../generated/prisma/client.js';
import { decimal } from '../purchasing/money.js';
import type { Transaction } from '../purchasing/transaction.js';
import type { AnalyticsWindow } from './calendar.js';
import { filterVariants } from './filters.js';
import { cell, metric, quantity, row, target, usd } from './presentation.js';

export async function layawaysBlock(
  tx: Transaction,
  query: AnalyticsQuery,
  scope: AnalyticsWindow,
  actor: SessionUser,
): Promise<AnalyticsBlock> {
  const state = query.layawayState;
  const overdue = Prisma.sql`l.status IN ('ACTIVE','PAID') AND l.expires_at <= CURRENT_TIMESTAMP`;
  const condition = Prisma.sql`TRUE
    ${actor.permissions.includes('layaways.read.all') ? Prisma.empty : Prisma.sql`AND l.seller_id = ${actor.id}::uuid`}
    ${query.sellerId ? Prisma.sql`AND l.seller_id = ${query.sellerId}::uuid` : Prisma.empty}
    ${query.customerId ? Prisma.sql`AND l.customer_id = ${query.customerId}::uuid` : Prisma.empty}
    ${state === 'OVERDUE' ? Prisma.sql`AND (${overdue})` : state ? Prisma.sql`AND l.status::text = ${state}` : Prisma.empty}
    ${
      query.brandId || query.modelId || query.size
        ? Prisma.sql`AND EXISTS (
      SELECT 1 FROM layaway_items i JOIN product_variants v ON v.id = i.variant_id
      JOIN product_models model ON model.id = v.model_id WHERE i.layaway_id = l.id ${filterVariants(query)}
    )`
        : Prisma.empty
    }
  `;
  const nowFrom = new Date(scope.window.from);
  const nowTo = new Date(scope.window.to);
  const before = new Date(scope.comparison.from);
  const [summary] = await tx.$queryRaw<
    {
      open: bigint;
      paid: bigint;
      overdue: bigint;
      delivered: bigint;
      beforeDelivered: bigint;
      created: bigint;
      beforeCreated: bigint;
      balance: Prisma.Decimal;
      count: bigint;
    }[]
  >`
    SELECT COUNT(*) FILTER (WHERE l.status IN ('ACTIVE','PAID')) AS open,
      COUNT(*) FILTER (WHERE l.status = 'PAID') AS paid, COUNT(*) FILTER (WHERE ${overdue}) AS overdue,
      COUNT(*) FILTER (WHERE l.status = 'DELIVERED' AND l.closed_at >= ${nowFrom} AND l.closed_at < ${nowTo}) AS delivered,
      COUNT(*) FILTER (WHERE l.status = 'DELIVERED' AND l.closed_at >= ${before} AND l.closed_at < ${nowFrom}) AS "beforeDelivered",
      COUNT(*) FILTER (WHERE l.created_at >= ${nowFrom} AND l.created_at < ${nowTo}) AS created,
      COUNT(*) FILTER (WHERE l.created_at >= ${before} AND l.created_at < ${nowFrom}) AS "beforeCreated",
      COALESCE(SUM(l.total_usd - l.paid_usd) FILTER (WHERE l.status = 'ACTIVE'), 0) AS balance,
      COUNT(*) AS count FROM layaways l WHERE ${condition}
  `;
  const items = await tx.$queryRaw<
    {
      id: string;
      number: bigint;
      customer: string;
      seller: string;
      expires: Date | null;
      status: LayawayStatus;
      overdue: boolean;
      total: Prisma.Decimal;
      balance: Prisma.Decimal;
    }[]
  >`
    SELECT l.id, l.number, l.customer_name AS customer, l.seller_name AS seller, l.expires_at AS expires,
      l.status::text AS status, COALESCE((${overdue}), FALSE) AS overdue, l.total_usd AS total,
      CASE WHEN l.status = 'ACTIVE' THEN l.total_usd - l.paid_usd ELSE 0 END AS balance
    FROM layaways l WHERE ${condition}
    ORDER BY (l.status IN ('ACTIVE', 'PAID')) DESC, l.expires_at NULLS LAST, l.created_at DESC, l.id DESC LIMIT 40
  `;
  return {
    section: 'LAYAWAYS',
    metrics: [
      metric(
        'open-layaways',
        'Apartados abiertos',
        quantity(summary?.open ?? 0),
        'COUNT',
        undefined,
        target('layaways'),
      ),
      metric(
        'overdue-layaways',
        'Vencidos sin cerrar',
        quantity(summary?.overdue ?? 0),
        'COUNT',
        undefined,
        target('layaways', undefined, { overdue: 'true' }),
      ),
      metric('paid-layaways', 'Pagados por entregar', quantity(summary?.paid ?? 0)),
      metric(
        'delivered-layaways',
        'Entregas del período',
        quantity(summary?.delivered ?? 0),
        'COUNT',
        quantity(summary?.beforeDelivered ?? 0),
      ),
      metric(
        'created-layaways',
        'Apartados creados',
        quantity(summary?.created ?? 0),
        'COUNT',
        quantity(summary?.beforeCreated ?? 0),
      ),
      metric(
        'customer-debt',
        'Saldo actual de apartados',
        usd(decimal(summary?.balance ?? 0)),
        'USD',
        undefined,
        target(actor.permissions.includes('finance.read') ? 'finance-receivables' : 'layaways'),
      ),
    ],
    tables: [
      {
        id: 'layaway-status',
        title: 'Apartados por estado',
        rowCount: Number(summary?.count ?? 0),
        columns: [
          cell('Apartado'),
          cell('Cliente'),
          cell('Vendedor'),
          cell('Estado'),
          cell('Vence', 'TIME'),
          cell('Total', 'USD'),
          cell('Saldo', 'USD'),
        ],
        rows: items.map((item) =>
          row(
            [
              'A-' + item.number.toString().padStart(6, '0'),
              item.customer,
              item.seller,
              analyticsLayawayLabels[item.overdue ? 'OVERDUE' : item.status],
              item.expires?.toISOString() ?? '',
              usd(item.total),
              usd(item.balance),
            ],
            target('layaway-detail', item.id),
          ),
        ),
      },
    ],
  };
}
