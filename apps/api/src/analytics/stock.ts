import type {
  AnalyticsBlock,
  AnalyticsQuery,
  AnalyticsTable,
  SessionUser,
} from '@max-sport/shared';
import { Prisma } from '../generated/prisma/client.js';
import type { StockMovementKind } from '../generated/prisma/client.js';
import { decimal } from '../purchasing/money.js';
import type { Transaction } from '../purchasing/transaction.js';
import type { AnalyticsWindow } from './calendar.js';
import { filterVariants } from './filters.js';
import { cell, metric, quantity, row, target, usd } from './presentation.js';

const variantJoins = Prisma.sql`
  JOIN product_models model ON model.id = v.model_id JOIN brands b ON b.id = model.brand_id
`;
const movementName: Record<StockMovementKind, string> = {
  RECEIPT: 'Recepción',
  RECEIPT_REVERSAL: 'Reverso de recepción',
  SALE_OUT: 'Venta',
  ADJUST_IN: 'Ajuste de entrada',
  ADJUST_OUT: 'Ajuste de salida',
  RESERVE: 'Reserva',
  RELEASE_RESERVATION: 'Liberación de reserva',
  SALE_RETURN_IN: 'Devolución',
};
type StockRow = {
  brand: string;
  model: string;
  sku: string;
  size: number;
  available: number;
  physical: number;
  reserved: number;
  threshold: number;
  active: boolean;
  value: Prisma.Decimal;
};
export async function stockBlock(
  tx: Transaction,
  query: AnalyticsQuery,
  scope: AnalyticsWindow,
  actor: SessionUser,
): Promise<AnalyticsBlock> {
  const canCost = actor.permissions.includes('costs.read');
  const filtered = Prisma.sql`inventory AS (
    SELECT b.name AS brand, model.name AS model, model.id AS model_id, v.sku, v.size,
      COALESCE(i.physical, 0) AS physical, COALESCE(i.reserved, 0) AS reserved,
      COALESCE(i.physical, 0) - COALESCE(i.reserved, 0) AS available,
      v.active AND model.active AND b.active AS active,
      COALESCE(v.low_stock_threshold, settings.low_stock_threshold) AS threshold,
      ${
        canCost
          ? Prisma.sql`COALESCE((SELECT SUM(l.remaining_cost_usd) FROM inventory_lots l
        WHERE l.variant_id = v.id AND l.remaining_quantity > 0), 0)`
          : Prisma.sql`0::numeric`
      } AS value
    FROM product_variants v ${variantJoins} CROSS JOIN shop_settings settings
    LEFT JOIN inventory_balances i ON i.variant_id = v.id
    WHERE settings.id = 1 ${filterVariants(query)}
  )`;
  const [summary] = await tx.$queryRaw<
    {
      physical: bigint;
      reserved: bigint;
      available: bigint;
      low: bigint;
      empty: bigint;
      variants: bigint;
      value: Prisma.Decimal;
    }[]
  >`
    WITH ${filtered}
    SELECT COALESCE(SUM(physical), 0) AS physical, COALESCE(SUM(reserved), 0) AS reserved,
      COALESCE(SUM(available), 0) AS available, COUNT(*) AS variants,
      COUNT(*) FILTER (WHERE active AND available <= threshold) AS low,
      COUNT(*) FILTER (WHERE active AND available = 0) AS empty, COALESCE(SUM(value), 0) AS value
    FROM inventory
  `;
  const variants = await tx.$queryRaw<StockRow[]>`
    WITH ${filtered} SELECT * FROM inventory
    ORDER BY (active AND available <= threshold) DESC, brand, model, size, sku LIMIT 100
  `;
  const lowRows = variants.filter((item) => item.active && item.available <= item.threshold);
  const exhausted = await tx.$queryRaw<
    { id: string; brand: string; model: string; sizes: bigint; total: bigint }[]
  >`
    WITH ${filtered}, included_models AS (SELECT DISTINCT model_id, brand, model FROM inventory WHERE active)
    SELECT selected.model_id AS id, selected.brand, selected.model, COUNT(DISTINCT v.size) AS sizes,
      COUNT(*) OVER () AS total
    FROM included_models selected JOIN product_variants v ON v.model_id = selected.model_id AND v.active
    LEFT JOIN inventory_balances i ON i.variant_id = v.id
    GROUP BY selected.model_id, selected.brand, selected.model
    HAVING SUM(COALESCE(i.physical - i.reserved, 0)) = 0
    ORDER BY selected.brand, selected.model, selected.model_id LIMIT 40
  `;
  const movements = await tx.$queryRaw<
    {
      at: Date;
      kind: StockMovementKind;
      sku: string;
      size: number;
      quantity: number;
      reserved: number;
    }[]
  >`
    SELECT m.occurred_at AS at, m.kind::text AS kind, v.sku, v.size,
      m.quantity_delta AS quantity, m.reserved_delta AS reserved
    FROM stock_movements m JOIN product_variants v ON v.id = m.variant_id ${variantJoins}
    WHERE m.occurred_at >= ${new Date(scope.window.from)} AND m.occurred_at < ${new Date(scope.window.to)} ${filterVariants(query)}
    ORDER BY m.occurred_at DESC, m.id DESC LIMIT 40
  `;
  function inventoryTable(
    id: string,
    title: string,
    records: StockRow[],
    rowCount: number,
  ): AnalyticsTable {
    return {
      id,
      title,
      rowCount,
      columns: [
        cell('Modelo y SKU'),
        cell('Talla', 'COUNT'),
        cell('Físico', 'COUNT'),
        cell('Reservado', 'COUNT'),
        cell('Disponible', 'COUNT'),
        cell('Umbral', 'COUNT'),
        cell('Estado'),
        ...(canCost ? [cell('Valor FIFO', 'USD')] : []),
      ],
      rows: records.map((item) =>
        row(
          [
            item.brand + ' · ' + item.model + ' · ' + item.sku,
            quantity(item.size),
            quantity(item.physical),
            quantity(item.reserved),
            quantity(item.available),
            quantity(item.threshold),
            item.active
              ? item.available === 0
                ? 'Agotada'
                : item.available <= item.threshold
                  ? 'Stock bajo'
                  : 'Disponible'
              : 'Archivada',
            ...(canCost ? [usd(item.value)] : []),
          ],
          target('inventory', undefined, { q: item.sku }),
        ),
      ),
    };
  }
  return {
    section: 'STOCK',
    metrics: [
      metric(
        'stock-physical',
        'Pares físicos',
        quantity(summary?.physical ?? 0),
        'COUNT',
        undefined,
        target('inventory'),
      ),
      metric('stock-held', 'Pares reservados', quantity(summary?.reserved ?? 0)),
      metric('stock-available', 'Pares disponibles', quantity(summary?.available ?? 0)),
      metric(
        'stock-low',
        'Variantes con alerta',
        quantity(summary?.low ?? 0),
        'COUNT',
        undefined,
        target('inventory', undefined, { stock: 'LOW' }),
      ),
      metric(
        'stock-empty',
        'Variantes agotadas',
        quantity(summary?.empty ?? 0),
        'COUNT',
        undefined,
        target('inventory', undefined, { stock: 'OUT' }),
      ),
      metric(
        'stock-empty-models',
        'Modelos sin stock disponible',
        quantity(exhausted[0]?.total ?? 0),
      ),
      ...(canCost
        ? [
            metric(
              'stock-value',
              'Valor de inventario FIFO',
              usd(decimal(summary?.value ?? 0)),
              'USD',
            ),
          ]
        : []),
    ],
    tables: [
      inventoryTable('stock-alerts', 'Alertas por talla', lowRows, Number(summary?.low ?? 0)),
      {
        id: 'empty-models',
        title: 'Modelos sin stock disponible',
        rowCount: Number(exhausted[0]?.total ?? 0),
        columns: [cell('Modelo'), cell('Marca'), cell('Tallas agotadas', 'COUNT')],
        rows: exhausted.map((item) =>
          row(
            [item.model, item.brand, quantity(item.sizes)],
            target('inventory', undefined, { modelId: item.id, stock: 'OUT' }),
          ),
        ),
      },
      inventoryTable(
        'stock-variants',
        'Existencias por variante',
        variants,
        Number(summary?.variants ?? 0),
      ),
      {
        id: 'stock-movements',
        title: 'Últimos 40 movimientos de stock',
        columns: [
          cell('Fecha', 'TIME'),
          cell('Tipo'),
          cell('SKU'),
          cell('Talla', 'COUNT'),
          cell('Variación física', 'COUNT'),
          cell('Variación de reserva', 'COUNT'),
        ],
        rows: movements.map((item) =>
          row(
            [
              item.at.toISOString(),
              movementName[item.kind],
              item.sku,
              quantity(item.size),
              quantity(item.quantity),
              quantity(item.reserved),
            ],
            target('inventory', undefined, { q: item.sku }),
          ),
        ),
      },
    ],
  };
}
