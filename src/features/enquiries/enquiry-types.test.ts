import { describe, expect, it } from 'vitest';

import {
  EMPTY_ENQUIRY_VALUES,
  enquiryFormSchema,
  fromDateInputValue,
  isEnquiryClosed,
  normaliseEnquiryValues,
  parseEnquiry,
  SELECTABLE_ENQUIRY_STATUSES,
  toDateInputValue,
  type EnquiryFormValues,
} from '@/features/enquiries/types';
import { AppError } from '@/types/common';

const VALID: EnquiryFormValues = {
  ...EMPTY_ENQUIRY_VALUES,
  customerId: 'c1',
  enquiryDate: '2026-08-24',
  requirementText: 'Wedding cards, 250 pieces',
};

function parse(overrides: Partial<EnquiryFormValues> = {}) {
  return enquiryFormSchema.safeParse({ ...VALID, ...overrides });
}

describe('enquiry form validation', () => {
  it('accepts a minimal enquiry', () => {
    expect(parse().success).toBe(true);
  });

  it('requires a customer, a date and a requirement', () => {
    expect(parse({ customerId: '' }).success).toBe(false);
    expect(parse({ enquiryDate: '' }).success).toBe(false);
    expect(parse({ requirementText: 'no' }).success).toBe(false);
  });

  it('requires a reason when the enquiry is lost', () => {
    expect(parse({ status: 'lost' }).success).toBe(false);
    expect(parse({ status: 'lost', lostReason: 'Chose another press' }).success).toBe(true);
  });

  it('never offers "converted" as a status somebody can choose', () => {
    expect(SELECTABLE_ENQUIRY_STATUSES).not.toContain('converted');
    expect(SELECTABLE_ENQUIRY_STATUSES).toContain('follow-up');
  });

  it('knows which statuses mean the enquiry is finished', () => {
    expect(isEnquiryClosed('converted')).toBe(true);
    expect(isEnquiryClosed('lost')).toBe(true);
    expect(isEnquiryClosed('closed')).toBe(true);
    expect(isEnquiryClosed('follow-up')).toBe(false);
  });
});

describe('enquiry normalisation', () => {
  it('turns date inputs into dates and drops blanks', () => {
    const input = normaliseEnquiryValues({ ...VALID, notes: '   ', nextFollowUpAt: '2026-09-01' });
    expect(input.enquiryDate).toBeInstanceOf(Date);
    expect(input.nextFollowUpAt).toBeInstanceOf(Date);
    expect(input).not.toHaveProperty('notes');
  });

  it('keeps a lost reason only when the enquiry is lost', () => {
    expect(
      normaliseEnquiryValues({ ...VALID, status: 'lost', lostReason: 'Too expensive' }).lostReason,
    ).toBe('Too expensive');
    expect(
      normaliseEnquiryValues({ ...VALID, status: 'new', lostReason: 'ignored' }),
    ).not.toHaveProperty('lostReason');
  });

  it('round-trips date inputs', () => {
    const date = fromDateInputValue('2026-08-24');
    expect(date).not.toBeNull();
    expect(toDateInputValue(date)).toBe('2026-08-24');
    expect(fromDateInputValue('')).toBeNull();
    expect(toDateInputValue(null)).toBe('');
  });
});

describe('parseEnquiry', () => {
  const NOW = new Date('2026-08-24T10:00:00.000Z');
  const stored = {
    id: 'e1',
    enquiryNumber: 'ENQ-2627-0001',
    customerId: 'c1',
    customerName: 'Ravi Kumar',
    customerMobile: '9812300011',
    enquiryDate: NOW,
    source: 'walk-in',
    requirementText: 'Wedding cards',
    status: 'new',
    followUps: [],
    createdAt: NOW,
    createdBy: 'uid-owner',
    updatedAt: NOW,
    updatedBy: 'uid-owner',
  };

  it('parses a document and defaults the optional links', () => {
    const parsed = parseEnquiry(stored, 'e1');
    expect(parsed.convertedJobId).toBeNull();
    expect(parsed.requirementAudio).toBeNull();
    expect(parsed.followUps).toEqual([]);
  });

  it('fails loudly on a malformed document', () => {
    const { customerId: _customerId, ...missing } = stored;
    expect(() => parseEnquiry(missing, 'e1')).toThrow(AppError);
    expect(() => parseEnquiry({ ...stored, status: 'unknown' }, 'e1')).toThrow(AppError);
  });
});
