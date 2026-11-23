import type { AnalyticsBlock, AnalyticsQuery, SessionUser } from '@max-sport/shared';
import { Prisma } from '../generated/prisma/client.js';
import { decimal } from '../purchasing/money.js';
import type { Transaction } from '../purchasing/transaction.js';
import type { AnalyticsWindow } from './calendar.js';
import { filterVariants } from './filters.js';
import { cell, metric, quantity, row, target, usd } from './presentation.js';

export async function purchasesBlock(
  tx: Transaction,
  query: AnalyticsQuery,
  scope: AnalyticsWindow,
  actor: SessionUser,
): Promise<AnalyticsBlock> {
  const showCosts = actor.permissions.includes('costs.read');
  const start = new Date(scope.window.from);
  const supplier = query.supplierId
    ? Prisma.sql`AND p.supplier_id = ${query.supplierId}::uuid`
    : Prisma.empty;
  const receipts = Prisma.sql`entries AS (
    SELECT m.occurred_at, m.kind::text, m.quantity_delta, p.id AS purchase_id, p.reference, supplier.name AS supplier,
      CASE WHEN m.kind = 'RECEIPT' THEN li.total_usd ELSE -li.total_usd END AS usd
    FROM stock_movements m JOIN purchase_items li ON li.id = m.purchase_item_id
    JOIN purchases p ON p.id = li.purchase_id JOIN suppliers supplier ON supplier.id = p.supplier_id
    JOIN product_variants v ON v.id = li.variant_id JOIN product_models model ON model.id = v.model_id
    WHERE m.kind::text IN ('RECEIPT','RECEIPT_REVERSAL') AND m.occurred_at >= ${new Date(scope.comparison.from)}
      AND m.occurred_at < ${new Date(scope.window.to)} ${supplier} ${filterVariants(query)}
  )`;
  const totals = await tx.$queryRaw<
    {
      prior: boolean;
      receipts: bigint;
      pairs: bigint;
      value: Prisma.Decimal;
      reversed: bigint;
      entered: bigint;
    }[]
  >`
    WITH ${receipts}
    SELECT occurred_at < ${start} AS prior, COUNT(DISTINCT purchase_id) FILTER (WHERE kind = 'RECEIPT') AS receipts,
      SUM(quantity_delta) AS pairs, SUM(usd) AS value,
      COALESCE(SUM(-quantity_delta) FILTER (WHERE kind = 'RECEIPT_REVERSAL'), 0) AS reversed,
      COALESCE(SUM(quantity_delta) FILTER (WHERE kind = 'RECEIPT'), 0) AS entered
    FROM entries GROUP BY 1
  `;
  const current = totals.find((item) => !item.prior);
  const before = totals.find((item) => item.prior);
  const list = await tx.$queryRaw<
    {
      id: string;
      at: Date;
      supplier: string;
      reference: string | null;
      kind: string;
      pairs: bigint;
      value: Prisma.Decimal;
    }[]
  >`
    WITH ${receipts}
    SELECT purchase_id AS id, occurred_at AS at, supplier, reference, kind,
      SUM(quantity_delta) AS pairs, SUM(usd) AS value
    FROM entries WHERE occurred_at >= ${start}
    GROUP BY 1, 2, 3, 4, 5 ORDER BY occurred_at DESC, purchase_id DESC LIMIT 40
  `;
  const metrics = [
    metric(
      'received-purchases',
      'Compras recibidas',
      quantity(current?.receipts ?? 0),
      'COUNT',
      quantity(before?.receipts ?? 0),
      target('purchases'),
    ),
    metric(
      'received-pairs',
      'Pares recibidos',
      quantity(current?.entered ?? 0),
      'COUNT',
      quantity(before?.entered ?? 0),
    ),
    metric(
      'reversed-pairs',
      'Pares de recepción revertidos',
      quantity(current?.reversed ?? 0),
      'COUNT',
      quantity(before?.reversed ?? 0),
    ),
    metric(
      'net-received-pairs',
      'Entradas netas de compras',
      quantity(current?.pairs ?? 0),
      'COUNT',
      quantity(before?.pairs ?? 0),
    ),
  ];
  if (showCosts) {
    const [unpaid] = await tx.$queryRaw<{ balance: Prisma.Decimal; count: bigint }[]>`
      SELECT COALESCE(SUM(p.total_usd - p.paid_usd), 0) AS balance, COUNT(*) AS count
      FROM purchases p WHERE p.status = 'CONFIRMED' AND p.total_usd > p.paid_usd ${supplier}
    `;
    metrics.push(
      metric(
        'received-value',
        'Valor neto de recepciones',
        usd(decimal(current?.value ?? 0)),
        'USD',
        usd(decimal(before?.value ?? 0)),
      ),
      metric(
        'supplier-debt',
        'Saldo actual a proveedores',
        usd(decimal(unpaid?.balance ?? 0)),
        'USD',
        undefined,
        actor.permissions.includes('finance.read')
          ? target('finance-payables')
          : target('purchases'),
      ),
      metric('unpaid-purchases', 'Compras con saldo', quantity(unpaid?.count ?? 0)),
    );
  }
  return {
    section: 'PURCHASES',
    metrics,
    tables: [
      {
        id: 'purchase-receipts',
        title: 'Últimas 40 recepciones y reversos',
        columns: [
          cell('Referencia'),
          cell('Proveedor'),
          cell('Fecha', 'TIME'),
          cell('Tipo'),
          cell('Pares', 'COUNT'),
          ...(showCosts ? [cell('Valor', 'USD')] : []),
        ],
        rows: list.map((item) =>
          row(
            [
              item.reference ?? 'Compra ' + item.id.slice(0, 8),
              item.supplier,
              item.at.toISOString(),
              item.kind === 'RECEIPT' ? 'Recepción' : 'Reverso',
              quantity(item.pairs),
              ...(showCosts ? [usd(item.value)] : []),
            ],
            target('purchase-detail', item.id),
          ),
        ),
      },
    ],
  };
}
