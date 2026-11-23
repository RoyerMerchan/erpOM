import { randomUUID } from 'node:crypto';
import type { ConfirmCorrectionInput, SessionUser } from '@max-sport/shared';
import { writeAudit } from '../audit/write.js';
import type { Database } from '../database.js';
import { HttpError } from '../http/errors.js';
import { changePhysical, lockVariants } from '../inventory/stock.js';
import { postTenderMovement } from '../money/tender.js';
import { captureRate } from '../purchasing/rates.js';
import { digest, operation } from '../purchasing/transaction.js';
import { postSale } from '../sales/post.js';
import { originalSale, prepareCorrection } from './quote.js';

export function confirmCorrection(db: Database, input: ConfirmCorrectionInput, actor: SessionUser) {
  const { operationId, correction, quoteDigest } = input;
  const fingerprint = digest({ correction, quoteDigest });
  return operation(db, async (tx) => {
    const existing = await tx.saleCorrection.findUnique({
      where: { operationKey: operationId },
      select: { id: true, actorId: true, operationDigest: true },
    });
    if (existing) {
      if (existing.actorId === actor.id && existing.operationDigest === fingerprint)
        return existing.id;
      throw new HttpError(
        409,
        'IDEMPOTENCY_CONFLICT',
        'La clave de operación ya se usó con otros datos.',
      );
    }
    await tx.$queryRaw`SELECT id FROM sales WHERE id = ${correction.saleId}::uuid FOR UPDATE`;
    const source = await originalSale(tx, correction.saleId, actor);
    const selected = new Set(correction.items.map(({ saleItemId }) => saleItemId));
    await lockVariants(tx, [
      ...source.items.filter(({ id }) => selected.has(id)).map(({ variantId }) => variantId),
      ...correction.replacement.map(({ variantId }) => variantId),
    ]);
    const { quote, lines, replacement, restoredCogsUsd } = await prepareCorrection(
      tx,
      correction,
      source,
    );
    if (quote.quoteDigest !== quoteDigest)
      throw new HttpError(
        409,
        'QUOTE_CHANGED',
        'Los datos cambiaron. Calcula la vista previa de nuevo.',
      );
    if (!quote.ready)
      throw new HttpError(
        409,
        'PAYMENT_MISMATCH',
        'El cobro o reembolso debe coincidir con la diferencia en USD.',
      );
    const createdAt = new Date();
    const kind = replacement.length ? 'EXCHANGE' : 'RETURN';
    const record = await tx.saleCorrection.create({
      data: {
        operationKey: operationId,
        operationDigest: fingerprint,
        saleId: source.id,
        actorId: actor.id,
        actorName: actor.displayName,
        kind,
        reason: correction.reason,
        notes: correction.notes,
        returnedUsd: quote.returnedUsd,
        restoredCogsUsd,
        replacementTotalUsd: quote.replacementTotalUsd,
        differenceUsd: quote.differenceUsd,
        createdAt,
      },
      select: { id: true },
    });
    for (const [position, line] of lines.entries()) {
      const { saleItemId, condition, quantity, creditUsd } = line.publicLine;
      const item = await tx.saleCorrectionItem.create({
        data: {
          saleItemId,
          condition,
          quantity,
          creditUsd,
          position,
          correctionId: record.id,
          restoredCogsUsd: line.restoredCogsUsd,
        },
        select: { id: true },
      });
      if (condition === 'SELLABLE') {
        await changePhysical(tx, line.variantId, quantity);
        await tx.stockMovement.create({
          data: {
            variantId: line.variantId,
            correctionItemId: item.id,
            kind: 'SALE_RETURN_IN',
            quantityDelta: quantity,
            actorId: actor.id,
            occurredAt: createdAt,
          },
        });
        await tx.inventoryLot.createMany({
          data: line.lots.map(({ originLotId, quantity, costUsd }) => ({
            originLotId,
            correctionItemId: item.id,
            variantId: line.variantId,
            receivedAt: createdAt,
            initialQuantity: quantity,
            remainingQuantity: quantity,
            totalCostUsd: costUsd,
            remainingCostUsd: costUsd,
            unitCostUsd: costUsd.div(quantity).toDecimalPlaces(12),
          })),
        });
      }
    }
    if (replacement.length) {
      await postSale(
        tx,
        {
          exchangeId: record.id,
          notes: null,
          operationKey: randomUUID(),
          operationDigest: fingerprint,
          confirmedAt: createdAt,
          actorId: actor.id,
          sellerId: source.sellerId,
          sellerName: source.sellerName,
          customerId: source.customerId,
          customerName: source.customerName,
          shopName: source.shopName,
          subtotalUsd: quote.replacementTotalUsd,
          totalUsd: quote.replacementTotalUsd,
          discountUsd: '0.00',
        },
        replacement,
      );
    }
    for (const [position, tender] of quote.tenders.entries()) {
      const exchangeRateId = await captureRate(
        tx,
        tender.currencyCode,
        tender.unitsPerUsd,
        createdAt,
        actor.id,
      );
      const saved = await tx.correctionTender.create({
        data: { ...tender, correctionId: record.id, position, exchangeRateId },
        select: { id: true },
      });
      await postTenderMovement(
        tx,
        tender,
        {
          kind: tender.kind === 'PAYMENT' ? 'EXCHANGE_PAYMENT' : 'SALE_REFUND',
          correctionTenderId: saved.id,
        },
        actor.id,
        createdAt,
      );
    }
    await writeAudit(tx, actor.id, {
      action: kind === 'EXCHANGE' ? 'returns.exchange' : 'returns.confirm',
      entity: 'SaleCorrection',
      entityId: record.id,
      after: {
        saleId: source.id,
        reasonProvided: true,
        returnedPairs: lines.reduce((total, line) => total + line.publicLine.quantity, 0),
      },
    });
    return record.id;
  });
}
