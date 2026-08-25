import { APP_CONFIG } from '@/config/app.config';

/**
 * Calendar-day arithmetic in the business timezone.
 *
 * Everything the dashboard says about "today", "overdue" and "due in three
 * days" is a statement about calendar days in Asia/Kolkata. Comparing raw
 * instants would move a job to the wrong day for anyone whose machine is not on
 * Indian time, and for anyone looking late in the evening, when UTC has already
 * rolled over.
 */
const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_CONFIG.timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The business calendar date as "YYYY-MM-DD". */
export function businessDayKey(value: Date): string {
  const parts = dayKeyFormatter.formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Whole days since the epoch, counted in business calendar days. */
export function businessDayNumber(value: Date): number {
  const [year = '0', month = '1', day = '1'] = businessDayKey(value).split('-');
  return Date.UTC(Number(year), Number(month) - 1, Number(day)) / 86_400_000;
}

/**
 * Calendar days from `now` to `target`: negative in the past, 0 today,
 * positive in the future.
 */
export function daysUntil(target: Date, now: Date = new Date()): number {
  return businessDayNumber(target) - businessDayNumber(now);
}

export function isSameBusinessDay(a: Date, b: Date): boolean {
  return businessDayNumber(a) === businessDayNumber(b);
}

export function isToday(target: Date, now: Date = new Date()): boolean {
  return daysUntil(target, now) === 0;
}

/** Strictly before today, in business calendar days. */
export function isOverdue(target: Date, now: Date = new Date()): boolean {
  return daysUntil(target, now) < 0;
}

/**
 * Today through `days` days ahead, inclusive.
 *
 * Deliberately excludes anything already past: overdue work is reported on its
 * own, so nothing is counted twice.
 */
export function isDueWithin(target: Date, days: number, now: Date = new Date()): boolean {
  const diff = daysUntil(target, now);
  return diff >= 0 && diff <= days;
}

/** Short human label for a due date, e.g. "Overdue by 2 days", "Today". */
export function describeDueDate(target: Date, now: Date = new Date()): string {
  const diff = daysUntil(target, now);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Overdue by 1 day';
  if (diff < 0) return `Overdue by ${String(Math.abs(diff))} days`;
  return `In ${String(diff)} days`;
}
