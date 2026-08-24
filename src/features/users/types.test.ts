import { describe, expect, it } from 'vitest';

import {
  employeeFormSchema,
  formatMobile,
  normaliseEmployeeValues,
  normaliseMobile,
  parseUserProfile,
  type EmployeeFormValues,
} from '@/features/users/types';
import { AppError } from '@/types/common';

const validValues: EmployeeFormValues = {
  name: 'Ravi Kumar',
  email: 'Ravi.Kumar@Devasriya.test',
  mobile: '+91 98765 43210',
  designation: 'machine-operator',
  department: 'printing',
  role: 'production',
  isActive: true,
};

describe('mobile numbers', () => {
  it('strips country code, spaces and punctuation', () => {
    expect(normaliseMobile('+91 98765 43210')).toBe('9876543210');
    expect(normaliseMobile('098765-43210')).toBe('9876543210');
    expect(normaliseMobile('9876543210')).toBe('9876543210');
  });

  it('formats for display', () => {
    expect(formatMobile('9876543210')).toBe('+91 98765 43210');
    expect(formatMobile('123')).toBe('123');
  });
});

describe('employeeFormSchema', () => {
  it('accepts a valid employee', () => {
    expect(employeeFormSchema.safeParse(validValues).success).toBe(true);
  });

  it('rejects a mobile number that is not a valid Indian mobile', () => {
    const result = employeeFormSchema.safeParse({ ...validValues, mobile: '1234567890' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid email and a short name', () => {
    expect(employeeFormSchema.safeParse({ ...validValues, email: 'not-an-email' }).success).toBe(
      false,
    );
    expect(employeeFormSchema.safeParse({ ...validValues, name: 'R' }).success).toBe(false);
  });

  it('rejects an unknown role or department', () => {
    expect(employeeFormSchema.safeParse({ ...validValues, role: 'superuser' }).success).toBe(false);
    expect(employeeFormSchema.safeParse({ ...validValues, department: 'canteen' }).success).toBe(
      false,
    );
  });

  it('normalises email case and mobile format before saving', () => {
    expect(normaliseEmployeeValues(validValues)).toMatchObject({
      email: 'ravi.kumar@devasriya.test',
      mobile: '9876543210',
    });
  });
});

describe('parseUserProfile', () => {
  const now = new Date('2026-08-24T10:00:00.000Z');
  const stored = {
    id: 'uid-1',
    name: 'Ravi Kumar',
    email: 'ravi@devasriya.test',
    mobile: '9876543210',
    designation: 'machine-operator',
    department: 'printing',
    role: 'production',
    isActive: true,
    createdAt: now,
    createdBy: 'uid-owner',
    updatedAt: now,
    updatedBy: 'uid-owner',
  };

  it('parses a well formed document', () => {
    expect(parseUserProfile(stored, 'uid-1').name).toBe('Ravi Kumar');
  });

  it('fails loudly on a malformed document instead of leaking undefined fields', () => {
    const { mobile: _mobile, ...missingMobile } = stored;
    expect(() => parseUserProfile(missingMobile, 'uid-1')).toThrow(AppError);
    expect(() => parseUserProfile({ ...stored, isActive: 'yes' }, 'uid-1')).toThrow(AppError);
  });
});
