import type { ConfirmSaleInput, SessionUser } from '@max-sport/shared';
import { visibleUser } from '../auth/session.js';
import type { Database } from '../database.js';
import { HttpError } from '../http/errors.js';
import { lockVariants } from '../inventory/stock.js';
import { postTenderMovement } from '../money/tender.js';
import { captureRate } from '../purchasing/rates.js';
import { digest, operation } from '../purchasing/transaction.js';
import type { Transaction } from '../purchasing/transaction.js';
import type { DiscountTerms } from './pricing.js';
import { postSale } from './post.js';
import { prepareQuote } from './quotes.js';

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
  const seller = await tx.user.findFirst({
    where: { id: sellerId, ...salesOperatorFilter, ...visibleUser(actor.id) },
    select: { displayName: true },
  });
  const customer = input.customerId
    ? await tx.customer.findFirst({
        where: { id: input.customerId, active: true },
        select: { name: true },
      })
    : null;
  const shop = await tx.shopSettings.findUnique({ where: { id: 1 }, select: { name: true } });
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
    const confirmedAt = new Date();
    const sale = await postSale(
      tx,
      {
        ...people,
        actorId: actor.id,
        notes: input.notes,
        confirmedAt,
        subtotalUsd: quote.subtotalUsd,
        discountUsd: quote.discountUsd,
        totalUsd: quote.totalUsd,
        operationKey: operationId,
        operationDigest: hash,
      },
      items,
    );
    for (const [position, discount] of discounts.entries()) {
      const itemId = sale.itemIds[position];
      const line = items[position];
      if (discount && itemId && line)
        await persistDiscount(
          tx,
          sale.id,
          itemId,
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
      await postTenderMovement(
        tx,
        tender,
        {
          kind: tender.kind === 'PAYMENT' ? 'SALE_PAYMENT' : 'SALE_CHANGE',
          saleTenderId: saved.id,
        },
        actor.id,
        confirmedAt,
      );
    }
    return sale.id;
  });
}
