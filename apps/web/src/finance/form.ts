import { financeEntryLabels, financeLedgerLabels } from '@max-sport/shared';
import type { FinanceLedgerRow, FinanceReportFilters } from '@max-sport/shared';
import type { FieldValue } from '../master-data/field-types';

export type FinanceFilterDraft = {
  period: FinanceReportFilters['period'];
  date: string;
  from: string;
  to: string;
  currencyCode: FieldValue;
  accountId: FieldValue;
};
export const financeFiltersDraft = (): FinanceFilterDraft => ({
  period: 'DAY',
  date: '',
  from: '',
  to: '',
  currencyCode: null,
  accountId: null,
});
export function filterParams(filters: FinanceFilterDraft): Record<string, string> {
  return {
    period: filters.period,
    ...(filters.period === 'RANGE'
      ? { from: filters.from, to: filters.to }
      : filters.date
        ? { date: filters.date }
        : {}),
    ...(typeof filters.currencyCode === 'string' ? { currencyCode: filters.currencyCode } : {}),
    ...(typeof filters.accountId === 'string' ? { accountId: filters.accountId } : {}),
  };
}

export function financeMoment(value: string, timezone: string) {
  return new Intl.DateTimeFormat('es', {
    timeZone: timezone,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function financeDay(value: string) {
  return new Intl.DateTimeFormat('es', { timeZone: 'UTC', dateStyle: 'medium' }).format(
    new Date(value + 'T00:00:00Z'),
  );
}

const sourceRoutes: Record<FinanceLedgerRow['sourceKind'], string> = {
  PURCHASE: 'purchase-detail',
  SALE: 'sale-detail',
  LAYAWAY: 'layaway-detail',
  RETURN: 'return-detail',
  FINANCE: 'finance-entry',
};
export const sourceRoute = (row: FinanceLedgerRow) => ({
  name: sourceRoutes[row.sourceKind],
  params: { id: row.sourceId },
});
export const movementLabel = (row: FinanceLedgerRow) =>
  row.entryKind
    ? (row.reversed ? 'Reverso · ' : '') + financeEntryLabels[row.entryKind]
    : financeLedgerLabels[row.kind];
