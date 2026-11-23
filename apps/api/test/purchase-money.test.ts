import { purchaseInput } from '@max-sport/shared';
import { expect, it } from 'vitest';
import { previewPurchase } from '../src/purchasing/money.js';

const supplierId = 'bf9d78cb-46e7-4690-982c-0adf78c99a53';
const documentAt = '2026-11-23T09:00:00-04:00';
const model = { mode: 'new', name: 'Legend', brand: { mode: 'new', name: 'MAX' } };
const line = (size: number, quantity: number, unitCostOriginal: string) => ({
  size,
  quantity,
  unitCostOriginal,
  salePriceUsd: '40.00',
});

it('calcula la compra Legend en decimal con 15 pares y USD 307', () => {
  const input = purchaseInput.parse({
    supplierId,
    documentAt,
    currencyCode: 'COP',
    unitsPerUsd: '4000',
    groups: [{ model, lines: [line(40, 7, '84000'), line(38, 3, '80000'), line(39, 5, '80000')] }],
  });
  const preview = previewPurchase(input, 0);
  expect(preview).toMatchObject({
    pairCount: 15,
    subtotalOriginal: '1228000',
    totalOriginal: '1228000',
    totalUsd: '307.00',
  });
  expect(preview.lines.map(({ size, unitCostUsd }) => [size, unitCostUsd])).toEqual([
    [38, '20'],
    [39, '20'],
    [40, '21'],
  ]);
});

it('distribuye flete por cantidad, asigna el residuo de forma determinista y suma los USD contabilizados', () => {
  const input = purchaseInput.parse({
    supplierId,
    documentAt,
    currencyCode: 'VES',
    unitsPerUsd: '2',
    freightOriginal: '0.02',
    groups: [{ model, lines: [line(41, 1, '0.01'), line(39, 1, '0.01'), line(40, 1, '0.01')] }],
  });
  const preview = previewPurchase(input, 2);
  expect(preview.totalOriginal).toBe('0.05');
  expect(preview.totalUsd).toBe('0.03');
  expect(preview.lines.map(({ freightOriginal }) => freightOriginal)).toEqual([
    '0.01',
    '0.01',
    '0.00',
  ]);
});

it('muestra el valor original sin tasa y rechaza una escala monetaria incompatible', () => {
  const input = purchaseInput.parse({
    supplierId,
    documentAt,
    currencyCode: 'COP',
    groups: [{ model, lines: [line(28, 1, '80001')] }],
  });
  expect(previewPurchase(input, 0)).toMatchObject({ totalOriginal: '80001', totalUsd: null });
  expect(() => previewPurchase({ ...input, freightOriginal: '0.01' }, 0)).toThrow('decimales');
  expect(
    purchaseInput.safeParse({
      ...input,
      groups: [{ model, lines: [line(28, 1, '1'), line(28, 1, '2')] }],
    }).success,
  ).toBe(false);
});
