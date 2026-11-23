import type { AnalyticsQuery, AnalyticsResponse, FinanceWindow } from '@max-sport/shared';
import { calendarDate, calendarDates, windowForDates } from '../finance/calendar.js';
import { HttpError } from '../http/errors.js';
import type { Transaction } from '../purchasing/transaction.js';

const dayMs = 86_400_000;
const atMidnightUtc = (date: string) => new Date(date + 'T00:00:00Z');
const stamp = (date: Date) => date.toISOString().slice(0, 10);
const shift = (date: string, days: number) =>
  stamp(new Date(atMidnightUtc(date).getTime() + days * dayMs));
const daysBetween = (first: string, last: string) =>
  (atMidnightUtc(last).getTime() - atMidnightUtc(first).getTime()) / dayMs;
type Dates = ReturnType<typeof calendarDates>;
type Interval = AnalyticsResponse['interval'];
type Period = Pick<AnalyticsQuery, 'period' | 'from' | 'to'>;

export function analyticsDates(input: Period, today: string) {
  const { period } = input;
  let current: Dates;
  switch (period) {
    case 'YESTERDAY':
      current = calendarDates({ period: 'DAY', date: shift(today, -1) }, today);
      break;
    case 'LAST_7_DAYS':
      current = calendarDates({ period: 'RANGE', from: shift(today, -6), to: today }, today);
      break;
    case 'THIS_WEEK':
    case 'LAST_WEEK':
      current = calendarDates(
        { period: 'WEEK', date: period === 'THIS_WEEK' ? today : shift(today, -7) },
        today,
      );
      break;
    case 'THIS_MONTH':
    case 'LAST_MONTH':
      current = calendarDates(
        {
          period: 'MONTH',
          date: period === 'THIS_MONTH' ? today : shift(today.slice(0, 7) + '-01', -1),
        },
        today,
      );
      break;
    case 'RANGE':
      current = calendarDates({ period: 'RANGE', from: input.from, to: input.to }, today);
      break;
    default:
      current = calendarDates({ period: 'DAY', date: today }, today);
  }
  const previousEnd = shift(current.startDate, -1);
  if (period === 'THIS_MONTH' || period === 'LAST_MONTH') {
    return { current, previous: calendarDates({ period: 'MONTH', date: previousEnd }, today) };
  }
  const duration = daysBetween(current.startDate, current.endDate);
  return {
    current,
    previous: calendarDates(
      { period: 'RANGE', from: shift(previousEnd, -duration), to: previousEnd },
      today,
    ),
  };
}

export async function analyticsWindow(tx: Transaction, query: AnalyticsQuery) {
  const shop = await tx.shopSettings.findUnique({
    where: { id: 1 },
    select: { name: true, timezone: true },
  });
  if (!shop) throw new HttpError(409, 'SHOP_REQUIRED', 'Configura la zona horaria de la tienda.');
  const { current, previous } = analyticsDates(query, calendarDate(new Date(), shop.timezone));
  const days = daysBetween(current.startDate, current.endDate) + 1;
  const interval: Interval =
    query.interval === 'AUTO'
      ? days <= 35
        ? 'DAY'
        : days <= 120
          ? 'WEEK'
          : 'MONTH'
      : query.interval;
  const window = await windowForDates(tx, shop.timezone, current);
  const comparison = await windowForDates(tx, shop.timezone, previous);
  return { shopName: shop.name, window, comparison, interval };
}

function startBucket(value: string, interval: Interval) {
  if (interval === 'MONTH') return value.slice(0, 7) + '-01';
  if (interval === 'WEEK') return shift(value, -((atMidnightUtc(value).getUTCDay() + 6) % 7));
  return value;
}

export function fillBuckets(window: FinanceWindow, interval: Interval, data: Map<string, string>) {
  const step = interval === 'DAY' ? 1 : interval === 'WEEK' ? 7 : 28;
  const rows: { date: string; value: string }[] = [];
  // For very long histories keep the occupied intervals rather than emitting thousands of empty points.
  if (daysBetween(window.startDate, window.endDate) / step >= 600)
    return Array.from(data, ([date, value]) => ({ date, value })).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
  const end = startBucket(window.endDate, interval);
  for (let date = startBucket(window.startDate, interval); date <= end;) {
    rows.push({ date, value: data.get(date) ?? '0.00' });
    if (interval === 'MONTH') {
      const next = atMidnightUtc(date);
      next.setUTCMonth(next.getUTCMonth() + 1);
      date = stamp(next);
    } else date = shift(date, step);
  }
  return rows;
}
export type AnalyticsWindow = Awaited<ReturnType<typeof analyticsWindow>>;
