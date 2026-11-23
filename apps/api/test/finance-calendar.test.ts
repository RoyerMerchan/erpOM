import { describe, expect, it } from 'vitest';
import { calendarDate, calendarDates } from '../src/finance/calendar.js';

describe('calendario financiero', () => {
  it('usa la fecha local de la tienda cerca de la medianoche UTC', () => {
    expect(calendarDate(new Date('2026-11-23T02:00:00Z'), 'America/Caracas')).toBe('2026-11-22');
  });

  it('abre la semana el lunes y el mes en su primer día', () => {
    expect(calendarDates({ period: 'WEEK', date: '2026-01-01' }, '2026-11-23')).toEqual({
      startDate: '2025-12-29',
      endDate: '2026-01-04',
      beforeDate: '2026-01-05',
    });
    expect(calendarDates({ period: 'MONTH', date: '2024-02-20' }, '2026-11-23')).toEqual({
      startDate: '2024-02-01',
      endDate: '2024-02-29',
      beforeDate: '2024-03-01',
    });
  });

  it('incluye todo el último día del rango personalizado', () => {
    expect(
      calendarDates({ period: 'RANGE', from: '2026-11-19', to: '2026-11-30' }, '2026-11-23'),
    ).toEqual({
      startDate: '2026-11-19',
      endDate: '2026-11-30',
      beforeDate: '2026-12-01',
    });
  });
});
