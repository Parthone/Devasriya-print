import { APP_CONFIG } from '@/config/app.config';
import { toRupees, type Money } from '@/lib/money';

export type DateInput = Date | number | string;

const { locale, timeZone, currency } = APP_CONFIG;

const currencyFormatter = new Intl.NumberFormat(locale, {
  style: 'currency',
  currency,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compactCurrencyFormatter = new Intl.NumberFormat(locale, {
  style: 'currency',
  currency,
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat(locale);

const dateFormatter = new Intl.DateTimeFormat(locale, {
  dateStyle: 'medium',
  timeZone,
});

const dateTimeFormatter = new Intl.DateTimeFormat(locale, {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone,
});

const timeFormatter = new Intl.DateTimeFormat(locale, {
  timeStyle: 'short',
  timeZone,
});

function toDate(value: DateInput): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`Invalid date value: ${String(value)}`);
  }
  return date;
}

/** Formats money in Indian rupees using the Indian digit grouping. */
export function formatMoney(value: Money): string {
  return currencyFormatter.format(toRupees(value));
}

/** Rupees without paise - for dashboard tiles and summary rows. */
export function formatMoneyCompact(value: Money): string {
  return compactCurrencyFormatter.format(toRupees(value));
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

/** e.g. "24 Aug 2026" in Asia/Kolkata. */
export function formatDate(value: DateInput): string {
  return dateFormatter.format(toDate(value));
}

/** e.g. "24 Aug 2026, 6:30 pm" in Asia/Kolkata. */
export function formatDateTime(value: DateInput): string {
  return dateTimeFormatter.format(toDate(value));
}

export function formatTime(value: DateInput): string {
  return timeFormatter.format(toDate(value));
}

/** Machine-readable date key in Asia/Kolkata, e.g. "2026-08-24". */
export function toDateKey(value: DateInput): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(toDate(value));

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';

  return `${get('year')}-${get('month')}-${get('day')}`;
}
