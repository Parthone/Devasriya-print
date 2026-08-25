import { describe, expect, it } from 'vitest';

import {
  fromDate,
  toAudit,
  toDate,
  toDateOrNull,
  toMoney,
  toNumber,
  toOptional,
} from '@/lib/supabase/rows';

/**
 * Row to domain conversion.
 *
 * Two facts the whole data layer rests on: a timestamptz column is an ISO
 * string that has to become a real Date, and money is an integer number of
 * paise that PostgREST may hand over as a string because bigint does not fit a
 * JavaScript number safely.
 */
describe('timestamps', () => {
  it('turns a timestamptz string into a Date', () => {
    const value = toDate('2026-08-24T10:00:00.000Z');
    expect(value).toBeInstanceOf(Date);
    expect(value.toISOString()).toBe('2026-08-24T10:00:00.000Z');
  });

  it('keeps null separate from a date', () => {
    expect(toDateOrNull(null)).toBeNull();
    expect(toDateOrNull(undefined)).toBeNull();
    expect(toDateOrNull('2026-08-24T10:00:00.000Z')).toBeInstanceOf(Date);
  });

  it('writes a Date back as an ISO string, and null as null', () => {
    expect(fromDate(new Date('2026-08-24T10:00:00.000Z'))).toBe('2026-08-24T10:00:00.000Z');
    expect(fromDate(null)).toBeNull();
  });
});

describe('money', () => {
  it('reads paise whether the column arrives as a number or a string', () => {
    expect(toMoney(120_000)).toEqual({ paise: 120_000, currency: 'INR' });
    expect(toMoney('120000')).toEqual({ paise: 120_000, currency: 'INR' });
  });

  it('keeps a negative adjustment negative', () => {
    expect(toMoney(-28_000).paise).toBe(-28_000);
  });
});

describe('optional columns', () => {
  it('reads NULL as undefined rather than an empty string', () => {
    expect(toOptional(null)).toBeUndefined();
    expect(toOptional('Shreeji Traders')).toBe('Shreeji Traders');
  });

  it('reads a numeric column that PostgREST sent as a string', () => {
    expect(toNumber('6.5')).toBe(6.5);
    expect(toNumber(4)).toBe(4);
    expect(toNumber(null)).toBeUndefined();
  });
});

describe('audit columns', () => {
  it('maps the four columns every business table carries', () => {
    expect(
      toAudit({
        created_at: '2026-08-24T10:00:00.000Z',
        created_by: 'uid-owner',
        updated_at: '2026-08-25T10:00:00.000Z',
        updated_by: 'uid-sales',
      }),
    ).toEqual({
      createdAt: new Date('2026-08-24T10:00:00.000Z'),
      createdBy: 'uid-owner',
      updatedAt: new Date('2026-08-25T10:00:00.000Z'),
      updatedBy: 'uid-sales',
    });
  });
});
