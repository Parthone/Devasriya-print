import { describe, expect, it } from 'vitest';

import { formatDate, formatDateTime, formatMoney, formatNumber, toDateKey } from '@/lib/format';
import { fromRupees } from '@/lib/money';

describe('format', () => {
  it('formats money in rupees with Indian digit grouping', () => {
    const formatted = formatMoney(fromRupees(1234567.5));
    expect(formatted).toContain('12,34,567.50');
    expect(formatted.startsWith('\u20B9')).toBe(true);
  });

  it('formats numbers with the en-IN locale', () => {
    expect(formatNumber(1234567)).toBe('12,34,567');
  });

  it('formats dates in the Asia/Kolkata timezone', () => {
    // 2026-08-24T19:30:00Z is 2026-08-25 01:00 IST.
    const utcInstant = new Date('2026-08-24T19:30:00.000Z');
    expect(formatDate(utcInstant)).toBe('25 Aug 2026');
    expect(toDateKey(utcInstant)).toBe('2026-08-25');
    expect(formatDateTime(utcInstant)).toContain('25 Aug 2026');
  });

  it('rejects invalid dates', () => {
    expect(() => formatDate('not-a-date')).toThrow(TypeError);
  });
});
