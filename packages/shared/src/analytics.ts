import { z } from 'zod';
import type { PermissionCode } from './access.js';
import { financeReportSchema } from './finance.js';
import { accountKindSchema, currencyCodeSchema } from './master-data.js';

export const analyticsPeriod = z.enum([
  'TODAY',
  'YESTERDAY',
  'LAST_7_DAYS',
  'THIS_WEEK',
  'LAST_WEEK',
  'THIS_MONTH',
  'LAST_MONTH',
  'RANGE',
]);
export const analyticsPeriodLabels: Record<z.output<typeof analyticsPeriod>, string> = {
  TODAY: 'Hoy',
  YESTERDAY: 'Ayer',
  LAST_7_DAYS: 'Últimos 7 días',
  THIS_WEEK: 'Esta semana',
  LAST_WEEK: 'Semana pasada',
  THIS_MONTH: 'Este mes',
  LAST_MONTH: 'Mes pasado',
  RANGE: 'Rango personalizado',
};
export const analyticsSection = z.enum([
  'SALES',
  'CASH',
  'STOCK',
  'PURCHASES',
  'LAYAWAYS',
  'RETURNS',
]);
export const analyticsSectionLabels: Record<z.output<typeof analyticsSection>, string> = {
  SALES: 'Ventas',
  CASH: 'Caja',
  STOCK: 'Inventario',
  PURCHASES: 'Compras',
  LAYAWAYS: 'Apartados',
  RETURNS: 'Cambios y devoluciones',
};
export function analyticsSectionsFor(allowed: readonly PermissionCode[]): AnalyticsSection[] {
  return [
    ...(allowed.includes('sales.read') ? (['SALES'] as const) : []),
    ...(allowed.includes('finance.read') ? (['CASH'] as const) : []),
    ...(allowed.includes('inventory.read') ? (['STOCK'] as const) : []),
    ...(allowed.includes('purchases.read') ? (['PURCHASES'] as const) : []),
    ...(allowed.includes('layaways.read') ? (['LAYAWAYS'] as const) : []),
    ...(allowed.includes('returns.read') && allowed.includes('sales.read')
      ? (['RETURNS'] as const)
      : []),
  ];
}
export const analyticsInterval = z.enum(['AUTO', 'DAY', 'WEEK', 'MONTH']);
export const analyticsIntervalLabels: Record<z.output<typeof analyticsInterval>, string> = {
  AUTO: 'Automática',
  DAY: 'Día',
  WEEK: 'Semana',
  MONTH: 'Mes',
};
export const analyticsLayawayState = z.enum([
  'ACTIVE',
  'PAID',
  'DELIVERED',
  'CANCELLED',
  'EXPIRED',
  'OVERDUE',
]);
export const analyticsLayawayLabels: Record<z.output<typeof analyticsLayawayState>, string> = {
  ACTIVE: 'Abierto con saldo',
  PAID: 'Pagado, pendiente de entrega',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
  EXPIRED: 'Cerrado por vencimiento',
  OVERDUE: 'Vencido sin cerrar',
};
export const catalogProductFilters = z.object({
  brandId: z.uuid().optional(),
  modelId: z.uuid().optional(),
  size: z.coerce.number().int().min(28).max(44).optional(),
});
const dimensions = catalogProductFilters.extend({
  sellerId: z.uuid().optional(),
  customerId: z.uuid().optional(),
  supplierId: z.uuid().optional(),
  accountId: z.uuid().optional(),
  currencyCode: currencyCodeSchema.optional(),
  method: accountKindSchema.optional(),
  layawayState: analyticsLayawayState.optional(),
});
const filters = dimensions.extend({
  period: analyticsPeriod.default('TODAY'),
  interval: analyticsInterval.default('AUTO'),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
function orderedRange(input: z.output<typeof filters>) {
  return input.period !== 'RANGE' || Boolean(input.from && input.to && input.from <= input.to);
}
const rangeError = { path: ['to'], message: 'Elige una fecha inicial y final válidas.' };
export const analyticsQuery = filters
  .extend({ section: analyticsSection.optional() })
  .refine(orderedRange, rangeError);
export const analyticsExportQuery = filters
  .extend({
    section: analyticsSection,
    format: z.enum(['CSV', 'XLSX', 'PDF']),
  })
  .refine(orderedRange, rangeError);

const reportDestination = z.object({
  name: z.enum([
    'reports',
    'sales',
    'sale-detail',
    'finance',
    'finance-movements',
    'inventory',
    'purchases',
    'purchase-detail',
    'layaways',
    'layaway-detail',
    'returns',
    'return-detail',
    'finance-payables',
    'finance-receivables',
    'finance-entry',
  ]),
  id: z.uuid().optional(),
  query: z.record(z.string(), z.string()).optional(),
});
const valueFormat = z.enum(['TEXT', 'COUNT', 'USD', 'PERCENT', 'DATE', 'TIME']);
const metric = z.object({
  id: z.string(),
  label: z.string(),
  value: z.string().nullable(),
  format: valueFormat,
  previous: z.string().nullable().optional(),
  action: reportDestination.optional(),
});
const table = z.object({
  id: z.string(),
  title: z.string(),
  columns: z.array(z.object({ label: z.string(), format: valueFormat })),
  rows: z.array(z.object({ cells: z.array(z.string()), action: reportDestination.optional() })),
  rowCount: z.number().int().optional(),
});
const point = z.object({ date: z.iso.date(), value: z.string() });
export const analyticsBlockSchema = z.object({
  section: analyticsSection,
  metrics: z.array(metric),
  tables: z.array(table),
  trend: z
    .object({ label: z.string(), current: z.array(point), previous: z.array(point) })
    .optional(),
});
export const analyticsResponseSchema = z.object({
  shopName: z.string(),
  window: financeReportSchema.shape.window,
  comparison: financeReportSchema.shape.window,
  interval: analyticsInterval.exclude(['AUTO']),
  sections: z.array(analyticsBlockSchema),
});
export type AnalyticsQuery = z.output<typeof analyticsQuery>;
export type AnalyticsSection = z.output<typeof analyticsSection>;
export type AnalyticsBlock = z.output<typeof analyticsBlockSchema>;
export type AnalyticsTable = z.output<typeof table>;
export type AnalyticsMetric = z.output<typeof metric>;
export type AnalyticsResponse = z.output<typeof analyticsResponseSchema>;
