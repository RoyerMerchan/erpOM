import type { InventoryRow, SessionUser, inventoryQuerySchema } from '@max-sport/shared';
import type { z } from 'zod';
import type { Database } from '../database.js';
import { Prisma } from '../generated/prisma/client.js';
import { decimal } from '../purchasing/money.js';

type Query = z.output<typeof inventoryQuerySchema>;
type Record = Omit<
  InventoryRow,
  'salePriceUsd' | 'lastPurchaseAt' | 'unitCostUsd' | 'marginUsd'
> & {
  salePriceUsd: Prisma.Decimal;
  lastPurchaseAt: Date | null;
  unitCost?: Prisma.Decimal | null;
};
const from = Prisma.sql`FROM "product_variants" v
  JOIN "product_models" m ON m.id = v.model_id
  JOIN "brands" b ON b.id = m.brand_id
  LEFT JOIN "inventory_balances" i ON i.variant_id = v.id
  LEFT JOIN "shop_settings" s ON s.id = 1`;
const valid = Prisma.sql`v.active AND m.active AND b.active`;
const available = Prisma.sql`COALESCE(i.physical, 0) - COALESCE(i.reserved, 0)`;
const threshold = Prisma.sql`COALESCE(v.low_stock_threshold, s.low_stock_threshold, 0)`;
const lowStock = Prisma.sql`(${valid}) AND (${available}) <= ${threshold}`;

function conditions(query: Query) {
  const filters: Prisma.Sql[] = [];
  if (query.q)
    filters.push(Prisma.sql`(
    position(lower(${query.q}) in lower(v.sku)) > 0
    OR position(lower(${query.q}) in lower(m.name)) > 0
    OR position(lower(${query.q}) in lower(b.name)) > 0
  )`);
  if (query.size) filters.push(Prisma.sql`v.size = ${query.size}`);
  if (query.brandId) filters.push(Prisma.sql`b.id = ${query.brandId}::uuid`);
  if (query.modelId) filters.push(Prisma.sql`m.id = ${query.modelId}::uuid`);
  if (query.stock === 'LOW') filters.push(lowStock);
  if (query.stock === 'AVAILABLE') filters.push(Prisma.sql`(${valid}) AND (${available}) > 0`);
  if (query.stock === 'OUT') filters.push(Prisma.sql`(${valid}) AND (${available}) = 0`);
  return filters.length ? Prisma.sql`WHERE ${Prisma.join(filters, ' AND ')}` : Prisma.empty;
}

export async function inventoryPage(database: Database, query: Query, actor: SessionUser) {
  const where = conditions(query);
  const showCost = actor.permissions.includes('costs.read');
  const showMargin = showCost && actor.permissions.includes('profits.read');
  const fifoCost = showCost
    ? Prisma.sql`, (
    SELECT l.unit_cost_usd FROM "inventory_lots" l
    WHERE l.variant_id = v.id AND l.remaining_quantity > 0
    ORDER BY l.received_at ASC, l.id ASC LIMIT 1
  ) AS "unitCost"`
    : Prisma.empty;

  const [records, count] = await database.$transaction(
    [
      database.$queryRaw<Record[]>`SELECT v.id, b.name AS "brandName", m.name AS "modelName",
      v.sku, v.color, v.size, (${valid}) AS active, v.sale_price_usd AS "salePriceUsd",
      COALESCE(i.physical, 0) AS physical, COALESCE(i.reserved, 0) AS reserved,
      (${available}) AS available, ${threshold} AS threshold, (${lowStock}) AS "lowStock",
      (
        SELECT p.received_at FROM "purchase_items" pi
        JOIN "purchases" p ON p.id = pi.purchase_id
        WHERE pi.variant_id = v.id AND p.status = 'CONFIRMED'
        ORDER BY p.received_at DESC, p.id DESC LIMIT 1
      ) AS "lastPurchaseAt" ${fifoCost}
      ${from} ${where}
      ORDER BY b.name, m.name, v.size, v.sku
      OFFSET ${(query.page - 1) * query.limit} LIMIT ${query.limit}`,
      database.$queryRaw<{ total: bigint }[]>`SELECT COUNT(*) AS total ${from} ${where}`,
    ],
    { isolationLevel: 'RepeatableRead' },
  );

  const items: InventoryRow[] = records.map(
    ({ unitCost, salePriceUsd, lastPurchaseAt, ...record }) => ({
      ...record,
      salePriceUsd: salePriceUsd.toFixed(2),
      lastPurchaseAt: lastPurchaseAt?.toISOString() ?? null,
      ...(showCost ? { unitCostUsd: unitCost?.toFixed() ?? null } : {}),
      ...(showMargin
        ? { marginUsd: unitCost ? decimal(salePriceUsd).sub(unitCost).toFixed(2) : null }
        : {}),
    }),
  );
  return { items, total: Number(count[0]?.total ?? 0n) };
}
