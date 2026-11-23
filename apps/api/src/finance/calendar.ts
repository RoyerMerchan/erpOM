import type { FinanceReportFilters, FinanceWindow } from '@max-sport/shared';
import { HttpError } from '../http/errors.js';
import type { Transaction } from '../purchasing/transaction.js';

function moveDays(date: Date, count: number) {
  const moved = new Date(date);
  moved.setUTCDate(moved.getUTCDate() + count);
  return moved;
}
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const onCalendar = (value: string) => new Date(value + 'T00:00:00Z');

export function calendarDate(now: Date, timezone: string) {
  // This ordering retains the calendar year, month and day in the shop's timezone.
  const fields = new Intl.DateTimeFormat('es', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: 'year' | 'month' | 'day') =>
    fields.find((field) => field.type === type)?.value ?? '';
  return value('year').padStart(4, '0') + '-' + value('month') + '-' + value('day');
}

export function calendarDates(query: FinanceReportFilters, today: string) {
  const anchor = onCalendar(query.date ?? today);
  let from = anchor;
  let until = moveDays(anchor, 1);
  if (query.period === 'WEEK') {
    from = moveDays(anchor, -((anchor.getUTCDay() + 6) % 7));
    until = moveDays(from, 7);
  } else if (query.period === 'MONTH') {
    from = new Date(anchor);
    from.setUTCDate(1);
    until = new Date(from);
    until.setUTCMonth(until.getUTCMonth() + 1);
  } else if (query.period === 'RANGE' && query.from && query.to) {
    from = onCalendar(query.from);
    until = moveDays(onCalendar(query.to), 1);
  }
  // Keep extended ISO years intact for the PostgreSQL date cast.
  return {
    startDate: isoDate(from),
    endDate: isoDate(moveDays(until, -1)),
    beforeDate: until.toISOString().split('T')[0]?.replace(/^\+0*/, '') ?? '',
  };
}

export async function financeWindow(
  tx: Transaction,
  input: FinanceReportFilters,
): Promise<FinanceWindow> {
  const settings = await tx.shopSettings.findUnique({
    where: { id: 1 },
    select: { timezone: true },
  });
  if (!settings)
    throw new HttpError(409, 'SHOP_REQUIRED', 'Configura la zona horaria de la tienda.');
  const { timezone } = settings;
  const { startDate, endDate, beforeDate } = calendarDates(
    input,
    calendarDate(new Date(), timezone),
  );
  const [bounds] = await tx.$queryRaw<{ from: Date; to: Date }[]>`
    SELECT (${startDate}::date::timestamp AT TIME ZONE ${timezone}) AS "from",
      (${beforeDate}::date::timestamp AT TIME ZONE ${timezone}) AS "to"
  `;
  if (!bounds) throw new Error('Faltan los límites del informe.');
  return {
    timezone,
    startDate,
    endDate,
    from: bounds.from.toISOString(),
    to: bounds.to.toISOString(),
  };
}
