import { z } from 'zod';
import { accountKindSchema, currencyCodeSchema, listQuerySchema } from './master-data.js';
import { reasonInput } from './purchasing.js';
import { saleTenderInput } from './sales.js';

const instant = z.iso.datetime({ offset: true });
const usd = z.string();
const uuid = z.uuid();
const label = (max: number) => z.string().trim().min(1, 'Completa este campo.').max(max);
const direction = z.enum(['IN', 'OUT']);
export const financeEntryKind = z.enum(['EXPENSE', 'OTHER_INCOME', 'TRANSFER', 'ADJUSTMENT']);
export const financeEntryLabels: Record<z.output<typeof financeEntryKind>, string> = {
  EXPENSE: 'Gasto',
  OTHER_INCOME: 'Otro ingreso',
  TRANSFER: 'Transferencia',
  ADJUSTMENT: 'Ajuste de saldo',
};

export const financeCategoryInput = z.object({
  name: label(100),
  active: z.boolean().default(true),
});
export const financeCategorySchema = financeCategoryInput.extend({ id: uuid, active: z.boolean() });
export const financeValueInput = saleTenderInput.omit({ reference: true });
const entryHeader = z.object({
  occurredAt: instant,
  description: label(500),
  reference: z
    .string()
    .trim()
    .max(120)
    .nullish()
    .transform((value) => value || null),
});
export const financeEntryInput = z
  .discriminatedUnion('kind', [
    entryHeader.extend({
      kind: z.literal('EXPENSE'),
      categoryId: uuid,
      payment: financeValueInput,
    }),
    entryHeader.extend({ kind: z.literal('OTHER_INCOME'), payment: financeValueInput }),
    entryHeader.extend({ kind: z.literal('ADJUSTMENT'), direction, payment: financeValueInput }),
    entryHeader.extend({
      kind: z.literal('TRANSFER'),
      source: financeValueInput,
      destination: financeValueInput,
    }),
  ])
  .refine(
    (value) => value.kind !== 'TRANSFER' || value.source.accountId !== value.destination.accountId,
    {
      path: ['destination', 'accountId'],
      message: 'Elige cuentas distintas para origen y destino.',
    },
  );
export const financeEntryConfirmation = z.object({
  operationId: uuid,
  quoteDigest: z.string().regex(/^[a-f0-9]{64}$/),
  entry: financeEntryInput,
});
export const financeReversalInput = reasonInput.extend({
  operationId: uuid,
  occurredAt: instant.nullish().transform((value) => value ?? null),
});

export const financePeriodSchema = z.enum(['DAY', 'WEEK', 'MONTH', 'RANGE']);
export const financePeriodLabels: Record<z.output<typeof financePeriodSchema>, string> = {
  DAY: 'Día',
  WEEK: 'Semana',
  MONTH: 'Mes',
  RANGE: 'Rango personalizado',
};
const cashScope = z.object({
  currencyCode: currencyCodeSchema.optional(),
  accountId: uuid.optional(),
});
const reportFields = cashScope.extend({
  period: financePeriodSchema.default('DAY'),
  date: z.iso.date().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
type WindowInput = z.output<typeof reportFields>;
function validWindow({ period, from, to }: WindowInput) {
  return period !== 'RANGE' || Boolean(from && to && from <= to);
}
const windowMessage = {
  path: ['to'],
  message: 'Selecciona un rango válido con fecha inicial y final.',
};
export const financeReportQuery = reportFields.refine(validWindow, windowMessage);
export const financeDailyQuery = cashScope.extend({ date: z.iso.date().optional() });
const paging = listQuerySchema.pick({ page: true, limit: true, q: true });
export const financeLedgerFilter = z.enum([
  'COLLECTION',
  'REFUND',
  'SUPPLIER',
  'EXPENSE',
  'OTHER_INCOME',
  'TRANSFER',
  'ADJUSTMENT',
  'MANUAL',
]);
export const financeLedgerFilterLabels: Record<z.output<typeof financeLedgerFilter>, string> = {
  COLLECTION: 'Cobros y anticipos',
  REFUND: 'Reembolsos y vuelto',
  SUPPLIER: 'Pagos a proveedores',
  EXPENSE: 'Gastos',
  OTHER_INCOME: 'Otros ingresos',
  TRANSFER: 'Transferencias',
  ADJUSTMENT: 'Ajustes de saldo',
  MANUAL: 'Registros financieros',
};
export const financeLedgerQuery = reportFields
  .extend({
    ...paging.shape,
    filter: financeLedgerFilter.optional(),
    categoryId: uuid.optional(),
  })
  .refine(validWindow, windowMessage);
export const financeDebtQuery = paging;

export const financeLedgerKind = z.enum([
  'SUPPLIER_PAYMENT',
  'SUPPLIER_PAYMENT_REVERSAL',
  'SALE_PAYMENT',
  'SALE_CHANGE',
  'LAYAWAY_DEPOSIT',
  'LAYAWAY_REFUND',
  'EXCHANGE_PAYMENT',
  'SALE_REFUND',
  'FINANCE_IN',
  'FINANCE_OUT',
]);
export const financeLedgerLabels: Record<z.output<typeof financeLedgerKind>, string> = {
  SUPPLIER_PAYMENT: 'Pago a proveedor',
  SUPPLIER_PAYMENT_REVERSAL: 'Reverso de pago a proveedor',
  SALE_PAYMENT: 'Cobro de venta',
  SALE_CHANGE: 'Vuelto de venta',
  LAYAWAY_DEPOSIT: 'Anticipo de apartado',
  LAYAWAY_REFUND: 'Reembolso de apartado',
  EXCHANGE_PAYMENT: 'Cobro por cambio',
  SALE_REFUND: 'Reembolso de venta',
  FINANCE_IN: 'Entrada',
  FINANCE_OUT: 'Salida',
};
const value = z.object({
  accountId: uuid,
  accountName: z.string(),
  currencyCode: currencyCodeSchema,
  amountOriginal: z.string(),
  unitsPerUsd: z.string(),
  amountUsd: usd,
  direction,
});
const financeWindowSchema = z.object({
  from: instant,
  to: instant,
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  timezone: z.string(),
});
export const financeLedgerRowSchema = value.extend({
  id: uuid,
  kind: financeLedgerKind,
  occurredAt: instant,
  actorName: z.string(),
  sourceKind: z.enum(['PURCHASE', 'SALE', 'LAYAWAY', 'RETURN', 'FINANCE']),
  sourceId: uuid,
  reference: z.string().nullable(),
  description: z.string().nullable(),
  categoryName: z.string().nullable(),
  entryKind: financeEntryKind.nullable(),
  reversed: z.boolean(),
});
export const financeLedgerPageSchema = z.object({
  items: z.array(financeLedgerRowSchema),
  total: z.number().int(),
  window: financeWindowSchema,
});
export const financeEntryPreviewSchema = z.object({
  quoteDigest: z.string(),
  lines: z.array(value),
  differenceUsd: usd.nullable(),
});
export const financeEntrySchema = z.object({
  id: uuid,
  number: z.string(),
  kind: financeEntryKind,
  occurredAt: instant,
  createdAt: instant,
  actorName: z.string(),
  description: z.string(),
  reference: z.string().nullable(),
  categoryName: z.string().nullable(),
  reversesId: uuid.nullable(),
  reversalId: uuid.nullable(),
  differenceUsd: usd.nullable(),
  lines: z.array(value.extend({ id: uuid, exchangeRateId: uuid.nullable() })),
});
export const financeAccountSchema = z.object({
  id: uuid,
  name: z.string(),
  currencyCode: currencyCodeSchema,
  kind: accountKindSchema,
  active: z.boolean(),
  openingOriginal: z.string(),
  incomingOriginal: z.string(),
  outgoingOriginal: z.string(),
  closingOriginal: z.string(),
  openingUsd: usd,
  incomingUsd: usd,
  outgoingUsd: usd,
  closingUsd: usd,
});
export const financeReportSchema = z.object({
  window: financeWindowSchema,
  accounts: z.array(financeAccountSchema),
  cash: z.object({
    salesCollectedUsd: usd,
    advancesCollectedUsd: usd,
    collectedUsd: usd,
    changeUsd: usd,
    refundsUsd: usd,
    supplierNetUsd: usd,
    expensesUsd: usd,
    otherIncomeUsd: usd,
    cashInUsd: usd,
    cashOutUsd: usd,
    cashFlowUsd: usd,
    totalInUsd: usd,
    totalOutUsd: usd,
    accountNetUsd: usd,
    transferNetUsd: usd,
    adjustmentsNetUsd: usd,
  }),
  recognition: z.object({
    salesCount: z.number().int(),
    grossSalesUsd: usd,
    discountsUsd: usd,
    returnedUsd: usd,
    netSalesUsd: usd,
    cogsUsd: usd.optional(),
    grossProfitUsd: usd.optional(),
    netProfitUsd: usd.optional(),
    grossMarginPct: usd.nullable().optional(),
    expensesUsd: usd,
  }),
  expenseCategories: z.array(z.object({ id: uuid, name: z.string(), usd })),
});
export const financeDebtRowSchema = z.object({
  id: uuid,
  number: z.string(),
  partyName: z.string(),
  occurredAt: instant,
  dueAt: instant.nullable(),
  overdue: z.boolean(),
  totalUsd: usd,
  paidUsd: usd,
  balanceUsd: usd,
});
export const financeDebtPageSchema = z.object({
  items: z.array(financeDebtRowSchema),
  total: z.number().int(),
  balanceUsd: usd,
});

export type FinanceEntryInput = z.output<typeof financeEntryInput>;
export type FinanceValueInput = z.output<typeof financeValueInput>;
export type FinanceEntryConfirmation = z.output<typeof financeEntryConfirmation>;
export type FinanceReversalInput = z.output<typeof financeReversalInput>;
export type FinanceReportFilters = z.output<typeof financeReportQuery>;
export type FinanceLedgerQuery = z.output<typeof financeLedgerQuery>;
export type FinanceDebtQuery = z.output<typeof financeDebtQuery>;
export type FinanceWindow = z.output<typeof financeWindowSchema>;
export type FinanceReport = z.output<typeof financeReportSchema>;
export type FinanceAccount = z.output<typeof financeAccountSchema>;
export type FinanceLedgerRow = z.output<typeof financeLedgerRowSchema>;
export type FinanceEntry = z.output<typeof financeEntrySchema>;
export type FinanceEntryPreview = z.output<typeof financeEntryPreviewSchema>;
