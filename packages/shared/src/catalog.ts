import { z } from 'zod';
import { catalogProductFilters } from './analytics.js';
import { currencyCodeSchema, unitsPerUsdSchema } from './master-data.js';

export const catalogInput = catalogProductFilters.extend({
  currencyCode: currencyCodeSchema.default('USD'),
  unitsPerUsd: unitsPerUsdSchema.nullable().default(null),
  includeQuantity: z.boolean().default(false),
});
export const catalogPreviewQuery = catalogInput.extend({
  includeQuantity: z.stringbool().default(false),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export const catalogPdfInput = catalogInput
  .extend({
    save: z.boolean().default(false),
    operationId: z.uuid().optional(),
  })
  .refine(({ save, operationId }) => !save || !!operationId, {
    path: ['operationId'],
    message: 'Identifica la operación para guardar una versión.',
  });
const product = z.object({
  brand: z.string(),
  model: z.string(),
  color: z.string().nullable(),
  description: z.string().nullable(),
  priceUsd: z.string(),
  priceLocal: z.string().nullable(),
  sizes: z.array(z.object({ size: z.number().int(), available: z.number().int().optional() })),
});
const heading = z.object({
  shopName: z.string(),
  generatedAt: z.iso.datetime(),
  timezone: z.string(),
  currencyCode: currencyCodeSchema,
  unitsPerUsd: z.string(),
  includeQuantity: z.boolean(),
});
export const catalogPreviewSchema = heading.extend({
  items: z.array(product),
  total: z.number().int(),
});
export const catalogVersionSchema = heading.extend({
  id: z.uuid(),
  filename: z.string(),
  actorName: z.string(),
  productCount: z.number().int(),
  byteCount: z.number().int(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  size: z.number().int().nullable(),
});
export type CatalogInput = z.output<typeof catalogInput>;
export type CatalogPdfInput = z.output<typeof catalogPdfInput>;
export type CatalogPreview = z.output<typeof catalogPreviewSchema>;
export type CatalogVersion = z.output<typeof catalogVersionSchema>;
