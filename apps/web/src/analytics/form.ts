import { analyticsQuery } from '@max-sport/shared';
import type {
  AnalyticsBlock,
  AnalyticsMetric,
  AnalyticsQuery,
  AnalyticsSection,
} from '@max-sport/shared';
import type { FieldValue } from '../master-data/field-types';
import { formatMoney } from '../purchasing/form';

type Fields =
  | 'brandId'
  | 'modelId'
  | 'size'
  | 'sellerId'
  | 'customerId'
  | 'supplierId'
  | 'accountId'
  | 'currencyCode'
  | 'method'
  | 'layawayState';
export type AnalyticsDraft = Record<Fields, FieldValue> & {
  period: AnalyticsQuery['period'];
  interval: AnalyticsQuery['interval'];
  from: string;
  to: string;
};
const dimensionKeys: Fields[] = [
  'brandId',
  'modelId',
  'size',
  'sellerId',
  'customerId',
  'supplierId',
  'accountId',
  'currencyCode',
  'method',
  'layawayState',
];
export function reportDraft(query: unknown = {}) {
  const input = analyticsQuery.safeParse(query);
  const initial = input.success ? input.data : undefined;
  return {
    period: initial?.period ?? 'TODAY',
    interval: initial?.interval ?? 'AUTO',
    from: initial?.from ?? '',
    to: initial?.to ?? '',
    brandId: initial?.brandId ?? null,
    modelId: initial?.modelId ?? null,
    size: initial?.size ?? null,
    sellerId: initial?.sellerId ?? null,
    customerId: initial?.customerId ?? null,
    supplierId: initial?.supplierId ?? null,
    accountId: initial?.accountId ?? null,
    currencyCode: initial?.currencyCode ?? null,
    method: initial?.method ?? null,
    layawayState: initial?.layawayState ?? null,
  } satisfies AnalyticsDraft;
}

export function reportParams(
  draft: AnalyticsDraft,
  section?: AnalyticsSection,
): Record<string, string> {
  const dimensions = Object.fromEntries(
    dimensionKeys.flatMap((key) => {
      const value = draft[key];
      return (typeof value === 'string' && value) || typeof value === 'number'
        ? [[key, String(value)]]
        : [];
    }),
  );
  return {
    ...dimensions,
    period: draft.period,
    interval: draft.interval,
    ...(draft.period === 'RANGE' ? { from: draft.from, to: draft.to } : {}),
    ...(section ? { section } : {}),
  };
}

type Format = AnalyticsMetric['format'];
export function formatValue(value: string | null | undefined, format: Format, timezone: string) {
  if (value == null || value === '') return '—';
  if (format === 'DATE')
    return new Intl.DateTimeFormat('es', {
      timeZone: 'UTC',
      dateStyle: 'medium',
    }).format(new Date(value + 'T00:00:00Z'));
  if (format === 'TIME')
    return new Intl.DateTimeFormat('es', {
      timeZone: timezone,
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  if (format === 'USD') return formatMoney(value, 'USD');
  if (format === 'PERCENT') return formatMoney(value) + ' %';
  if (format === 'COUNT') return formatMoney(value);
  return value;
}
export function actionLink(action: NonNullable<AnalyticsMetric['action']>) {
  return {
    name: action.name,
    ...(action.id ? { params: { id: action.id } } : {}),
    query: action.query,
  };
}
export const dashboardTableIds = new Set([
  'recent-sales',
  'models',
  'brands',
  'sizes',
  'cash-accounts',
  'recent-cash',
  'stock-alerts',
  'empty-models',
  'purchase-receipts',
  'layaway-status',
  'recent-returns',
]);
export const overviewMetricIds = [
  'net-sales',
  'collectedUsd',
  'sales-count',
  'average-ticket',
  'net-profit',
  'margin',
  'stock-available',
];
export const dashboardDetailMetricIds = [
  'pairs-sold',
  'gross-profit',
  'operating-expense',
  'cashFlowUsd',
  'stock-physical',
  'stock-held',
  'stock-low',
  'stock-empty-models',
  'received-pairs',
  'open-layaways',
  'overdue-layaways',
  'customer-debt',
  'supplier-debt',
  'returned-pairs',
];
export function dashboardMetrics(
  sections: AnalyticsBlock[],
  ids: string[],
  filters: Record<string, string>,
) {
  const metrics = sections.flatMap(({ section, metrics }) =>
    metrics.map((metric): AnalyticsMetric => ({
      ...metric,
      action: metric.action?.query
        ? metric.action
        : { name: 'reports', query: { ...filters, section } },
    })),
  );
  return ids.flatMap((id) => {
    const entry = metrics.find((metric) => metric.id === id);
    return entry ? [entry] : [];
  });
}
