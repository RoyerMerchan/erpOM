import type { ConfirmSaleInput, SessionUser } from '@max-sport/shared';
import { writeAudit } from '../audit/write.js';
import type { Database } from '../database.js';
import { HttpError } from '../http/errors.js';
import { applyFifo, changePhysical, lockVariants } from '../inventory/stock.js';
import { captureRate } from '../purchasing/rates.js';
import { digest, operation } from '../purchasing/transaction.js';
import type { Transaction } from '../purchasing/transaction.js';
import type { DiscountTerms } from './pricing.js';
import { prepareQuote, quoteCosts } from './quotes.js';

export const salesOperatorFilter = {
  active: true,
  mustChangePassword: false,
  role: { permissions: { some: { permission: { code: 'sales.create' } } } },
} as const;

async function participants(tx: Transaction, input: ConfirmSaleInput['sale'], actor: SessionUser) {
  const sellerId = input.sellerId ?? actor.id;
  if (sellerId !== actor.id && !actor.permissions.includes('sales.assign')) {
    throw new HttpError(403, 'PERMISSION_DENIED', 'Tu rol no permite elegir a otro vendedor.');
  }
  if (input.customerId && !actor.permissions.includes('customers.read')) {
    throw new HttpError(403, 'PERMISSION_DENIED', 'Tu rol no permite seleccionar un cliente.');
  }
  const [seller, customer, shop] = await Promise.all([
    tx.user.findFirst({
      where: { id: sellerId, ...salesOperatorFilter },
      select: { displayName: true },
    }),
    input.customerId
      ? tx.customer.findFirst({
          where: { id: input.customerId, active: true },
          select: { name: true },
        })
      : null,
    tx.shopSettings.findUnique({ where: { id: 1 }, select: { name: true } }),
  ]);
  if (!seller) throw new HttpError(409, 'SELLER_INACTIVE', 'Selecciona un vendedor habilitado.');
  if (input.customerId && !customer)
    throw new HttpError(409, 'CUSTOMER_INACTIVE', 'El cliente seleccionado está archivado.');
  if (!shop)
    throw new HttpError(409, 'SHOP_REQUIRED', 'Configura la tienda antes de registrar ventas.');

  return {
    sellerId,
    sellerName: seller.displayName,
    customerId: input.customerId,
    customerName: customer?.name ?? 'Consumidor final',
    shopName: shop.name,
  };
}

async function persistDiscount(
  tx: Transaction,
  saleId: string,
  saleItemId: string | null,
  terms: DiscountTerms,
  amountUsd: string,
  at: Date,
  actorId: string,
) {
  if (terms.kind === 'PERCENT') {
    await tx.saleDiscount.create({ data: { saleId, saleItemId, ...terms, amountUsd } });
    return;
  }
  const exchangeRateId = await captureRate(tx, terms.currencyCode, terms.unitsPerUsd, at, actorId);
  await tx.saleDiscount.create({
    data: { saleId, saleItemId, ...terms, amountUsd, exchangeRateId },
  });
}

export function confirmSale(database: Database, request: ConfirmSaleInput, actor: SessionUser) {
  const { sale: input, quoteDigest, operationId } = request;
  const hash = digest({ input, quoteDigest });
  return operation(database, async (tx) => {
    const existing = await tx.sale.findUnique({
      where: { operationKey: operationId },
      select: { id: true, actorId: true, operationDigest: true },
    });
    if (existing) {
      if (existing.actorId === actor.id && existing.operationDigest === hash) return existing.id;
      throw new HttpError(
        409,
        'IDEMPOTENCY_CONFLICT',
        'La clave de operación ya se usó con otros datos.',
      );
    }

    await lockVariants(
      tx,
      input.items.map(({ variantId }) => variantId),
    );
    const people = await participants(tx, input, actor);
    const prepared = await prepareQuote(tx, input, actor);
    const { quote, items, discounts, globalDiscount, globalDiscountUsd } = prepared;
    if (quote.quoteDigest !== quoteDigest) {
      throw new HttpError(
        409,
        'QUOTE_CHANGED',
        'Los datos de la venta cambiaron. Calcula la vista previa de nuevo.',
      );
    }
    if (!quote.ready) {
      throw new HttpError(
        409,
        'PAYMENT_MISMATCH',
        'La venta requiere un cobro neto exacto. Revisa los pagos y el vuelto.',
      );
    }
    const { plans, cogsUsd, grossProfitUsd } = await quoteCosts(tx, quote);
    const confirmedAt = new Date();
    const sale = await tx.sale.create({
      data: {
        ...people,
        actorId: actor.id,
        notes: input.notes,
        confirmedAt,
        cogsUsd,
        grossProfitUsd,
        subtotalUsd: quote.subtotalUsd,
        discountUsd: quote.discountUsd,
        totalUsd: quote.totalUsd,
        operationKey: operationId,
        operationDigest: hash,
      },
      select: { id: true, receiptNumber: true },
    });

    for (const [position, line] of items.entries()) {
      const plan = plans[position];
      if (!plan) throw new Error('Falta una asignación FIFO.');
      const saved = await tx.saleItem.create({
        data: { ...line, saleId: sale.id, position, cogsUsd: plan.totalUsd },
        select: { id: true },
      });
      await changePhysical(tx, line.variantId, -line.quantity);
      const movement = await tx.stockMovement.create({
        data: {
          variantId: line.variantId,
          saleItemId: saved.id,
          kind: 'SALE_OUT',
          quantityDelta: -line.quantity,
          actorId: actor.id,
          occurredAt: confirmedAt,
        },
        select: { id: true },
      });
      await applyFifo(tx, plan, movement.id);
      const discount = discounts[position];
      if (discount)
        await persistDiscount(
          tx,
          sale.id,
          saved.id,
          discount,
          line.lineDiscountUsd,
          confirmedAt,
          actor.id,
        );
    }
    if (globalDiscount) {
      await persistDiscount(
        tx,
        sale.id,
        null,
        globalDiscount,
        globalDiscountUsd,
        confirmedAt,
        actor.id,
      );
    }
    for (const [position, tender] of quote.tenders.entries()) {
      const exchangeRateId = await captureRate(
        tx,
        tender.currencyCode,
        tender.unitsPerUsd,
        confirmedAt,
        actor.id,
      );
      const saved = await tx.saleTender.create({
        data: { ...tender, saleId: sale.id, position, exchangeRateId },
        select: { id: true },
      });
      await tx.moneyMovement.create({
        data: {
          kind: tender.kind === 'PAYMENT' ? 'SALE_PAYMENT' : 'SALE_CHANGE',
          saleTenderId: saved.id,
          accountId: tender.accountId,
          currencyCode: tender.currencyCode,
          unitsPerUsd: tender.unitsPerUsd,
          amountOriginal: tender.amountOriginal,
          amountUsd: tender.amountUsd,
          actorId: actor.id,
          occurredAt: confirmedAt,
        },
      });
    }
    await writeAudit(tx, actor.id, {
      action: 'sales.confirm',
      entity: 'Sale',
      entityId: sale.id,
      after: {
        receiptNumber: sale.receiptNumber.toString(),
        sellerId: people.sellerId,
        pairs: quote.items.reduce((count, item) => count + item.quantity, 0),
      },
    });
    return sale.id;
  });
}
