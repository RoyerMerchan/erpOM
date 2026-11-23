import { z } from 'zod';
import { currencyCodeSchema, unitsPerUsdSchema } from './master-data.js';
import { originalMoneySchema, purchaseQuerySchema } from './purchasing.js';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null);
const date = z.iso.datetime({ offset: true });
const nullableId = z
  .uuid()
  .nullish()
  .transform((value) => value ?? null);
const positiveMoney = originalMoneySchema.refine(
  (value) => /[1-9]/.test(value),
  'El importe debe ser mayor que cero.',
);
const percentage = z
  .string()
  .trim()
  .regex(/^(?:\d{1,2}(?:\.\d{1,4})?|100(?:\.0{1,4})?)$/, 'Ingresa un porcentaje entre 0 y 100.')
  .refine((value) => /[1-9]/.test(value), 'El porcentaje debe ser mayor que cero.');

export const saleDiscountInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('PERCENT'), percentage }),
  z.object({
    kind: z.literal('FIXED'),
    currencyCode: currencyCodeSchema,
    amountOriginal: positiveMoney,
    unitsPerUsd: unitsPerUsdSchema.nullable().default(null),
  }),
]);
export const saleTenderInput = z.object({
  accountId: z.uuid('Selecciona la cuenta.'),
  amountOriginal: positiveMoney,
  unitsPerUsd: unitsPerUsdSchema.nullable().default(null),
  reference: optionalText(120),
});
export const saleInput = z
  .object({
    customerId: nullableId,
    sellerId: nullableId,
    notes: optionalText(2_000),
    items: z
      .array(
        z.object({
          variantId: z.uuid('Selecciona una variante.'),
          quantity: z.number().int().min(1).max(100_000),
          discount: saleDiscountInput.nullable().default(null),
        }),
      )
      .min(1, 'Agrega al menos un producto al carrito.')
      .max(100),
    globalDiscount: saleDiscountInput.nullable().default(null),
    payments: z.array(saleTenderInput).max(20).default([]),
    change: saleTenderInput.nullable().default(null),
    displayQuote: z
      .object({
        currencyCode: currencyCodeSchema,
        unitsPerUsd: unitsPerUsdSchema.nullable().default(null),
      })
      .nullable()
      .default(null),
  })
  .refine(({ items }) => new Set(items.map(({ variantId }) => variantId)).size === items.length, {
    path: ['items'],
    message: 'Combina las cantidades de la misma variante en una sola línea.',
  });
export const confirmSaleInput = z.object({
  operationId: z.uuid(),
  quoteDigest: z.string().regex(/^[a-f0-9]{64}$/),
  sale: saleInput,
});
export const saleQuery = purchaseQuerySchema
  .omit({ status: true })
  .extend({
    from: date.optional(),
    to: date.optional(),
    sellerId: z.uuid().optional(),
    customerId: z.uuid().optional(),
    currencyCode: currencyCodeSchema.optional(),
  })
  .refine(({ from, to }) => !from || !to || new Date(from) < new Date(to), {
    path: ['to'],
    message: 'La fecha final debe ser posterior a la inicial.',
  });

const totals = z.object({
  subtotalUsd: z.string(),
  discountUsd: z.string(),
  totalUsd: z.string(),
  cogsUsd: z.string().optional(),
  grossProfitUsd: z.string().optional(),
});
const item = z.object({
  variantId: z.uuid(),
  brandName: z.string(),
  modelName: z.string(),
  sku: z.string(),
  size: z.number().int(),
  color: z.string().nullable(),
  quantity: z.number().int(),
  unitPriceUsd: z.string(),
  grossUsd: z.string(),
  lineDiscountUsd: z.string(),
  globalDiscountUsd: z.string(),
  netUsd: z.string(),
  cogsUsd: z.string().optional(),
});
const tender = z.object({
  kind: z.enum(['PAYMENT', 'CHANGE']),
  accountName: z.string(),
  accountId: z.uuid(),
  currencyCode: z.string(),
  amountOriginal: z.string(),
  unitsPerUsd: z.string(),
  amountUsd: z.string(),
  reference: z.string().nullable(),
});
const discount = z.object({
  saleItemId: z.uuid().nullable(),
  kind: z.enum(['PERCENT', 'FIXED']),
  percentage: z.string().nullable(),
  currencyCode: z.string().nullable(),
  amountOriginal: z.string().nullable(),
  unitsPerUsd: z.string().nullable(),
  amountUsd: z.string(),
});
export const salePreviewSchema = totals.extend({
  items: z.array(item.extend({ available: z.number().int() })),
  tenders: z.array(tender),
  tenderedUsd: z.string(),
  changeDueUsd: z.string(),
  changeUsd: z.string(),
  netCollectedUsd: z.string(),
  balanceDueUsd: z.string(),
  ready: z.boolean(),
  quoteDigest: z.string(),
  localTotal: z
    .object({ amount: z.string(), currencyCode: z.string(), unitsPerUsd: z.string() })
    .nullable(),
});
export const saleSummarySchema = totals.extend({
  id: z.uuid(),
  receiptNumber: z.string(),
  customerName: z.string(),
  sellerName: z.string(),
  confirmedAt: date,
  pairCount: z.number().int(),
  adjustedTotalUsd: z.string().optional(),
  adjustedCogsUsd: z.string().optional(),
  adjustedProfitUsd: z.string().optional(),
});
export const saleCorrectionBrief = z.object({
  id: z.uuid(),
  number: z.string(),
  kind: z.enum(['RETURN', 'EXCHANGE']),
  createdAt: date,
  returnedUsd: z.string(),
  replacementSaleId: z.uuid().nullable(),
});
export const saleDetailSchema = saleSummarySchema.extend({
  shopName: z.string(),
  notes: z.string().nullable(),
  items: z.array(item.extend({ id: z.uuid(), returnableQuantity: z.number().int().optional() })),
  tenders: z.array(tender.extend({ kind: z.enum(['PAYMENT', 'CHANGE', 'ADVANCE']) })),
  discounts: z.array(discount),
  corrections: z.array(saleCorrectionBrief).default([]),
  layawayId: z.uuid().nullable().default(null),
  exchangeId: z.uuid().nullable().default(null),
  exchangeCreditUsd: z.string().nullable().default(null),
});
export const saleOperatorSchema = z.object({ id: z.uuid(), displayName: z.string() });
export type SaleInput = z.output<typeof saleInput>;
export type SaleDiscountInput = z.output<typeof saleDiscountInput>;
export type SaleTenderInput = z.output<typeof saleTenderInput>;
export type ConfirmSaleInput = z.output<typeof confirmSaleInput>;
export type SalePreview = z.output<typeof salePreviewSchema>;
export type SaleSummary = z.output<typeof saleSummarySchema>;
export type SaleDetail = z.output<typeof saleDetailSchema>;
