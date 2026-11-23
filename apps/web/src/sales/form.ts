import type { FieldValue } from '../master-data/field-types';
import { decimalText } from '../purchasing/form';

export type DiscountDraft = {
  kind: 'NONE' | 'PERCENT' | 'FIXED';
  value: string;
  currency: FieldValue;
  rate: string;
};

export type TenderDraft = {
  key: string;
  accountId: FieldValue;
  amount: string;
  rate: string;
  reference: string;
};

export const discountDraft = (): DiscountDraft => ({
  kind: 'NONE',
  value: '',
  currency: 'USD',
  rate: '',
});
export const tenderDraft = (): TenderDraft => ({
  key: crypto.randomUUID(),
  accountId: null,
  amount: '',
  rate: '',
  reference: '',
});

export function discountInput(draft: DiscountDraft) {
  if (draft.kind === 'NONE') return null;
  if (draft.kind === 'PERCENT') return { kind: draft.kind, percentage: decimalText(draft.value) };
  return {
    kind: draft.kind,
    currencyCode: draft.currency,
    amountOriginal: decimalText(draft.value),
    unitsPerUsd: draft.currency === 'USD' ? null : decimalText(draft.rate) || null,
  };
}

export function tenderInput(draft: TenderDraft) {
  return {
    accountId: draft.accountId,
    amountOriginal: decimalText(draft.amount),
    unitsPerUsd: decimalText(draft.rate) || null,
    reference: draft.reference,
  };
}

export const isStartedTender = (draft: TenderDraft) =>
  Boolean(draft.accountId || draft.amount.trim() || draft.rate.trim() || draft.reference.trim());
