import { z } from 'zod';

import { MOBILE_PATTERN, normaliseMobile } from '@/lib/phone';
import type { Entity, Id } from '@/types/common';
import { AppError } from '@/types/common';

/**
 * A pickup office where customers collect finished work.
 *
 * Each office carries one default contact person, so a customer always has
 * somebody to ask about status, payment or a problem with a design. Jobs
 * snapshot these values, so renaming an office later never rewrites history.
 */
export interface Location extends Entity {
  name: string;
  address: string;
  phone?: string | undefined;
  /** Employee uid, when the contact is a staff account. Optional. */
  contactUserId?: Id | null;
  contactName?: string | undefined;
  contactMobile?: string | undefined;
  isActive: boolean;
}

const optionalMobile = z
  .string()
  .trim()
  .optional()
  .refine((value) => !value || MOBILE_PATTERN.test(normaliseMobile(value)), {
    message: 'Enter a valid 10 digit mobile number',
  });

export const locationFormSchema = z.object({
  name: z.string().trim().min(2, 'Office name is required').max(120, 'Name is too long'),
  address: z.string().trim().min(3, 'Address is required').max(400, 'Address is too long'),
  phone: optionalMobile,
  contactName: z.string().trim().max(120, 'Name is too long').optional(),
  contactMobile: optionalMobile,
  isActive: z.boolean(),
});

export type LocationFormValues = z.infer<typeof locationFormSchema>;
export type LocationInput = LocationFormValues;

export const EMPTY_LOCATION_VALUES: LocationFormValues = {
  name: '',
  address: '',
  phone: '',
  contactName: '',
  contactMobile: '',
  isActive: true,
};

export function normaliseLocationValues(values: LocationFormValues): LocationInput {
  const optional = (value: string | undefined): string | undefined => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  };

  const phone = optional(values.phone);
  const contactName = optional(values.contactName);
  const contactMobile = optional(values.contactMobile);

  return {
    name: values.name.trim(),
    address: values.address.trim(),
    isActive: values.isActive,
    ...(phone ? { phone: normaliseMobile(phone) } : {}),
    ...(contactName ? { contactName } : {}),
    ...(contactMobile ? { contactMobile: normaliseMobile(contactMobile) } : {}),
  };
}

export function toLocationFormValues(location: Location): LocationFormValues {
  return {
    name: location.name,
    address: location.address,
    phone: location.phone ?? '',
    contactName: location.contactName ?? '',
    contactMobile: location.contactMobile ?? '',
    isActive: location.isActive,
  };
}

const locationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  address: z.string(),
  phone: z.string().optional(),
  contactUserId: z.string().nullable().default(null),
  contactName: z.string().optional(),
  contactMobile: z.string().optional(),
  isActive: z.boolean(),
  createdAt: z.date(),
  createdBy: z.string(),
  updatedAt: z.date(),
  updatedBy: z.string(),
});

export function parseLocation(data: unknown, id: string): Location {
  const result = locationSchema.safeParse(data);
  if (!result.success) {
    throw new AppError('invalid-input', `Location "${id}" is malformed.`, result.error);
  }
  return result.data;
}

/** The snapshot a job keeps when a pickup office is chosen. */
export interface PickupSnapshot {
  pickupLocationId: Id | null;
  pickupLocationName: string | null;
  contactPersonId: Id | null;
  contactPersonName: string | null;
  contactPersonMobile: string | null;
}

export const EMPTY_PICKUP: PickupSnapshot = {
  pickupLocationId: null,
  pickupLocationName: null,
  contactPersonId: null,
  contactPersonName: null,
  contactPersonMobile: null,
};

/** Builds the snapshot stored on a job from the chosen office. */
export function pickupSnapshotFor(location: Location | null | undefined): PickupSnapshot {
  if (!location) return EMPTY_PICKUP;
  return {
    pickupLocationId: location.id,
    pickupLocationName: location.name,
    contactPersonId: location.contactUserId ?? null,
    contactPersonName: location.contactName ?? null,
    contactPersonMobile: location.contactMobile ?? null,
  };
}
