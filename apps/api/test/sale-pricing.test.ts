import { describe, expect, it } from 'vitest';
import { priceCart, settlement } from '../src/sales/pricing.js';

const line = (unitPriceUsd: string) => ({ unitPriceUsd, quantity: 1, discount: null });

describe('importe de una venta', () => {
  it('descuenta primero por línea y prorratea el descuento global por saldo', () => {
    const sale = priceCart(
      [{ ...line('50.00'), discount: { kind: 'PERCENT', percentage: '20' } }, line('20.00')],
      { kind: 'FIXED', amountOriginal: '12000', currencyCode: 'COP', unitsPerUsd: '4000' },
    );
    expect(sale).toMatchObject({
      subtotalUsd: '70.00',
      discountUsd: '13.00',
      totalUsd: '57.00',
      lines: [
        { lineDiscountUsd: '10.00', globalDiscountUsd: '2.00', netUsd: '38.00' },
        { lineDiscountUsd: '0.00', globalDiscountUsd: '1.00', netUsd: '19.00' },
      ],
    });
  });

  it('asigna el centavo residual sin perder importes en empates ni gravar líneas en cero', () => {
    const sale = priceCart([line('0.01'), line('0.00'), line('0.01'), line('0.01')], {
      kind: 'PERCENT',
      percentage: '50',
    });
    expect(sale.discountUsd).toBe('0.02');
    expect(sale.totalUsd).toBe('0.01');
    expect(sale.lines.map(({ netUsd }) => netUsd)).toEqual(['0.00', '0.00', '0.00', '0.01']);
  });

  it('rechaza un descuento por encima de la base incluso antes del redondeo', () => {
    expect(() =>
      priceCart([line('1.00')], {
        kind: 'FIXED',
        currencyCode: 'COP',
        amountOriginal: '4001',
        unitsPerUsd: '4000',
      }),
    ).toThrow(expect.objectContaining({ code: 'DISCOUNT_EXCEEDS_TOTAL' }));
  });

  it('distingue faltante, sobrepago sin vuelto y cobro exacto', () => {
    expect(settlement('50.00', ['19.10', '30.89'], null)).toMatchObject({
      balanceDueUsd: '0.01',
      ready: false,
    });
    expect(settlement('50.00', ['19.10', '31.90'], null)).toMatchObject({
      changeDueUsd: '1.00',
      ready: false,
    });
    expect(settlement('50.00', ['19.10', '31.90'], '1.00')).toMatchObject({
      changeDueUsd: '1.00',
      netCollectedUsd: '50.00',
      balanceDueUsd: '0.00',
      ready: true,
    });
    expect(settlement('0.00', [], null).ready).toBe(true);
    expect(settlement('0.00', ['10.00'], '10.00').ready).toBe(false);
  });
});
