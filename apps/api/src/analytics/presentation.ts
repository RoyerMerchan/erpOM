import type { AnalyticsMetric, AnalyticsTable } from '@max-sport/shared';
import type { Prisma } from '../generated/prisma/client.js';

type Format = AnalyticsTable['columns'][number]['format'];
type Destination = NonNullable<AnalyticsMetric['action']>;
export const cell = (label: string, format: Format = 'TEXT') => ({ label, format });
export const row = (cells: string[], action?: Destination) => ({ cells, action });
export const quantity = (value: bigint | number) => value.toString();
export const usd = (value: Prisma.Decimal) => value.toFixed(2);
export function metric(
  id: string,
  label: string,
  value: string | null,
  format: Format = 'COUNT',
  previous?: string | null,
  action?: Destination,
): AnalyticsMetric {
  return { id, label, value, format, previous, action };
}
export const target = (
  name: Destination['name'],
  id?: string,
  query?: Record<string, string>,
): Destination => ({ name, id, query });
