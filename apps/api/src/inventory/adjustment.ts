import type { InventoryAdjustment, SessionUser } from '@max-sport/shared';
import { writeAudit } from '../audit/write.js';
import type { Database } from '../database.js';
import { HttpError } from '../http/errors.js';
import { decimal } from '../purchasing/money.js';
import { digest, operation } from '../purchasing/transaction.js';
import { changePhysical, consumeFifo, lockVariants } from './stock.js';

export async function adjustInventory(
  database: Database,
  id: string,
  input: InventoryAdjustment,
  actor: SessionUser,
) {
  const fingerprint = digest({ id, input });
  if (input.quantityDelta > 0 && !actor.permissions.includes('costs.read')) {
    throw new HttpError(
      403,
      'PERMISSION_DENIED',
      'El costo de una entrada requiere permiso de costos.',
    );
  }
  return operation(database, async (tx) => {
    await lockVariants(tx, [id]);
    const existing = await tx.stockMovement.findUnique({
      where: { operationKey: input.operationId },
      select: { id: true, operationDigest: true },
    });
    if (existing) {
      if (existing.operationDigest !== fingerprint)
        throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'La operación ya se usó con otros datos.');
      return existing.id;
    }
    const variant = await tx.productVariant.findUnique({
      where: { id },
      select: {
        active: true,
        model: { select: { active: true, brand: { select: { active: true } } } },
      },
    });
    if (!variant) throw new HttpError(404, 'RECORD_NOT_FOUND', 'La variante no existe.');
    if (
      input.quantityDelta > 0 &&
      (!variant.active || !variant.model.active || !variant.model.brand.active)
    ) {
      throw new HttpError(
        409,
        'VARIANT_INACTIVE',
        'La variante, su modelo y su marca deben estar activos.',
      );
    }

    const { quantityDelta, reason, unitCostUsd } = input;
    const balance = await changePhysical(tx, id, quantityDelta);
    const occurredAt = new Date();
    const movement = await tx.stockMovement.create({
      data: {
        variantId: id,
        occurredAt,
        quantityDelta,
        kind: quantityDelta > 0 ? 'ADJUST_IN' : 'ADJUST_OUT',
        reason,
        actorId: actor.id,
        operationKey: input.operationId,
        operationDigest: fingerprint,
      },
    });
    if (unitCostUsd) {
      const total = decimal(unitCostUsd).mul(quantityDelta).toFixed(2);
      const lot = await tx.inventoryLot.create({
        data: {
          variantId: id,
          receivedAt: occurredAt,
          initialQuantity: quantityDelta,
          remainingQuantity: quantityDelta,
          unitCostUsd,
          totalCostUsd: total,
          remainingCostUsd: total,
        },
      });
      await tx.stockLotAllocation.create({
        data: { movementId: movement.id, lotId: lot.id, quantity: quantityDelta, costUsd: total },
      });
    } else {
      await consumeFifo(tx, id, -quantityDelta, movement.id);
    }
    await writeAudit(tx, actor.id, {
      action: 'inventory.adjust',
      entity: 'ProductVariant',
      entityId: id,
      before: { physical: balance.physical - quantityDelta, reserved: balance.reserved },
      after: {
        physical: balance.physical,
        reserved: balance.reserved,
        movementId: movement.id,
        reason,
      },
    });
    return movement.id;
  });
}
