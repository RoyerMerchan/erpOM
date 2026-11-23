import type { PaymentInput, PurchaseInput } from '@max-sport/shared';
import { ApiRequestError } from '../api';
import { localDateInput } from '../master-data/field-types';
import type { FieldValue } from '../master-data/field-types';

export type SizeLine = {
  size: number;
  selected: boolean;
  quantity: string;
  cost: string;
  price: string;
};
export type ModelGroup = {
  key: string;
  modelMode: 'existing' | 'new';
  modelId: FieldValue;
  modelName: string;
  brandMode: 'existing' | 'new';
  brandId: FieldValue;
  brandName: string;
  color: string;
  rows: SizeLine[];
};
export type PaymentDraft = {
  accountId: FieldValue;
  paidAt: string;
  reference: string;
  amount: string;
  rate: string;
};

export function createGroup(input?: PurchaseInput['groups'][number]): ModelGroup {
  const model = input?.model;
  const brand = model?.mode === 'new' ? model.brand : undefined;
  return {
    key: crypto.randomUUID(),
    modelMode: model?.mode ?? 'existing',
    modelId: model?.mode === 'existing' ? model.id : null,
    modelName: model?.mode === 'new' ? model.name : '',
    brandMode: brand?.mode ?? 'existing',
    brandId: brand?.mode === 'existing' ? brand.id : null,
    brandName: brand?.mode === 'new' ? brand.name : '',
    color: input?.color ?? '',
    rows: Array.from({ length: 17 }, (_, index) => {
      const size = index + 28;
      const line = input?.lines.find((line) => line.size === size);
      return {
        size,
        selected: Boolean(line),
        quantity: String(line?.quantity ?? 1),
        cost: line?.unitCostOriginal ?? '',
        price: line?.salePriceUsd ?? '',
      };
    }),
  };
}

export function modelGroupPayload(group: ModelGroup) {
  return {
    model:
      group.modelMode === 'existing'
        ? { mode: 'existing', id: group.modelId }
        : {
            mode: 'new',
            name: group.modelName,
            brand:
              group.brandMode === 'existing'
                ? { mode: 'existing', id: group.brandId }
                : { mode: 'new', name: group.brandName },
          },
    color: group.color,
    lines: group.rows
      .filter(({ selected }) => selected)
      .map((row) => ({
        size: row.size,
        quantity: Number(row.quantity),
        unitCostOriginal: decimalText(row.cost),
        salePriceUsd: decimalText(row.price),
      })),
  };
}

export const decimalText = (value: string) => value.trim().replace(',', '.');
export function asDate(value: string) {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

export function formatMoney(value: string | undefined | null, currency?: string) {
  if (value == null) return '—';
  const [whole = '', fraction] = value.split('.');
  const amount = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (fraction ? ',' + fraction : '');
  return currency ? amount + ' ' + currency : amount;
}

export function failureMessage(error: unknown, fallback: string) {
  return error instanceof ApiRequestError ? error.message : fallback;
}

export function operationKey() {
  let previous: { body: string; id: string } | undefined;
  return (body: unknown) => {
    const serialized = JSON.stringify(body);
    if (!previous || previous.body !== serialized)
      previous = { body: serialized, id: crypto.randomUUID() };
    return previous.id;
  };
}

export function paymentDraft(): PaymentDraft {
  return {
    accountId: null,
    amount: '',
    rate: '',
    paidAt: localDateInput(new Date()),
    reference: '',
  };
}

export function paymentPayload(
  draft: PaymentDraft,
  key: ReturnType<typeof operationKey>,
  currency: string,
): unknown {
  const body: Omit<PaymentInput, 'operationId' | 'accountId'> & { accountId: FieldValue } = {
    accountId: draft.accountId,
    paidAt: asDate(draft.paidAt),
    reference: draft.reference,
    amountOriginal: decimalText(draft.amount),
    unitsPerUsd: currency === 'USD' ? null : decimalText(draft.rate) || null,
  };
  return { ...body, operationId: key(body) };
}
