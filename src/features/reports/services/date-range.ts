import { businessDayNumber } from '@/lib/business-day';
import { financialYearKey } from '@/lib/financial-year';

export const RANGE_PRESETS = ['all', 'today', 'last-7', 'last-30', 'this-year', 'custom'] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export const RANGE_PRESET_LABELS: Record<RangePreset, string> = {
  all: 'All time',
  today: 'Today',
  'last-7': 'Last 7 days',
  'last-30': 'Last 30 days',
  'this-year': 'This financial year',
  custom: 'Custom dates',
};

export interface DateRange {
  from: Date | null;
  to: Date | null;
}

export const ALL_TIME: DateRange = { from: null, to: null };

/**
 * The range a preset means, in Asia/Kolkata business days.
 *
 * Both ends are inclusive: "last 7 days" means today and the six days before
 * it, not a rolling 168 hours, because that is what somebody running a report
 * on a Tuesday morning expects to see.
 */
export function rangeFor(
  preset: RangePreset,
  now: Date = new Date(),
  custom?: DateRange,
): DateRange {
  switch (preset) {
    case 'all':
      return ALL_TIME;
    case 'today':
      return { from: startOfDay(now), to: endOfDay(now) };
    case 'last-7':
      return { from: startOfDay(shiftDays(now, -6)), to: endOfDay(now) };
    case 'last-30':
      return { from: startOfDay(shiftDays(now, -29)), to: endOfDay(now) };
    case 'this-year':
      return { from: startOfFinancialYear(now), to: endOfDay(now) };
    case 'custom':
      return {
        from: custom?.from ? startOfDay(custom.from) : null,
        to: custom?.to ? endOfDay(custom.to) : null,
      };
  }
}

export function withinRange(value: Date | null | undefined, range: DateRange): boolean {
  if (!value) return range.from === null && range.to === null;
  if (range.from && value.getTime() < range.from.getTime()) return false;
  if (range.to && value.getTime() > range.to.getTime()) return false;
  return true;
}

export function describeRange(range: DateRange): string {
  if (!range.from && !range.to) return 'All time';
  const from = range.from ? formatDay(range.from) : 'the beginning';
  const to = range.to ? formatDay(range.to) : 'today';
  return `${from} to ${to}`;
}

function shiftDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

function startOfDay(value: Date): Date {
  return new Date(businessDayNumber(value) * 24 * 60 * 60 * 1000 - IST_OFFSET_MS);
}

function endOfDay(value: Date): Date {
  return new Date(startOfDay(value).getTime() + 24 * 60 * 60 * 1000 - 1);
}

/** 1 April, in Asia/Kolkata, of the financial year the date falls in. */
function startOfFinancialYear(value: Date): Date {
  const key = financialYearKey(value);
  const startYear = 2000 + Number(key.slice(0, 2));
  return new Date(Date.UTC(startYear, 3, 1) - IST_OFFSET_MS);
}

function formatDay(value: Date): string {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(
    value,
  );
}

/** Asia/Kolkata is a fixed +05:30 with no daylight saving, so this is exact. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
