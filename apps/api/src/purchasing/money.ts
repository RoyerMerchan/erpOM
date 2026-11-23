import type { PurchaseInput, PurchasePreview } from '@max-sport/shared';
import { Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../http/errors.js';

const Decimal = Prisma.Decimal.clone({ precision: 72, rounding: Prisma.Decimal.ROUND_HALF_UP });
export const decimal = (value: string | number | Prisma.Decimal) => new Decimal(value.toString());
export const cents = (value: Prisma.Decimal) => value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

export function scaledAmount(value: string, minorUnits: number, label: string) {
  const amount = decimal(value);
  if (amount.decimalPlaces() > minorUnits) {
    throw new HttpError(
      400,
      'CURRENCY_PRECISION',
      label + ' admite hasta ' + minorUnits + ' decimales en esta moneda.',
    );
  }
  return amount;
}

export function resolvedRate(code: string, requested: string | null) {
  if (code === 'USD') {
    if (requested && !decimal(requested).eq(1)) {
      throw new HttpError(400, 'INVALID_RATE', 'Para USD, la tasa debe ser 1.');
    }
    return '1';
  }
  return requested ? decimal(requested).toFixed() : null;
}

export function requiredRate(code: string, requested: string | null) {
  const rate = resolvedRate(code, requested);
  if (!rate)
    throw new HttpError(
      409,
      'RATE_REQUIRED',
      'Confirma una tasa explícita para la moneda elegida.',
    );
  return rate;
}

function distributeFreight(freight: Prisma.Decimal, quantities: number[], minorUnits: number) {
  const pairs = BigInt(quantities.reduce((sum, quantity) => sum + quantity, 0));
  const minorFreight = BigInt(freight.toFixed(minorUnits).replace('.', ''));
  if (!minorFreight) return quantities.map(() => decimal(0));

  const weights = quantities.map((quantity, index) => {
    const product = minorFreight * BigInt(quantity);
    return { index, whole: product / pairs, residual: product % pairs };
  });
  let rest = minorFreight - weights.reduce((sum, weight) => sum + weight.whole, 0n);
  const byRemainder = [...weights].sort((a, b) =>
    a.residual === b.residual ? a.index - b.index : a.residual > b.residual ? -1 : 1,
  );
  for (const weight of byRemainder) {
    if (rest === 0n) break;
    weight.whole += 1n;
    rest -= 1n;
  }
  const divider = decimal(10).pow(minorUnits);
  return weights.map((weight) => decimal(weight.whole.toString()).div(divider));
}

export function previewPurchase(input: PurchaseInput, minorUnits: number): PurchasePreview {
  const rate = resolvedRate(input.currencyCode, input.unitsPerUsd);
  const freight = scaledAmount(input.freightOriginal, minorUnits, 'El flete');
  const entries = input.groups.flatMap((group, index) =>
    [...group.lines].sort((a, b) => a.size - b.size).map((line) => ({ ...line, group: index })),
  );
  const shares = distributeFreight(
    freight,
    entries.map((line) => line.quantity),
    minorUnits,
  );
  let subtotal = decimal(0);
  let totalUsd = decimal(0);
  let pairCount = 0;
  const lines = entries.map((line, index) => {
    const originalCost = scaledAmount(line.unitCostOriginal, minorUnits, 'El costo por par');
    const share = shares[index] ?? decimal(0);
    const goods = originalCost.mul(line.quantity);
    const totalOriginal = goods.add(share);
    const converted = rate ? cents(totalOriginal.div(rate)) : null;
    subtotal = subtotal.add(goods);
    if (converted) totalUsd = totalUsd.add(converted);
    pairCount += line.quantity;
    return {
      group: line.group,
      size: line.size,
      quantity: line.quantity,
      unitCostOriginal: originalCost.toFixed(minorUnits),
      freightOriginal: share.toFixed(minorUnits),
      totalOriginal: totalOriginal.toFixed(minorUnits),
      totalUsd: converted?.toFixed(2) ?? null,
      unitCostUsd: converted?.div(line.quantity).toDecimalPlaces(12).toFixed() ?? null,
    };
  });
  return {
    pairCount,
    unitsPerUsd: rate,
    subtotalOriginal: subtotal.toFixed(minorUnits),
    freightOriginal: freight.toFixed(minorUnits),
    totalOriginal: subtotal.add(freight).toFixed(minorUnits),
    totalUsd: rate ? totalUsd.toFixed(2) : null,
    lines,
  };
}
