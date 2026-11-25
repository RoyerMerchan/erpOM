import type { InventoryRow } from '@max-sport/shared';
import { isStartedTender, tenderInput } from '../sales/form';
import type { TenderDraft } from '../sales/form';

export type StockSelection = { row: InventoryRow; quantity: string };
export const cartInput = (entries: StockSelection[]) =>
  entries.map(({ row, quantity }) => ({
    variantId: row.id,
    quantity: Number(quantity),
    expectedPriceUsd: row.salePriceUsd,
  }));
export const paymentInputs = (entries: TenderDraft[]) =>
  entries.filter(isStartedTender).map(tenderInput);

export function cartTotal(entries: StockSelection[]) {
  let total = 0n;
  for (const { row, quantity } of entries) {
    if (!/^[1-9]\d{0,5}$/.test(quantity) || Number(quantity) > row.available) return null;
    const [whole = '0', fraction = ''] = row.salePriceUsd.split('.');
    const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
    total += cents * BigInt(quantity);
  }
  const digits = total.toString().padStart(3, '0');
  return digits.slice(0, -2) + '.' + digits.slice(-2);
}

export const correctionLabel = (kind: 'RETURN' | 'EXCHANGE') =>
  kind === 'RETURN' ? 'Devolución' : 'Cambio';
