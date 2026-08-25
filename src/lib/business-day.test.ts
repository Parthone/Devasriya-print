import { describe, expect, it } from 'vitest';

import {
  businessDayKey,
  daysUntil,
  describeDueDate,
  isDueWithin,
  isOverdue,
  isToday,
} from '@/lib/business-day';

/**
 * Every case here is a moment where UTC and Indian time disagree about the
 * date. That is exactly when a naive comparison puts work on the wrong day.
 */
describe('business calendar days', () => {
  it('uses the Indian date, not the UTC date', () => {
    // 24 Aug 2026 19:00 UTC is already 25 Aug in Kolkata.
    expect(businessDayKey(new Date('2026-08-24T19:00:00.000Z'))).toBe('2026-08-25');
    expect(businessDayKey(new Date('2026-08-24T18:29:00.000Z'))).toBe('2026-08-24');
  });

  it('treats late evening in India as still today', () => {
    const lateEvening = new Date('2026-08-24T17:00:00.000Z'); // 22:30 IST
    const dueToday = new Date('2026-08-24T00:00:00+05:30');
    expect(isToday(dueToday, lateEvening)).toBe(true);
    expect(isOverdue(dueToday, lateEvening)).toBe(false);
  });

  it('rolls over at midnight Indian time, not at midnight UTC', () => {
    const justAfterMidnightIst = new Date('2026-08-24T18:31:00.000Z'); // 00:01 IST on the 25th
    const dueOnThe24th = new Date('2026-08-24T00:00:00+05:30');
    expect(isToday(dueOnThe24th, justAfterMidnightIst)).toBe(false);
    expect(isOverdue(dueOnThe24th, justAfterMidnightIst)).toBe(true);
  });

  it('counts whole calendar days between dates', () => {
    const now = new Date('2026-08-24T06:00:00.000Z');
    expect(daysUntil(new Date('2026-08-24T23:00:00+05:30'), now)).toBe(0);
    expect(daysUntil(new Date('2026-08-25T00:30:00+05:30'), now)).toBe(1);
    expect(daysUntil(new Date('2026-08-21T00:30:00+05:30'), now)).toBe(-3);
  });
});

describe('due windows', () => {
  const now = new Date('2026-08-24T06:00:00.000Z');

  it('includes today and the next three days', () => {
    for (const day of ['2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27']) {
      expect(isDueWithin(new Date(`${day}T09:00:00+05:30`), 3, now)).toBe(true);
    }
  });

  it('excludes the fourth day and anything already past', () => {
    expect(isDueWithin(new Date('2026-08-28T09:00:00+05:30'), 3, now)).toBe(false);
    expect(isDueWithin(new Date('2026-08-23T09:00:00+05:30'), 3, now)).toBe(false);
  });

  it('never counts an overdue date as due soon', () => {
    const yesterday = new Date('2026-08-23T09:00:00+05:30');
    expect(isOverdue(yesterday, now)).toBe(true);
    expect(isDueWithin(yesterday, 3, now)).toBe(false);
  });

  it('describes due dates in plain words', () => {
    expect(describeDueDate(new Date('2026-08-24T09:00:00+05:30'), now)).toBe('Today');
    expect(describeDueDate(new Date('2026-08-25T09:00:00+05:30'), now)).toBe('Tomorrow');
    expect(describeDueDate(new Date('2026-08-27T09:00:00+05:30'), now)).toBe('In 3 days');
    expect(describeDueDate(new Date('2026-08-23T09:00:00+05:30'), now)).toBe('Overdue by 1 day');
    expect(describeDueDate(new Date('2026-08-20T09:00:00+05:30'), now)).toBe('Overdue by 4 days');
  });
});
