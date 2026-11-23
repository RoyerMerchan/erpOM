import type { Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../http/errors.js';
import type { Transaction } from '../purchasing/transaction.js';

const select = {
  id: true,
  active: true,
  sku: true,
  size: true,
  color: true,
  salePriceUsd: true,
  model: { select: { name: true, active: true, brand: { select: { name: true, active: true } } } },
  inventory: { select: { physical: true, reserved: true } },
} satisfies Prisma.ProductVariantSelect;

export async function quoteProducts(
  tx: Transaction,
  lines: { variantId: string; quantity: number; expectedPriceUsd?: string }[],
) {
  if (!lines.length) return [];
  const variants = await tx.productVariant.findMany({
    where: { id: { in: lines.map(({ variantId }) => variantId) } },
    select,
  });
  const byId = new Map(variants.map((variant) => [variant.id, variant]));
  return lines.map(({ variantId, quantity, expectedPriceUsd }) => {
    const variant = byId.get(variantId);
    if (!variant?.active || !variant.model.active || !variant.model.brand.active) {
      throw new HttpError(409, 'VARIANT_INACTIVE', 'Una variante del carrito ya no está activa.');
    }
    const available = (variant.inventory?.physical ?? 0) - (variant.inventory?.reserved ?? 0);
    if (available < quantity) {
      throw new HttpError(
        409,
        'INSUFFICIENT_STOCK',
        variant.model.name +
          ' talla ' +
          variant.size +
          ' tiene ' +
          available +
          ' pares disponibles.',
      );
    }
    if (expectedPriceUsd && !variant.salePriceUsd.eq(expectedPriceUsd)) {
      throw new HttpError(
        409,
        'QUOTE_CHANGED',
        'El precio cambió. Retira la talla del carrito y selecciónala de nuevo.',
      );
    }
    return {
      available,
      product: {
        variantId,
        quantity,
        sku: variant.sku,
        size: variant.size,
        color: variant.color,
        modelName: variant.model.name,
        brandName: variant.model.brand.name,
        unitPriceUsd: variant.salePriceUsd.toFixed(2),
      },
    };
  });
}
