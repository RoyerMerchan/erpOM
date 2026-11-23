import {
  financeCategorySchema,
  financeDebtPageSchema,
  financeEntryPreviewSchema,
  financeEntrySchema,
  financeLedgerPageSchema,
  financeReportSchema,
  pageSchema,
} from '@max-sport/shared';
import type {
  FinanceEntryConfirmation,
  FinanceEntryInput,
  FinanceReversalInput,
} from '@max-sport/shared';
import { readJson, sendJson } from '../api';

const path = (endpoint: string, query: Record<string, string>) =>
  '/finance/' + endpoint + '?' + new URLSearchParams(query);
const entryPath = (id: string) => '/finance/entries/' + encodeURIComponent(id);
export const getFinanceReport = (query: Record<string, string>, daily: boolean) =>
  readJson(path(daily ? 'daily' : 'report', query), financeReportSchema);
export const getFinanceAccounts = (query: Record<string, string>) =>
  readJson(path('accounts', query), financeReportSchema.pick({ accounts: true, window: true }));
export const getFinanceLedger = (query: Record<string, string>) =>
  readJson(path('movements', query), financeLedgerPageSchema);
export const getFinanceDebts = (query: Record<string, string>, payables: boolean) =>
  readJson(path(payables ? 'payables' : 'receivables', query), financeDebtPageSchema);
export const getFinanceCategories = (query: Record<string, string>) =>
  readJson(path('categories', query), pageSchema(financeCategorySchema));
export const saveFinanceCategory = (id: string | null, input: { name: string; active: boolean }) =>
  sendJson(
    '/finance/categories' + (id ? '/' + encodeURIComponent(id) : ''),
    financeCategorySchema,
    input,
    id ? 'PUT' : 'POST',
  );
export const getFinanceEntry = (id: string) => readJson(entryPath(id), financeEntrySchema);
export const previewFinanceEntry = (input: FinanceEntryInput) =>
  sendJson('/finance/entries/preview', financeEntryPreviewSchema, input, 'POST');
export const confirmFinanceEntry = (input: FinanceEntryConfirmation) =>
  sendJson('/finance/entries', financeEntrySchema, input, 'POST');
export const reverseFinanceEntry = (id: string, input: FinanceReversalInput) =>
  sendJson(entryPath(id) + '/reverse', financeEntrySchema, input, 'POST');
