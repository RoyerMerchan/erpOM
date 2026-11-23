import { Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../http/errors.js';
import { cents, decimal } from '../purchasing/money.js';
import type { Transaction } from '../purchasing/transaction.js';

export async function lockVariants(tx: Transaction, ids: string[]) {
  if (!ids.length) return;
  await tx.$queryRaw`SELECT "id" FROM "product_variants"
    WHERE "id" IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
    ORDER BY "id" FOR UPDATE`;
}

export async function changePhysical(tx: Transaction, variantId: string, delta: number) {
  const previous = await tx.inventoryBalance.findUnique({ where: { variantId } });
  const physical = (previous?.physical ?? 0) + delta;
  const reserved = previous?.reserved ?? 0;
  if (physical < reserved) {
    throw new HttpError(
      409,
      'INSUFFICIENT_STOCK',
      'La cantidad excede el stock disponible de la talla.',
    );
  }
  if (physical > 2_147_483_647) {
    throw new HttpError(
      409,
      'STOCK_LIMIT',
      'La cantidad supera el máximo admitido para la variante.',
    );
  }
  return tx.inventoryBalance.upsert({
    where: { variantId },
    update: { physical },
    create: { variantId, physical },
  });
}

export async function consumeFifo(
  tx: Transaction,
  variantId: string,
  quantity: number,
  movementId: string,
) {
  const lots = await tx.inventoryLot.findMany({
    where: { variantId, remainingQuantity: { gt: 0 } },
    orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
  });
  let pending = quantity;
  for (const lot of lots) {
    if (!pending) break;
    const applied = Math.min(pending, lot.remainingQuantity);
    const remainingCost = decimal(lot.remainingCostUsd);
    const proportionalCost = cents(decimal(lot.totalCostUsd).mul(applied).div(lot.initialQuantity));
    const cost =
      applied === lot.remainingQuantity || proportionalCost.gt(remainingCost)
        ? remainingCost
        : proportionalCost;
    await tx.inventoryLot.update({
      where: { id: lot.id },
      data: {
        remainingQuantity: { decrement: applied },
        remainingCostUsd: remainingCost.sub(cost).toFixed(2),
      },
    });
    await tx.stockLotAllocation.create({
      data: { movementId, lotId: lot.id, quantity: applied, costUsd: cost.toFixed(2) },
    });
    pending -= applied;
  }
  if (pending)
    throw new HttpError(
      409,
      'STOCK_INCONSISTENT',
      'Los lotes no cubren el movimiento de existencias.',
    );
}
