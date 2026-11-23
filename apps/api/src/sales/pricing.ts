import type { Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../http/errors.js';
import { apportionUnits } from '../money/allocation.js';
import { cents, decimal } from '../purchasing/money.js';

export type DiscountTerms =
  | { kind: 'PERCENT'; percentage: string }
  | { kind: 'FIXED'; currencyCode: string; amountOriginal: string; unitsPerUsd: string };

export function priceDiscount(discount: DiscountTerms | null, basis: Prisma.Decimal) {
  if (!discount) return decimal(0);
  const exact =
    discount.kind === 'PERCENT'
      ? basis.mul(discount.percentage).div(100)
      : decimal(discount.amountOriginal).div(discount.unitsPerUsd);
  if (exact.gt(basis)) {
    throw new HttpError(
      400,
      'DISCOUNT_EXCEEDS_TOTAL',
      'El descuento supera el importe al que se aplica.',
    );
  }
  return cents(exact);
}

function countCents(value: Prisma.Decimal) {
  return BigInt(value.mul(100).toFixed(0));
}

export function priceCart(
  lines: { unitPriceUsd: string; quantity: number; discount: DiscountTerms | null }[],
  globalDiscount: DiscountTerms | null,
) {
  const priced = lines.map((line) => {
    const gross = decimal(line.unitPriceUsd).mul(line.quantity);
    const lineDiscount = priceDiscount(line.discount, gross);
    return { gross, lineDiscount, afterLine: gross.sub(lineDiscount) };
  });
  const subtotal = priced.reduce((sum, line) => sum.add(line.gross), decimal(0));
  const afterLines = priced.reduce((sum, line) => sum.add(line.afterLine), decimal(0));
  const global = priceDiscount(globalDiscount, afterLines);
  const shares = apportionUnits(
    countCents(global),
    priced.map((line) => countCents(line.afterLine)),
  ).map((value) => decimal(value.toString()).div(100));
  const net = afterLines.sub(global);

  return {
    subtotalUsd: subtotal.toFixed(2),
    discountUsd: subtotal.sub(net).toFixed(2),
    totalUsd: net.toFixed(2),
    globalDiscountUsd: global.toFixed(2),
    lines: priced.map((line, index) => {
      const share = shares[index] ?? decimal(0);
      return {
        grossUsd: line.gross.toFixed(2),
        lineDiscountUsd: line.lineDiscount.toFixed(2),
        globalDiscountUsd: share.toFixed(2),
        netUsd: line.afterLine.sub(share).toFixed(2),
      };
    }),
  };
}

export function settlement(totalUsd: string, payments: string[], changeUsd: string | null) {
  const total = decimal(totalUsd);
  const tendered = payments.reduce((sum, payment) => sum.add(payment), decimal(0));
  const change = decimal(changeUsd ?? '0');
  const net = tendered.sub(change);
  const difference = total.sub(net);
  const overpayment = tendered.sub(total);
  return {
    tenderedUsd: tendered.toFixed(2),
    changeDueUsd: overpayment.gt(0) ? overpayment.toFixed(2) : '0.00',
    changeUsd: change.toFixed(2),
    netCollectedUsd: net.toFixed(2),
    balanceDueUsd: difference.gt(0) ? difference.toFixed(2) : '0.00',
    ready: difference.isZero() && (!total.isZero() || tendered.isZero()),
  };
}
