import { describe, expect, it } from 'vitest';

import {
  customerFormSchema,
  customerTitle,
  EMPTY_CUSTOMER_VALUES,
  normaliseCustomerValues,
  parseCustomer,
  toCustomerFormValues,
  type Customer,
  type CustomerFormValues,
} from '@/features/customers/types';
import { AppError } from '@/types/common';

const VALID: CustomerFormValues = {
  ...EMPTY_CUSTOMER_VALUES,
  name: 'Ravi Kumar',
  mobile: '+91 98765 00001',
  address: '12 Station Road',
  city: 'Jaipur',
  state: 'Rajasthan',
  pincode: '302001',
};

function parse(overrides: Partial<CustomerFormValues> = {}) {
  return customerFormSchema.safeParse({ ...VALID, ...overrides });
}

describe('customer form validation', () => {
  it('accepts a minimal valid customer', () => {
    expect(parse().success).toBe(true);
  });

  it('requires name, address, city and PIN code', () => {
    expect(parse({ name: 'R' }).success).toBe(false);
    expect(parse({ address: '' }).success).toBe(false);
    expect(parse({ city: '' }).success).toBe(false);
    expect(parse({ pincode: '' }).success).toBe(false);
  });

  it('rejects an invalid PIN code', () => {
    expect(parse({ pincode: '12345' }).success).toBe(false);
    expect(parse({ pincode: '012345' }).success).toBe(false);
    expect(parse({ pincode: '302001' }).success).toBe(true);
  });

  it('rejects a mobile number that is not a valid Indian mobile', () => {
    expect(parse({ mobile: '1234567890' }).success).toBe(false);
    expect(parse({ mobile: '98765' }).success).toBe(false);
    expect(parse({ mobile: '9876500001' }).success).toBe(true);
  });

  it('treats the alternate number as optional but validates it when present', () => {
    expect(parse({ alternateMobile: '' }).success).toBe(true);
    expect(parse({ alternateMobile: '12345' }).success).toBe(false);
    expect(parse({ alternateMobile: '9812345678' }).success).toBe(true);
  });

  it('refuses an alternate number identical to the primary', () => {
    const result = parse({ mobile: '9876500001', alternateMobile: '9876500001' });
    expect(result.success).toBe(false);
  });

  it('treats email as optional but validates the format', () => {
    expect(parse({ email: '' }).success).toBe(true);
    expect(parse({ email: 'not-an-email' }).success).toBe(false);
    expect(parse({ email: 'ravi@example.com' }).success).toBe(true);
  });

  it('validates the GSTIN format for both customer types', () => {
    expect(parse({ gstin: '' }).success).toBe(true);
    expect(parse({ gstin: 'INVALIDGSTIN' }).success).toBe(false);
    expect(parse({ gstin: '08AABCU9603R1ZM' }).success).toBe(true);
    expect(parse({ gstin: '08aabcu9603r1zm' }).success).toBe(true);
    expect(parse({ type: 'individual', gstin: '08AABCU9603R1ZM' }).success).toBe(true);
  });

  it('rejects an unknown state or language', () => {
    expect(parse({ state: 'Atlantis' as CustomerFormValues['state'] }).success).toBe(false);
    expect(
      parse({ preferredLanguage: 'fr' as CustomerFormValues['preferredLanguage'] }).success,
    ).toBe(false);
  });

  it('caps the notes length', () => {
    expect(parse({ notes: 'x'.repeat(1001) }).success).toBe(false);
  });
});

describe('normaliseCustomerValues', () => {
  it('strips the country code, upper-cases the GSTIN and lower-cases the email', () => {
    const result = normaliseCustomerValues({
      ...VALID,
      mobile: '+91 98765 00001',
      alternateMobile: '098123 45678',
      email: 'Ravi.Kumar@Example.COM',
      gstin: '08aabcu9603r1zm',
    });

    expect(result.mobile).toBe('9876500001');
    expect(result.alternateMobile).toBe('9812345678');
    expect(result.email).toBe('ravi.kumar@example.com');
    expect(result.gstin).toBe('08AABCU9603R1ZM');
  });

  it('drops blank optional fields instead of storing empty strings', () => {
    const result = normaliseCustomerValues(VALID);
    expect(result).not.toHaveProperty('businessName');
    expect(result).not.toHaveProperty('alternateMobile');
    expect(result).not.toHaveProperty('email');
    expect(result).not.toHaveProperty('gstin');
    expect(result).not.toHaveProperty('notes');
  });

  it('never produces a portal link or derived fields from the form', () => {
    const result = normaliseCustomerValues(VALID);
    expect(result).not.toHaveProperty('portalUserId');
    expect(result).not.toHaveProperty('nameLower');
    expect(result).not.toHaveProperty('id');
  });
});

describe('parseCustomer', () => {
  const NOW = new Date('2026-08-24T10:00:00.000Z');
  const stored = {
    id: 'c1',
    name: 'Ravi Kumar',
    nameLower: 'ravi kumar',
    type: 'individual',
    mobile: '9876500001',
    address: '12 Station Road',
    city: 'Jaipur',
    state: 'Rajasthan',
    pincode: '302001',
    preferredLanguage: 'hi',
    isArchived: false,
    portalUserId: null,
    createdAt: NOW,
    createdBy: 'uid-owner',
    updatedAt: NOW,
    updatedBy: 'uid-owner',
  };

  it('parses a well formed document', () => {
    expect(parseCustomer(stored, 'c1').name).toBe('Ravi Kumar');
  });

  it('defaults a missing portal link to null rather than failing', () => {
    const { portalUserId: _portalUserId, ...withoutLink } = stored;
    expect(parseCustomer(withoutLink, 'c1').portalUserId).toBeNull();
  });

  it('fails loudly on a malformed document', () => {
    const { mobile: _mobile, ...missing } = stored;
    expect(() => parseCustomer(missing, 'c1')).toThrow(AppError);
    expect(() => parseCustomer({ ...stored, isArchived: 'no' }, 'c1')).toThrow(AppError);
  });
});

describe('form round trip', () => {
  it('fills the form from a stored customer without losing values', () => {
    const customer: Customer = {
      id: 'c1',
      name: 'Shreeji Traders',
      businessName: 'Shreeji Traders Pvt Ltd',
      nameLower: 'shreeji traders',
      type: 'business',
      mobile: '9812345678',
      alternateMobile: '9876500001',
      email: 'accounts@shreeji.example',
      address: '4 Market Road',
      city: 'Udaipur',
      state: 'Rajasthan',
      pincode: '313001',
      gstin: '08AABCU9603R1ZM',
      preferredLanguage: 'en',
      notes: 'Prefers evening delivery',
      isArchived: false,
      portalUserId: null,
      createdAt: new Date('2026-08-24T10:00:00.000Z'),
      createdBy: 'uid-owner',
      updatedAt: new Date('2026-08-24T10:00:00.000Z'),
      updatedBy: 'uid-owner',
    };

    const values = toCustomerFormValues(customer);
    expect(customerFormSchema.safeParse(values).success).toBe(true);

    const normalised = normaliseCustomerValues(values);
    expect(normalised).toMatchObject({
      name: 'Shreeji Traders',
      businessName: 'Shreeji Traders Pvt Ltd',
      mobile: '9812345678',
      gstin: '08AABCU9603R1ZM',
      notes: 'Prefers evening delivery',
    });
  });

  it('shows the business name alongside the person when there is one', () => {
    expect(customerTitle({ name: 'Ravi Kumar', businessName: 'Kumar Prints' } as Customer)).toBe(
      'Ravi Kumar (Kumar Prints)',
    );
    expect(customerTitle({ name: 'Ravi Kumar' } as Customer)).toBe('Ravi Kumar');
  });
});
