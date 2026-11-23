import { z } from 'zod';
import {
  currencyCodeSchema,
  salePriceSchema,
  sizeSchema,
  unitsPerUsdSchema,
  unitRate,
} from './master-data.js';

const date = z.iso.datetime({ offset: true });
const text = (max: number) => z.string().trim().min(1, 'Completa este campo.').max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null);
export const originalMoneySchema = z
  .string()
  .trim()
  .regex(/^\d{1,16}(?:\.\d{1,8})?$/, 'Usa un importe con hasta 16 enteros y 8 decimales.');
const positiveOriginal = originalMoneySchema.refine(
  (amount) => /[1-9]/.test(amount),
  'El importe debe ser mayor que cero.',
);
const rate = unitsPerUsdSchema.nullable().default(null);

export const purchaseLineInput = z.object({
  size: sizeSchema,
  quantity: z.number().int().min(1).max(100_000),
  unitCostOriginal: positiveOriginal,
  salePriceUsd: salePriceSchema,
});

const brandChoice = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('existing'), id: z.uuid('Selecciona una marca.') }),
  z.object({ mode: z.literal('new'), name: text(120) }),
]);
const modelChoice = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('existing'), id: z.uuid('Selecciona un modelo.') }),
  z.object({ mode: z.literal('new'), name: text(140), brand: brandChoice }),
]);

const purchaseGroupInput = z
  .object({
    model: modelChoice,
    color: optionalText(80),
    lines: z.array(purchaseLineInput).min(1, 'Marca al menos una talla.').max(17),
  })
  .refine(({ lines }) => new Set(lines.map(({ size }) => size)).size === lines.length, {
    path: ['lines'],
    message: 'Cada talla se puede incluir una sola vez por modelo y color.',
  });

export const purchaseInput = z
  .object({
    supplierId: z.uuid('Selecciona un proveedor.'),
    documentAt: date,
    reference: optionalText(120),
    notes: optionalText(2_000),
    currencyCode: currencyCodeSchema,
    unitsPerUsd: rate,
    freightOriginal: originalMoneySchema.default('0'),
    groups: z.array(purchaseGroupInput).min(1).max(20),
  })
  .refine(
    ({ currencyCode, unitsPerUsd }) =>
      currencyCode !== 'USD' || unitsPerUsd === null || unitRate(unitsPerUsd),
    {
      path: ['unitsPerUsd'],
      message: 'Para USD, la tasa debe ser exactamente 1.',
    },
  );

export const paymentInput = z.object({
  operationId: z.uuid(),
  accountId: z.uuid('Selecciona la cuenta.'),
  paidAt: date,
  reference: optionalText(120),
  amountOriginal: positiveOriginal,
  unitsPerUsd: rate,
});
export const receiveInput = z.object({
  operationId: z.uuid(),
  revision: z.number().int().positive(),
  initialPayment: paymentInput.optional(),
});
export const updatePurchaseInput = z.object({
  revision: z.number().int().positive(),
  draft: purchaseInput,
});
export const reasonInput = z.object({ reason: text(500) });

export const purchaseStatusSchema = z.enum(['DRAFT', 'CONFIRMED', 'VOIDED']);
export const purchaseStatusLabels = {
  DRAFT: 'Borrador',
  CONFIRMED: 'Confirmada',
  VOIDED: 'Anulada',
};
export const paymentStatusSchema = z.enum(['PENDING', 'PARTIAL', 'PAID']);
export const paymentStatusLabels = {
  PENDING: 'Pendiente',
  PARTIAL: 'Pago parcial',
  PAID: 'Pagada',
};
export const purchaseQuerySchema = z.object({
  q: z.string().trim().max(120).default(''),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: purchaseStatusSchema.optional(),
});

const totalsSchema = z.object({
  subtotalOriginal: z.string(),
  freightOriginal: z.string(),
  totalOriginal: z.string(),
  totalUsd: z.string().nullable(),
  unitsPerUsd: z.string().nullable(),
  pairCount: z.number().int(),
});
const lineCostsSchema = z.object({
  unitCostOriginal: z.string(),
  freightOriginal: z.string(),
  totalOriginal: z.string(),
  totalUsd: z.string().nullable(),
  unitCostUsd: z.string().nullable(),
});
export const purchasePreviewSchema = totalsSchema.extend({
  lines: z.array(
    lineCostsSchema.extend({
      group: z.number().int(),
      size: z.number().int(),
      quantity: z.number().int(),
    }),
  ),
});
export const confirmedItemSchema = z.object({
  id: z.uuid(),
  variantId: z.uuid(),
  modelName: z.string(),
  brandName: z.string(),
  size: z.number().int(),
  color: z.string().nullable(),
  sku: z.string(),
  quantity: z.number().int(),
  salePriceUsd: z.string(),
  costs: lineCostsSchema.optional(),
});
export const supplierPaymentSchema = z.object({
  id: z.uuid(),
  accountName: z.string(),
  currencyCode: z.string(),
  amountOriginal: z.string(),
  unitsPerUsd: z.string(),
  amountUsd: z.string(),
  paidAt: date,
  reference: z.string().nullable(),
  reversedAt: date.nullable(),
  reversalReason: z.string().nullable(),
});
export const purchaseSummarySchema = z.object({
  id: z.uuid(),
  supplierName: z.string(),
  documentAt: date,
  reference: z.string().nullable(),
  currencyCode: z.string(),
  status: purchaseStatusSchema,
  paymentStatus: paymentStatusSchema.nullable(),
  pairCount: z.number().int(),
  receivedAt: date.nullable(),
  financial: totalsSchema
    .extend({
      exchangeRateId: z.uuid().nullable(),
      paidUsd: z.string(),
      balanceUsd: z.string().nullable(),
      balanceOriginal: z.string().nullable(),
    })
    .optional(),
});
export const purchaseDetailSchema = purchaseSummarySchema.extend({
  revision: z.number().int().positive(),
  notes: z.string().nullable(),
  voidReason: z.string().nullable(),
  draft: purchaseInput.optional(),
  draftModelLabels: z.array(z.string()).optional(),
  preview: purchasePreviewSchema.optional(),
  items: z.array(confirmedItemSchema),
  payments: z.array(supplierPaymentSchema).optional(),
});

export const stockFilterSchema = z.enum(['ALL', 'AVAILABLE', 'LOW', 'OUT']);
export const inventoryQuerySchema = purchaseQuerySchema.omit({ status: true }).extend({
  stock: stockFilterSchema.default('ALL'),
  size: z.coerce.number().int().min(28).max(44).optional(),
  brandId: z.uuid().optional(),
  modelId: z.uuid().optional(),
});
export const inventoryRowSchema = z.object({
  id: z.uuid(),
  brandName: z.string(),
  modelName: z.string(),
  sku: z.string(),
  color: z.string().nullable(),
  size: z.number().int(),
  active: z.boolean(),
  physical: z.number().int(),
  reserved: z.number().int(),
  available: z.number().int(),
  threshold: z.number().int(),
  lowStock: z.boolean(),
  salePriceUsd: z.string(),
  lastPurchaseAt: date.nullable(),
  unitCostUsd: z.string().nullable().optional(),
  marginUsd: z.string().nullable().optional(),
});
export const stockMovementSchema = z.object({
  id: z.uuid(),
  kind: z.enum([
    'RECEIPT',
    'RECEIPT_REVERSAL',
    'ADJUST_IN',
    'ADJUST_OUT',
    'SALE_OUT',
    'RESERVE',
    'RELEASE_RESERVATION',
    'SALE_RETURN_IN',
  ]),
  quantityDelta: z.number().int(),
  reservedDelta: z.number().int().default(0),
  reason: z.string().nullable(),
  occurredAt: date,
  actorName: z.string(),
  purchaseId: z.uuid().nullable(),
});
export const inventoryAdjustment = reasonInput
  .extend({
    operationId: z.uuid(),
    quantityDelta: z
      .number()
      .int()
      .min(-100_000)
      .max(100_000)
      .refine((value) => value !== 0, 'Ingresa una cantidad diferente de cero.'),
    unitCostUsd: salePriceSchema.nullable().default(null),
  })
  .refine(
    ({ quantityDelta, unitCostUsd }) =>
      quantityDelta > 0 ? Boolean(unitCostUsd) : unitCostUsd === null,
    {
      path: ['unitCostUsd'],
      message: 'Indica un costo USD para una entrada. Las salidas usan el costo FIFO existente.',
    },
  );

export type PurchaseInput = z.output<typeof purchaseInput>;
export type PaymentInput = z.output<typeof paymentInput>;
export type ReceiveInput = z.output<typeof receiveInput>;
export type PurchasePreview = z.output<typeof purchasePreviewSchema>;
export type PurchaseSummary = z.output<typeof purchaseSummarySchema>;
export type PurchaseDetail = z.output<typeof purchaseDetailSchema>;
export type InventoryRow = z.output<typeof inventoryRowSchema>;
export type InventoryAdjustment = z.output<typeof inventoryAdjustment>;
