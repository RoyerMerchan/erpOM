import { z } from 'zod';
import { layawayItemsInput } from './layaways.js';
import { listQuerySchema } from './master-data.js';
import { saleCorrectionBrief, saleTenderInput } from './sales.js';

export const returnCondition = z.enum(['SELLABLE', 'DEFECTIVE']);
export const returnConditionLabels: Record<z.output<typeof returnCondition>, string> = {
  SELLABLE: 'Reingresa al inventario',
  DEFECTIVE: 'No reingresable',
};
export const correctionInput = z.object({
  saleId: z.uuid(),
  reason: z.string().trim().min(1, 'Indica el motivo.').max(500),
  notes: z
    .string()
    .trim()
    .max(2000)
    .nullish()
    .transform((value) => value || null),
  items: z
    .array(
      z.object({
        saleItemId: z.uuid(),
        quantity: z.number().int().min(1).max(100_000),
        condition: returnCondition,
      }),
    )
    .min(1, 'Selecciona al menos un par devuelto.')
    .max(100)
    .refine(
      (items) =>
        new Set(items.map(({ saleItemId, condition }) => saleItemId + condition)).size ===
        items.length,
      {
        message: 'Combina las líneas de la misma talla y condición.',
      },
    ),
  replacement: layawayItemsInput.default([]),
  payments: z.array(saleTenderInput).max(20).default([]),
  refunds: z.array(saleTenderInput).max(20).default([]),
});
export const confirmCorrectionInput = z.object({
  operationId: z.uuid(),
  quoteDigest: z.string().regex(/^[a-f0-9]{64}$/),
  correction: correctionInput,
});
export const correctionQuery = listQuerySchema.omit({ status: true, currencyCode: true }).extend({
  kind: z.enum(['RETURN', 'EXCHANGE']).optional(),
  saleId: z.uuid().optional(),
});
const correctionLine = z.object({
  saleItemId: z.uuid(),
  sku: z.string(),
  modelName: z.string(),
  size: z.number().int(),
  condition: returnCondition,
  quantity: z.number().int(),
  creditUsd: z.string(),
  restoredCogsUsd: z.string().optional(),
});
const tender = z.object({
  kind: z.enum(['PAYMENT', 'REFUND']),
  accountId: z.uuid(),
  accountName: z.string(),
  currencyCode: z.string(),
  unitsPerUsd: z.string(),
  amountOriginal: z.string(),
  amountUsd: z.string(),
  reference: z.string().nullable(),
});
export const correctionPreview = z.object({
  quoteDigest: z.string(),
  ready: z.boolean(),
  items: z.array(correctionLine),
  tenders: z.array(tender),
  returnedUsd: z.string(),
  restoredCogsUsd: z.string().optional(),
  replacementTotalUsd: z.string(),
  differenceUsd: z.string(),
  collectedUsd: z.string(),
  refundedUsd: z.string(),
});
export const correctionSummary = saleCorrectionBrief.extend({
  originalSaleId: z.uuid(),
  originalReceipt: z.string(),
  customerName: z.string(),
  actorName: z.string(),
  differenceUsd: z.string(),
  restoredCogsUsd: z.string().optional(),
});
export const correctionDetail = correctionSummary.extend({
  reason: z.string(),
  notes: z.string().nullable(),
  items: z.array(correctionLine),
  tenders: z.array(tender),
  replacementTotalUsd: z.string(),
});
export type CorrectionInput = z.output<typeof correctionInput>;
export type ConfirmCorrectionInput = z.output<typeof confirmCorrectionInput>;
export type CorrectionPreview = z.output<typeof correctionPreview>;
export type CorrectionDetail = z.output<typeof correctionDetail>;
