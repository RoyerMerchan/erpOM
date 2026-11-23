import { describe, expect, it } from 'vitest';
import { analyticsDates, fillBuckets } from '../src/analytics/calendar.js';
import { csvField } from '../src/exports/reports.js';

describe('fechas y exportaciones de reportes', () => {
  it('compara semanas desde el lunes y meses calendario completos', () => {
    const week = analyticsDates({ period: 'THIS_WEEK' }, '2026-11-23');
    expect(week.current).toMatchObject({ startDate: '2026-11-23', endDate: '2026-11-29' });
    expect(week.previous).toMatchObject({ startDate: '2026-11-16', endDate: '2026-11-22' });
    const month = analyticsDates({ period: 'LAST_MONTH' }, '2024-03-15');
    expect(month.current).toMatchObject({ startDate: '2024-02-01', endDate: '2024-02-29' });
    expect(month.previous).toMatchObject({ startDate: '2024-01-01', endDate: '2024-01-31' });
  });

  it('compara rangos inclusivos y rellena los intervalos sin movimientos', () => {
    const range = analyticsDates({ period: 'LAST_7_DAYS' }, '2026-11-23');
    expect(range.current).toMatchObject({ startDate: '2026-11-17', endDate: '2026-11-23' });
    expect(range.previous).toMatchObject({ startDate: '2026-11-10', endDate: '2026-11-16' });
    const points = fillBuckets(
      {
        from: '2026-11-17T04:00:00Z',
        to: '2026-11-24T04:00:00Z',
        timezone: 'America/Caracas',
        startDate: '2026-11-17',
        endDate: '2026-11-23',
      },
      'WEEK',
      new Map([['2026-11-23', '80.21']]),
    );
    expect(points).toEqual([
      { date: '2026-11-16', value: '0.00' },
      { date: '2026-11-23', value: '80.21' },
    ]);
  });

  it('escapa comillas y fórmulas accidentales al exportar CSV', () => {
    expect(csvField('Zapato "Runner"')).toBe('"Zapato ""Runner"""');
    expect(csvField(' =1+1')).toBe('"\' =1+1"');
    expect(csvField('-45.00', 'USD')).toBe('"-45.00"');
  });
});
