import { z } from 'zod';
import { layawayRefundPolicySchema, listQuerySchema, variantInput } from './master-data.js';
import { saleTenderInput } from './sales.js';

const date = z.iso.datetime({ offset: true });
const optionalNotes = z
  .string()
  .trim()
  .max(2000)
  .nullish()
  .transform((value) => value || null);
export const layawayStatus = z.enum(['ACTIVE', 'PAID', 'DELIVERED', 'CANCELLED', 'EXPIRED']);
export const layawayStatusLabels: Record<z.output<typeof layawayStatus>, string> = {
  ACTIVE: 'Activo',
  PAID: 'Pagado, pendiente de entrega',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
  EXPIRED: 'Vencido y cerrado',
};
export const layawayItemsInput = z
  .array(
    z.object({
      variantId: z.uuid('Selecciona una variante.'),
      quantity: z.number().int().min(1).max(100_000),
      expectedPriceUsd: variantInput.shape.salePriceUsd.optional(),
    }),
  )
  .max(100)
  .refine((items) => new Set(items.map(({ variantId }) => variantId)).size === items.length, {
    message: 'Combina las cantidades de cada variante en una línea.',
  });

export const createLayawayInput = z.object({
  operationId: z.uuid(),
  customerId: z.uuid('Selecciona un cliente.'),
  expiresAt: date.nullish().transform((value) => value ?? null),
  notes: optionalNotes,
  items: layawayItemsInput.refine((items) => items.length > 0, 'Agrega al menos una talla.'),
  payments: z.array(saleTenderInput).max(20).default([]),
});
export const depositLayawayInput = z.object({
  operationId: z.uuid(),
  payments: z.array(saleTenderInput).min(1, 'Agrega un abono.').max(20),
});
export const deliverLayawayInput = z.object({ operationId: z.uuid() });
export const closeLayawayInput = deliverLayawayInput.extend({
  reason: z.string().trim().min(1, 'Indica el motivo.').max(500),
});
export const layawayQuery = listQuerySchema.omit({ status: true, currencyCode: true }).extend({
  customerId: z.uuid().optional(),
  status: layawayStatus.optional(),
  overdue: z.stringbool().optional(),
});
export const layawayRefundLabels: Record<z.output<typeof layawayRefundPolicySchema>, string> = {
  FULL_REFUND: 'Reembolso completo en las cuentas originales',
  RETAIN: 'Retener los abonos',
};
const layawayPayment = z.object({
  id: z.uuid(),
  kind: z.enum(['DEPOSIT', 'REFUND']),
  accountId: z.uuid(),
  accountName: z.string(),
  currencyCode: z.string(),
  unitsPerUsd: z.string(),
  amountOriginal: z.string(),
  amountUsd: z.string(),
  reference: z.string().nullable(),
});
export const layawaySummary = z.object({
  id: z.uuid(),
  number: z.string(),
  status: layawayStatus,
  overdue: z.boolean(),
  customerName: z.string(),
  sellerName: z.string(),
  expiresAt: date.nullable(),
  createdAt: date,
  totalUsd: z.string(),
  paidUsd: z.string(),
  balanceUsd: z.string(),
});
export const layawayDetail = layawaySummary.extend({
  notes: z.string().nullable(),
  refundPolicy: layawayRefundPolicySchema,
  refundedUsd: z.string(),
  retainedUsd: z.string(),
  saleId: z.uuid().nullable(),
  items: z.array(
    z.object({
      id: z.uuid(),
      variantId: z.uuid(),
      brandName: z.string(),
      modelName: z.string(),
      sku: z.string(),
      size: z.number().int(),
      color: z.string().nullable(),
      quantity: z.number().int(),
      unitPriceUsd: z.string(),
      totalUsd: z.string(),
    }),
  ),
  actions: z.array(
    z.object({
      id: z.uuid(),
      kind: z.enum(['CREATE', 'PAY', 'DELIVER', 'CANCEL', 'EXPIRE']),
      actorName: z.string(),
      occurredAt: date,
      reason: z.string().nullable(),
      payments: z.array(layawayPayment),
    }),
  ),
});
export type CreateLayawayInput = z.output<typeof createLayawayInput>;
export type DepositLayawayInput = z.output<typeof depositLayawayInput>;
export type CloseLayawayInput = z.output<typeof closeLayawayInput>;
export type LayawayDetail = z.output<typeof layawayDetail>;
