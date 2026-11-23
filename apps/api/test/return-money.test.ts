import { describe, expect, it } from 'vitest';
import { refundableSlice, restockedLots } from '../src/returns/amounts.js';

describe('rectificación de ventas', () => {
  it('distribuye los centavos de una línea entre devoluciones sucesivas', () => {
    const each = [0, 1, 2].map((offset) => refundableSlice('149.99', 3, offset, 1).toFixed(2));
    expect(each).toEqual(['50.00', '49.99', '50.00']);
    expect(refundableSlice('149.99', 3, 1, 2).toFixed(2)).toBe('99.99');
  });

  it('recupera el costo de los lotes originales a partir del primer par disponible para devolver', () => {
    const original = [
      { lotId: 'a', quantity: 3, costUsd: '60.01' },
      { lotId: 'b', quantity: 1, costUsd: '27' },
    ];
    expect(
      restockedLots(original, 2, 2).map(({ originLotId, quantity, costUsd }) => [
        originLotId,
        quantity,
        costUsd.toFixed(2),
      ]),
    ).toEqual([
      ['a', 1, '20.00'],
      ['b', 1, '27.00'],
    ]);
  });
});
