import type { SaleDiscountInput, SaleInput, SalePreview, SessionUser } from '@max-sport/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../http/errors.js';
import { planFifo } from '../inventory/stock.js';
import { requireActiveCurrency } from '../master-data/accounts.js';
import { cents, decimal, requiredRate, scaledAmount } from '../purchasing/money.js';
import { digest } from '../purchasing/transaction.js';
import type { Transaction } from '../purchasing/transaction.js';
import { priceCart, settlement } from './pricing.js';
import type { DiscountTerms } from './pricing.js';

const variantSelect = {
  id: true,
  active: true,
  sku: true,
  size: true,
  color: true,
  salePriceUsd: true,
  model: { select: { name: true, active: true, brand: { select: { name: true, active: true } } } },
  inventory: { select: { physical: true, reserved: true } },
} satisfies Prisma.ProductVariantSelect;
const accountSelect = {
  id: true,
  active: true,
  name: true,
  kind: true,
  currencyCode: true,
  currency: { select: { active: true, minorUnits: true } },
} satisfies Prisma.MoneyAccountSelect;

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

function normalizeTenders(
  input: SaleInput,
  rows: Prisma.MoneyAccountGetPayload<{ select: typeof accountSelect }>[],
) {
  const accounts = new Map(rows.map((item) => [item.id, item]));
  const entries = [
    ...input.payments.map((payment) => ({ kind: 'PAYMENT' as const, payment })),
    ...(input.change ? [{ kind: 'CHANGE' as const, payment: input.change }] : []),
  ];
  return entries.map(({ kind, payment }) => {
    const account = accounts.get(payment.accountId);
    if (!account?.active || !account.currency.active) {
      throw new HttpError(409, 'ACCOUNT_INACTIVE', 'Selecciona una cuenta y moneda habilitadas.');
    }
    if (kind === 'CHANGE' && account.kind !== 'CASH') {
      throw new HttpError(
        400,
        'CHANGE_ACCOUNT',
        'Selecciona una caja de efectivo para entregar el vuelto.',
      );
    }
    const rate = requiredRate(account.currencyCode, payment.unitsPerUsd);
    const original = scaledAmount(
      payment.amountOriginal,
      account.currency.minorUnits,
      'El importe',
    );
    const usd = cents(original.div(rate));
    if (usd.lte(0))
      throw new HttpError(
        400,
        'PAYMENT_ROUNDING',
        'El importe se redondea a menos de un centavo USD.',
      );
    return {
      kind,
      accountId: account.id,
      accountName: account.name,
      currencyCode: account.currencyCode,
      amountOriginal: original.toFixed(),
      unitsPerUsd: rate,
      amountUsd: usd.toFixed(2),
      reference: payment.reference,
    };
  });
}

export async function prepareQuote(tx: Transaction, input: SaleInput, actor: SessionUser) {
  if (
    !actor.permissions.includes('sales.discount') &&
    (input.globalDiscount || input.items.some((line) => line.discount))
  ) {
    throw new HttpError(403, 'PERMISSION_DENIED', 'Tu rol no permite aplicar descuentos.');
  }
  const accountIds = [
    ...input.payments.map(({ accountId }) => accountId),
    ...(input.change ? [input.change.accountId] : []),
  ];
  const [variants, accounts] = await Promise.all([
    tx.productVariant.findMany({
      where: { id: { in: input.items.map(({ variantId }) => variantId) } },
      select: variantSelect,
    }),
    tx.moneyAccount.findMany({ where: { id: { in: accountIds } }, select: accountSelect }),
  ]);
  const byId = new Map(variants.map((variant) => [variant.id, variant]));
  const lines = await Promise.all(
    input.items.map(async ({ variantId, quantity, discount }) => {
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
        discount: await discountTerms(tx, discount),
      };
    }),
  );

  const globalDiscount = await discountTerms(tx, input.globalDiscount);
  const pricing = priceCart(
    lines.map(({ product, discount }) => ({ ...product, discount })),
    globalDiscount,
  );
  const tenders = normalizeTenders(input, accounts);
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

export async function quoteCosts(tx: Transaction, quote: SalePreview) {
  const plans = await Promise.all(
    quote.items.map((item) => planFifo(tx, item.variantId, item.quantity)),
  );
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
