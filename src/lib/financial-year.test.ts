import { describe, expect, it } from 'vitest';

import { financialYearKey, formatDocumentNumber } from '@/lib/financial-year';

describe('financial year', () => {
  it('starts in April', () => {
    expect(financialYearKey(new Date('2026-04-01T00:00:00+05:30'))).toBe('2627');
    expect(financialYearKey(new Date('2026-12-31T12:00:00+05:30'))).toBe('2627');
    expect(financialYearKey(new Date('2027-03-31T23:00:00+05:30'))).toBe('2627');
  });

  it('rolls over on 1 April', () => {
    expect(financialYearKey(new Date('2027-04-01T09:00:00+05:30'))).toBe('2728');
  });

  it('counts January to March as the previous financial year', () => {
    expect(financialYearKey(new Date('2027-01-15T09:00:00+05:30'))).toBe('2627');
  });

  it('uses Indian time, not the machine timezone', () => {
    // 31 March 2027 18:30 UTC is 1 April 2027 00:00 in Kolkata.
    expect(financialYearKey(new Date('2027-03-31T18:30:00.000Z'))).toBe('2728');
  });
});

describe('document numbers', () => {
  it('pads the sequence to four digits', () => {
    expect(formatDocumentNumber('ENQ', '2627', 1)).toBe('ENQ-2627-0001');
    expect(formatDocumentNumber('JOB', '2627', 42)).toBe('JOB-2627-0042');
    expect(formatDocumentNumber('JOB', '2627', 1234)).toBe('JOB-2627-1234');
  });
});
