import type { PurchaseInput, ReceiveInput, SessionUser } from '@max-sport/shared';
import { purchaseInput } from '@max-sport/shared';
import { writeAudit } from '../audit/write.js';
import { changePhysical, lockVariants } from '../inventory/stock.js';
import type { Database } from '../database.js';
import { HttpError } from '../http/errors.js';
import { receiveVariants } from './catalog.js';
import { previewPurchase, requiredRate } from './money.js';
import { recordPayment } from './payment.js';
import { requireActiveCurrency } from '../master-data/accounts.js';
import { captureRate } from './rates.js';
import { digest, operation } from './transaction.js';
import type { Transaction } from './transaction.js';

export async function lockPurchase(tx: Transaction, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "purchases" WHERE "id" = ${id}::uuid FOR UPDATE`;
  const purchase = await tx.purchase.findUnique({ where: { id } });
  if (!purchase) throw new HttpError(404, 'PURCHASE_NOT_FOUND', 'La compra no existe.');
  return purchase;
}

async function requireActiveSupplier(tx: Transaction, supplierId: string) {
  const supplier = await tx.supplier.findUnique({
    where: { id: supplierId },
    select: { active: true },
  });
  if (!supplier?.active)
    throw new HttpError(409, 'SUPPLIER_INACTIVE', 'Selecciona un proveedor habilitado.');
}

async function draftValues(tx: Transaction, input: PurchaseInput) {
  await requireActiveSupplier(tx, input.supplierId);
  const { minorUnits } = await requireActiveCurrency(tx, input.currencyCode);
  const { subtotalOriginal, freightOriginal, totalOriginal, totalUsd, pairCount, unitsPerUsd } =
    previewPurchase(input, minorUnits);
  return {
    supplierId: input.supplierId,
    documentAt: new Date(input.documentAt),
    reference: input.reference,
    notes: input.notes,
    currencyCode: input.currencyCode,
    minorUnits,
    unitsPerUsd,
    draftData: input,
    subtotalOriginal,
    freightOriginal,
    totalOriginal,
    totalUsd,
    pairCount,
  };
}

export async function saveDraft(
  database: Database,
  input: PurchaseInput,
  actorId: string,
  existing?: { id: string; revision: number },
) {
  return operation(database, async (tx) => {
    if (!existing) {
      const value = await tx.purchase.create({
        data: { ...(await draftValues(tx, input)), createdById: actorId },
      });
      await writeAudit(tx, actorId, {
        action: 'purchases.create',
        entity: 'Purchase',
        entityId: value.id,
        after: { status: value.status, pairCount: value.pairCount },
      });
      return value.id;
    }
    const before = await lockPurchase(tx, existing.id);
    if (before.status !== 'DRAFT') {
      throw new HttpError(409, 'PURCHASE_CLOSED', 'Solo se pueden editar los borradores.');
    }
    if (existing.revision !== before.revision) {
      throw new HttpError(
        409,
        'DRAFT_CHANGED',
        'El borrador cambió. Vuelve a abrirlo antes de guardar.',
      );
    }
    const value = await tx.purchase.update({
      where: { id: existing.id },
      data: { ...(await draftValues(tx, input)), revision: { increment: 1 } },
    });
    await writeAudit(tx, actorId, {
      action: 'purchases.update',
      entity: 'Purchase',
      entityId: value.id,
      before: { revision: before.revision, pairCount: before.pairCount },
      after: { revision: value.revision, pairCount: value.pairCount },
    });
    return value.id;
  });
}

export async function receivePurchase(
  database: Database,
  id: string,
  input: ReceiveInput,
  actor: SessionUser,
) {
  const fingerprint = digest(input);
  await operation(database, async (tx) => {
    const purchase = await lockPurchase(tx, id);
    if (purchase.confirmationKey === input.operationId) {
      if (purchase.confirmationDigest === fingerprint) return;
      throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'La operación ya se usó con otros datos.');
    }
    if (purchase.status !== 'DRAFT')
      throw new HttpError(409, 'PURCHASE_CLOSED', 'La compra ya no es un borrador.');
    if (purchase.revision !== input.revision) {
      throw new HttpError(
        409,
        'DRAFT_CHANGED',
        'El borrador cambió. Revisa los importes antes de confirmar.',
      );
    }

    await requireActiveSupplier(tx, purchase.supplierId);
    const { minorUnits } = await requireActiveCurrency(tx, purchase.currencyCode);
    if (minorUnits !== purchase.minorUnits) {
      throw new HttpError(
        409,
        'PRECISION_CHANGED',
        'Los decimales de la moneda cambiaron. Guarda de nuevo el borrador.',
      );
    }

    const draft = purchaseInput.parse(purchase.draftData);
    const rate = requiredRate(purchase.currencyCode, draft.unitsPerUsd);
    const preview = previewPurchase({ ...draft, unitsPerUsd: rate }, minorUnits);
    const exchangeRateId = await captureRate(
      tx,
      purchase.currencyCode,
      rate,
      purchase.documentAt,
      actor.id,
    );
    const picked = await receiveVariants(tx, draft.groups, actor);
    const receivedAt = new Date();

    for (const [index, line] of preview.lines.entries()) {
      const entry = picked[index];
      if (!entry || line.totalUsd === null || line.unitCostUsd === null)
        throw new Error('Compra calculada sin detalle.');
      const { id: variantId, sku } = entry.variant;
      const item = await tx.purchaseItem.create({
        data: {
          purchaseId: id,
          variantId,
          position: index,
          sku,
          size: line.size,
          quantity: line.quantity,
          brandName: entry.brandName,
          modelName: entry.modelName,
          color: entry.color,
          salePriceUsd: entry.salePriceUsd,
          unitCostOriginal: line.unitCostOriginal,
          freightOriginal: line.freightOriginal,
          totalOriginal: line.totalOriginal,
          totalUsd: line.totalUsd,
          unitCostUsd: line.unitCostUsd,
        },
      });

      await changePhysical(tx, variantId, line.quantity);
      await tx.inventoryLot.create({
        data: {
          variantId,
          purchaseItemId: item.id,
          receivedAt,
          initialQuantity: line.quantity,
          remainingQuantity: line.quantity,
          unitCostUsd: line.unitCostUsd,
          totalCostUsd: line.totalUsd,
          remainingCostUsd: line.totalUsd,
        },
      });
      await tx.stockMovement.create({
        data: {
          variantId,
          purchaseItemId: item.id,
          kind: 'RECEIPT',
          quantityDelta: line.quantity,
          actorId: actor.id,
          occurredAt: receivedAt,
        },
      });
    }

    const confirmed = await tx.purchase.update({
      where: { id },
      data: {
        status: 'CONFIRMED',
        exchangeRateId,
        unitsPerUsd: rate,
        totalUsd: preview.totalUsd,
        receivedAt,
        receivedById: actor.id,
        confirmationKey: input.operationId,
        confirmationDigest: fingerprint,
      },
    });
    if (input.initialPayment) await recordPayment(tx, confirmed, input.initialPayment, actor.id);
    await writeAudit(tx, actor.id, {
      action: 'purchases.confirm',
      entity: 'Purchase',
      entityId: id,
      before: { status: 'DRAFT' },
      after: { status: 'CONFIRMED', pairCount: purchase.pairCount, exchangeRateId },
    });
  });
}

export async function voidPurchase(
  database: Database,
  id: string,
  reason: string,
  actorId: string,
) {
  await operation(database, async (tx) => {
    const purchase = await lockPurchase(tx, id);
    if (purchase.status === 'VOIDED') {
      if (purchase.voidReason === reason) return;
      throw new HttpError(409, 'PURCHASE_VOIDED', 'La compra ya fue anulada con otro motivo.');
    }
    if (!purchase.paidUsd.isZero()) {
      throw new HttpError(
        409,
        'ACTIVE_PAYMENTS',
        'Registra la devolución o reversión de los pagos antes de anular.',
      );
    }
    const voidedAt = new Date();
    if (purchase.status === 'CONFIRMED') {
      const items = await tx.purchaseItem.findMany({
        where: { purchaseId: id },
        include: { lot: true },
      });
      await lockVariants(
        tx,
        items.map(({ variantId }) => variantId),
      );
      for (const item of items) {
        const lot = item.lot;
        if (!lot || lot.remainingQuantity !== lot.initialQuantity) {
          throw new HttpError(
            409,
            'LOT_USED',
            'La compra ya tiene un lote consumido y requiere una corrección de inventario.',
          );
        }
        await changePhysical(tx, item.variantId, -item.quantity);
        const movement = await tx.stockMovement.create({
          data: {
            variantId: item.variantId,
            purchaseItemId: item.id,
            quantityDelta: -item.quantity,
            kind: 'RECEIPT_REVERSAL',
            actorId,
            reason,
            occurredAt: voidedAt,
          },
        });
        await tx.stockLotAllocation.create({
          data: {
            movementId: movement.id,
            lotId: lot.id,
            quantity: item.quantity,
            costUsd: lot.remainingCostUsd,
          },
        });
        await tx.inventoryLot.update({
          where: { id: lot.id },
          data: { remainingQuantity: 0, remainingCostUsd: '0' },
        });
      }
    }
    await tx.purchase.update({
      where: { id },
      data: { status: 'VOIDED', voidedAt, voidedById: actorId, voidReason: reason },
    });
    await writeAudit(tx, actorId, {
      action: 'purchases.void',
      entity: 'Purchase',
      entityId: id,
      before: { status: purchase.status },
      after: { status: 'VOIDED', reason },
    });
  });
}
