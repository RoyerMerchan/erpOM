import type { SaleDiscountInput, SaleInput, SalePreview, SessionUser } from '@max-sport/shared';
import { HttpError } from '../http/errors.js';
import { planFifo } from '../inventory/stock.js';
import { requireActiveCurrency } from '../master-data/accounts.js';
import { quoteTenders } from '../money/tender.js';
import { decimal, requiredRate, scaledAmount } from '../purchasing/money.js';
import { digest } from '../purchasing/transaction.js';
import type { Transaction } from '../purchasing/transaction.js';
import { priceCart, settlement } from './pricing.js';
import type { DiscountTerms } from './pricing.js';

import { quoteProducts } from './products.js';

async function discountTerms(
  tx: Transaction,
  discount: SaleDiscountInput | null,
): Promise<DiscountTerms | null> {
  if (!discount || discount.kind === 'PERCENT') return discount;
  const { currencyCode } = discount;
  const { minorUnits } = await requireActiveCurrency(tx, currencyCode);
  const original = scaledAmount(discount.amountOriginal, minorUnits, 'El descuento');
  return {
    kind: 'FIXED',
    currencyCode,
    amountOriginal: original.toFixed(),
    unitsPerUsd: requiredRate(currencyCode, discount.unitsPerUsd),
  };
}

export async function prepareQuote(tx: Transaction, input: SaleInput, actor: SessionUser) {
  if (
    !actor.permissions.includes('sales.discount') &&
    (input.globalDiscount || input.items.some((line) => line.discount))
  ) {
    throw new HttpError(403, 'PERMISSION_DENIED', 'Tu rol no permite aplicar descuentos.');
  }
  const products = await quoteProducts(tx, input.items);
  const tenders = await quoteTenders(tx, [
    ...input.payments.map((input) => ({ kind: 'PAYMENT' as const, input })),
    ...(input.change ? [{ kind: 'CHANGE' as const, input: input.change }] : []),
  ]);
  const lines = [];
  for (const [index, product] of products.entries()) {
    lines.push({
      ...product,
      discount: await discountTerms(tx, input.items[index]?.discount ?? null),
    });
  }

  const globalDiscount = await discountTerms(tx, input.globalDiscount);
  const pricing = priceCart(
    lines.map(({ product, discount }) => ({ ...product, discount })),
    globalDiscount,
  );
  const payments = tenders
    .filter(({ kind }) => kind === 'PAYMENT')
    .map(({ amountUsd }) => amountUsd);
  const change = tenders.find(({ kind }) => kind === 'CHANGE');
  const localTotal = input.displayQuote
    ? await localEquivalent(tx, input.displayQuote, pricing.totalUsd)
    : null;
  const { subtotalUsd, discountUsd, totalUsd } = pricing;
  const pricedLines = lines.map(({ product, available }, index) => {
    const priced = pricing.lines[index];
    if (!priced) throw new Error('Falta una línea calculada.');
    return { item: { ...product, ...priced }, available };
  });

  const publicParts = { subtotalUsd, discountUsd, totalUsd, tenders, localTotal };
  const fingerprint = digest({
    input,
    ...publicParts,
    items: pricedLines.map(({ item }) => item),
  });
  const quote: SalePreview = {
    ...publicParts,
    items: pricedLines.map(({ item, available }) => ({ ...item, available })),
    ...settlement(totalUsd, payments, change?.amountUsd ?? null),
    quoteDigest: fingerprint,
  };

  return {
    quote,
    items: pricedLines.map(({ item }) => item),
    discounts: lines.map(({ discount }) => discount),
    globalDiscount,
    globalDiscountUsd: pricing.globalDiscountUsd,
  };
}

async function localEquivalent(
  tx: Transaction,
  config: NonNullable<SaleInput['displayQuote']>,
  totalUsd: string,
) {
  const { minorUnits } = await requireActiveCurrency(tx, config.currencyCode);
  const unitsPerUsd = requiredRate(config.currencyCode, config.unitsPerUsd);
  return {
    currencyCode: config.currencyCode,
    unitsPerUsd,
    amount: decimal(totalUsd).mul(unitsPerUsd).toFixed(minorUnits),
  };
}

export async function quoteCosts(
  tx: Transaction,
  quote: { items: { variantId: string; quantity: number }[]; totalUsd: string },
) {
  const plans = [];
  for (const item of quote.items) plans.push(await planFifo(tx, item.variantId, item.quantity));
  const total = plans.reduce((sum, plan) => sum.add(plan.totalUsd), decimal(0));
  return {
    plans,
    cogsUsd: total.toFixed(2),
    grossProfitUsd: decimal(quote.totalUsd).sub(total).toFixed(2),
  };
}

export function canViewProfit(actor: SessionUser) {
  return actor.permissions.includes('costs.read') && actor.permissions.includes('profits.read');
}

export async function visiblePreview(tx: Transaction, input: SaleInput, actor: SessionUser) {
  const { quote } = await prepareQuote(tx, input, actor);
  if (!actor.permissions.includes('costs.read')) return quote;
  const { plans, cogsUsd, grossProfitUsd } = await quoteCosts(tx, quote);
  return {
    ...quote,
    cogsUsd,
    items: quote.items.map((item, index) => ({ ...item, cogsUsd: plans[index]?.totalUsd })),
    ...(canViewProfit(actor) ? { grossProfitUsd } : {}),
  };
}
