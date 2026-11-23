import { writeAudit } from '../audit/write.js';
import type { SalePreview } from '@max-sport/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { applyFifo, changePhysical } from '../inventory/stock.js';
import { decimal } from '../purchasing/money.js';
import type { Transaction } from '../purchasing/transaction.js';
import { quoteCosts } from './quotes.js';

type PostingLine = Omit<SalePreview['items'][number], 'available' | 'cogsUsd'>;
type Product = Omit<PostingLine, 'grossUsd' | 'netUsd' | 'lineDiscountUsd' | 'globalDiscountUsd'>;
type SalePosting = Pick<
  Prisma.SaleUncheckedCreateInput,
  | 'customerId'
  | 'customerName'
  | 'shopName'
  | 'sellerId'
  | 'sellerName'
  | 'actorId'
  | 'notes'
  | 'operationKey'
  | 'operationDigest'
  | 'layawayId'
  | 'exchangeId'
> & { subtotalUsd: string; discountUsd: string; totalUsd: string; confirmedAt: Date };

export function fullPriceLine(product: Product): PostingLine {
  const amount = decimal(product.unitPriceUsd).mul(product.quantity).toFixed(2);
  return {
    ...product,
    grossUsd: amount,
    netUsd: amount,
    lineDiscountUsd: '0.00',
    globalDiscountUsd: '0.00',
  };
}

export async function postSale(tx: Transaction, data: SalePosting, items: PostingLine[]) {
  const { plans, cogsUsd, grossProfitUsd } = await quoteCosts(tx, {
    items,
    totalUsd: data.totalUsd,
  });
  const sale = await tx.sale.create({
    data: { ...data, cogsUsd, grossProfitUsd },
    select: { id: true, receiptNumber: true },
  });
  const itemIds: string[] = [];
  for (const [position, item] of items.entries()) {
    const plan = plans[position];
    if (!plan) throw new Error('Falta una asignación FIFO.');
    const saved = await tx.saleItem.create({
      data: { ...item, saleId: sale.id, position, cogsUsd: plan.totalUsd },
      select: { id: true },
    });
    await changePhysical(tx, item.variantId, -item.quantity);
    const movement = await tx.stockMovement.create({
      data: {
        variantId: item.variantId,
        saleItemId: saved.id,
        kind: 'SALE_OUT',
        quantityDelta: -item.quantity,
        actorId: data.actorId,
        occurredAt: data.confirmedAt,
      },
      select: { id: true },
    });
    await applyFifo(tx, plan, movement.id);
    itemIds.push(saved.id);
  }
  await writeAudit(tx, data.actorId, {
    action: 'sales.confirm',
    entity: 'Sale',
    entityId: sale.id,
    after: {
      receiptNumber: sale.receiptNumber.toString(),
      sellerId: data.sellerId,
      pairs: items.reduce((count, item) => count + item.quantity, 0),
    },
  });
  return { ...sale, itemIds };
}
