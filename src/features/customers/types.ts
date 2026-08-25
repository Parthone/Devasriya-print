import { z } from 'zod';

import {
  DEFAULT_LANGUAGE,
  DEFAULT_STATE,
  GSTIN_PATTERN,
  INDIAN_STATES,
  LANGUAGES,
  PINCODE_PATTERN,
  type Language,
} from '@/constants/india';
import { MOBILE_PATTERN, normaliseMobile } from '@/lib/phone';
import type { Entity, Id } from '@/types/common';
import { AppError } from '@/types/common';

export const CUSTOMER_TYPES = ['individual', 'business'] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  individual: 'Individual',
  business: 'Business',
};

/**
 * A customer of the print shop.
 *
 * Customers are never deleted: enquiries, jobs, estimates and invoices will all
 * point at this record, so the only way out is `isArchived`.
 */
export interface Customer extends Entity {
  name: string;
  // `| undefined` is explicit because the project uses
  // exactOptionalPropertyTypes and these come back from a zod parse.
  businessName?: string | undefined;
  type: CustomerType;
  mobile: string;
  alternateMobile?: string | undefined;
  email?: string | undefined;
  address: string;
  city: string;
  state: string;
  pincode: string;
  gstin?: string | undefined;
  preferredLanguage: Language;
  notes?: string | undefined;
  isArchived: boolean;
  /**
   * Reserved link to a future customer portal account.
   *
   * Module 3 never sets or edits this - it exists so the portal module can
   * attach an auth account by writing one field, and the security rules keep
   * ordinary customer edits from touching it.
   */
  portalUserId: Id | null;
  /** Lower-cased name, written by the service. Used for ordering and search. */
  nameLower: string;
}

const mobileField = z
  .string()
  .trim()
  .min(1, 'Mobile number is required')
  .refine((value) => MOBILE_PATTERN.test(normaliseMobile(value)), {
    message: 'Enter a valid 10 digit mobile number',
  });

/**
 * The add / edit form.
 *
 * No transforms: form values and validated values have the same type, and
 * normalisation happens in `normaliseCustomerValues` on the way to the service.
 */
export const customerFormSchema = z
  .object({
    name: z.string().trim().min(2, 'Customer name is required').max(120, 'Name is too long'),
    businessName: z.string().trim().max(160, 'Business name is too long').optional(),
    type: z.enum(CUSTOMER_TYPES),
    mobile: mobileField,
    alternateMobile: z
      .string()
      .trim()
      .optional()
      .refine((value) => !value || MOBILE_PATTERN.test(normaliseMobile(value)), {
        message: 'Enter a valid 10 digit mobile number',
      }),
    email: z
      .string()
      .trim()
      .optional()
      .refine((value) => !value || z.string().email().safeParse(value).success, {
        message: 'Enter a valid email address',
      }),
    address: z.string().trim().min(3, 'Address is required').max(400, 'Address is too long'),
    city: z.string().trim().min(2, 'City is required').max(80, 'City is too long'),
    state: z.enum(INDIAN_STATES),
    pincode: z.string().trim().regex(PINCODE_PATTERN, 'Enter a valid 6 digit PIN code'),
    gstin: z
      .string()
      .trim()
      .optional()
      .refine((value) => !value || GSTIN_PATTERN.test(value.toUpperCase()), {
        message: 'Enter a valid 15 character GSTIN',
      }),
    preferredLanguage: z.enum(LANGUAGES),
    notes: z.string().trim().max(1000, 'Notes are too long').optional(),
    isArchived: z.boolean(),
  })
  .refine((values) => !values.alternateMobile || values.alternateMobile !== values.mobile, {
    message: 'Alternate number must be different from the primary number',
    path: ['alternateMobile'],
  });

export type CustomerFormValues = z.infer<typeof customerFormSchema>;
export type CustomerInput = Omit<Customer, keyof Entity | 'nameLower' | 'portalUserId'>;

export const EMPTY_CUSTOMER_VALUES: CustomerFormValues = {
  name: '',
  businessName: '',
  type: 'individual',
  mobile: '',
  alternateMobile: '',
  email: '',
  address: '',
  city: '',
  state: DEFAULT_STATE,
  pincode: '',
  gstin: '',
  preferredLanguage: DEFAULT_LANGUAGE,
  notes: '',
  isArchived: false,
};

/** Trims, upper-cases the GSTIN, strips +91 from numbers and drops blanks. */
export function normaliseCustomerValues(values: CustomerFormValues): CustomerInput {
  const optional = (value: string | undefined): string | undefined => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  };

  const alternate = optional(values.alternateMobile);
  const email = optional(values.email);
  const gstin = optional(values.gstin);
  const businessName = optional(values.businessName);
  const notes = optional(values.notes);

  return {
    name: values.name.trim(),
    type: values.type,
    mobile: normaliseMobile(values.mobile),
    address: values.address.trim(),
    city: values.city.trim(),
    state: values.state,
    pincode: values.pincode.trim(),
    preferredLanguage: values.preferredLanguage,
    isArchived: values.isArchived,
    ...(businessName ? { businessName } : {}),
    ...(alternate ? { alternateMobile: normaliseMobile(alternate) } : {}),
    ...(email ? { email: email.toLowerCase() } : {}),
    ...(gstin ? { gstin: gstin.toUpperCase() } : {}),
    ...(notes ? { notes } : {}),
  };
}

/** Fills the form from a stored customer. */
export function toCustomerFormValues(customer: Customer): CustomerFormValues {
  return {
    name: customer.name,
    businessName: customer.businessName ?? '',
    type: customer.type,
    mobile: customer.mobile,
    alternateMobile: customer.alternateMobile ?? '',
    email: customer.email ?? '',
    address: customer.address,
    city: customer.city,
    state: customer.state as CustomerFormValues['state'],
    pincode: customer.pincode,
    gstin: customer.gstin ?? '',
    preferredLanguage: customer.preferredLanguage,
    notes: customer.notes ?? '',
    isArchived: customer.isArchived,
  };
}

const customerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  businessName: z.string().optional(),
  type: z.enum(CUSTOMER_TYPES),
  mobile: z.string(),
  alternateMobile: z.string().optional(),
  email: z.string().optional(),
  address: z.string(),
  city: z.string(),
  state: z.string(),
  pincode: z.string(),
  gstin: z.string().optional(),
  preferredLanguage: z.enum(LANGUAGES),
  notes: z.string().optional(),
  isArchived: z.boolean(),
  portalUserId: z.string().nullable().default(null),
  nameLower: z.string(),
  createdAt: z.date(),
  createdBy: z.string(),
  updatedAt: z.date(),
  updatedBy: z.string(),
});

/** Parses a Firestore document, failing loudly on a malformed record. */
export function parseCustomer(data: unknown, id: string): Customer {
  const result = customerSchema.safeParse(data);
  if (!result.success) {
    throw new AppError('invalid-input', `Customer "${id}" is malformed.`, result.error);
  }
  return result.data;
}

/** Display helper: business name when there is one, otherwise the person. */
export function customerTitle(customer: Customer): string {
  return customer.businessName ? `${customer.name} (${customer.businessName})` : customer.name;
}
