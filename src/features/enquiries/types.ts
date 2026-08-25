import { z } from 'zod';

import type { AudioAttachment } from '@/types/attachments';
import type { Entity, Id } from '@/types/common';
import { AppError } from '@/types/common';

export const ENQUIRY_SOURCES = [
  'walk-in',
  'phone',
  'whatsapp',
  'referral',
  'repeat',
  'other',
] as const;
export type EnquirySource = (typeof ENQUIRY_SOURCES)[number];

export const ENQUIRY_SOURCE_LABELS: Record<EnquirySource, string> = {
  'walk-in': 'Walk-in',
  phone: 'Phone call',
  whatsapp: 'WhatsApp',
  referral: 'Referral',
  repeat: 'Repeat customer',
  other: 'Other',
};

export const ENQUIRY_STATUSES = [
  'new',
  'contacted',
  'follow-up',
  'quotation-required',
  'converted',
  'lost',
  'closed',
] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

export const ENQUIRY_STATUS_LABELS: Record<EnquiryStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  'follow-up': 'Follow-up',
  'quotation-required': 'Quotation required',
  converted: 'Converted to job',
  lost: 'Lost',
  closed: 'Closed',
};

/**
 * Statuses a person may choose in the form.
 *
 * "Converted" is missing on purpose: it is set only by the conversion flow,
 * together with the job it produced, and the security rules enforce that.
 */
export const SELECTABLE_ENQUIRY_STATUSES = ENQUIRY_STATUSES.filter(
  (status) => status !== 'converted',
);

/** Statuses that mean no further work is expected. */
export function isEnquiryClosed(status: EnquiryStatus): boolean {
  return status === 'converted' || status === 'lost' || status === 'closed';
}

export interface FollowUpEntry {
  at: Date;
  byId: Id;
  byName: string;
  note: string;
}

export const MAX_FOLLOW_UPS = 50;

export interface Enquiry extends Entity {
  enquiryNumber: string;
  customerId: Id;
  /** Snapshots for lists and search. `customerId` stays authoritative. */
  customerName: string;
  customerMobile: string;
  enquiryDate: Date;
  source: EnquirySource;
  requirementText: string;
  requirementAudio?: AudioAttachment | null;
  notes?: string | undefined;
  assignedToId?: Id | null;
  assignedToName?: string | null;
  nextFollowUpAt?: Date | null;
  followUps: FollowUpEntry[];
  status: EnquiryStatus;
  lostReason?: string | undefined;
  convertedJobId?: Id | null;
  convertedAt?: Date | null;
}

export const enquiryFormSchema = z
  .object({
    customerId: z.string().min(1, 'Choose a customer'),
    enquiryDate: z.string().min(1, 'Enquiry date is required'),
    source: z.enum(ENQUIRY_SOURCES),
    requirementText: z
      .string()
      .trim()
      .min(3, 'Describe what the customer needs')
      .max(2000, 'Requirement is too long'),
    notes: z.string().trim().max(1000, 'Notes are too long').optional(),
    nextFollowUpAt: z.string().optional(),
    // 'converted' is accepted here only so an already converted enquiry can be
    // round-tripped. The form never offers it, the service refuses to set it,
    // and firestore.rules only allows it together with a new convertedJobId.
    status: z.enum(ENQUIRY_STATUSES),
    lostReason: z.string().trim().max(300, 'Reason is too long').optional(),
  })
  .refine((values) => values.status !== 'lost' || Boolean(values.lostReason?.trim()), {
    message: 'Say why the enquiry was lost',
    path: ['lostReason'],
  });

export type EnquiryFormValues = z.infer<typeof enquiryFormSchema>;

export const EMPTY_ENQUIRY_VALUES: EnquiryFormValues = {
  customerId: '',
  enquiryDate: '',
  source: 'walk-in',
  requirementText: '',
  notes: '',
  nextFollowUpAt: '',
  status: 'new',
  lostReason: '',
};

/** Date inputs are ISO date strings in the form; storage uses real Dates. */
export function toDateInputValue(date: Date | null | undefined): string {
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function fromDateInputValue(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export interface EnquiryInput {
  customerId: Id;
  enquiryDate: Date;
  source: EnquirySource;
  requirementText: string;
  notes?: string | undefined;
  nextFollowUpAt: Date | null;
  status: EnquiryStatus;
  lostReason?: string | undefined;
}

export function normaliseEnquiryValues(values: EnquiryFormValues): EnquiryInput {
  const notes = values.notes?.trim();
  const lostReason = values.lostReason?.trim();

  return {
    customerId: values.customerId,
    enquiryDate: fromDateInputValue(values.enquiryDate) ?? new Date(),
    source: values.source,
    requirementText: values.requirementText.trim(),
    nextFollowUpAt: fromDateInputValue(values.nextFollowUpAt),
    status: values.status,
    ...(notes ? { notes } : {}),
    ...(values.status === 'lost' && lostReason ? { lostReason } : {}),
  };
}

export function toEnquiryFormValues(enquiry: Enquiry): EnquiryFormValues {
  return {
    customerId: enquiry.customerId,
    enquiryDate: toDateInputValue(enquiry.enquiryDate),
    source: enquiry.source,
    requirementText: enquiry.requirementText,
    notes: enquiry.notes ?? '',
    nextFollowUpAt: toDateInputValue(enquiry.nextFollowUpAt),
    status: enquiry.status,
    lostReason: enquiry.lostReason ?? '',
  };
}

const audioAttachmentSchema = z.object({
  id: z.string().min(1),
  storagePath: z.string().min(1),
  mimeType: z.string().min(1),
  durationSeconds: z.number(),
  sizeBytes: z.number(),
  recordedAt: z.date(),
  uploadedById: z.string().min(1),
  source: z.enum(['staff', 'customer']),
});

const followUpSchema = z.object({
  at: z.date(),
  byId: z.string().min(1),
  byName: z.string(),
  note: z.string(),
});

const enquirySchema = z.object({
  id: z.string().min(1),
  enquiryNumber: z.string().min(1),
  customerId: z.string().min(1),
  customerName: z.string(),
  customerMobile: z.string(),
  enquiryDate: z.date(),
  source: z.enum(ENQUIRY_SOURCES),
  requirementText: z.string(),
  requirementAudio: audioAttachmentSchema.nullable().optional().default(null),
  notes: z.string().optional(),
  assignedToId: z.string().nullable().default(null),
  assignedToName: z.string().nullable().default(null),
  nextFollowUpAt: z.date().nullable().default(null),
  followUps: z.array(followUpSchema).default([]),
  status: z.enum(ENQUIRY_STATUSES),
  lostReason: z.string().optional(),
  convertedJobId: z.string().nullable().default(null),
  convertedAt: z.date().nullable().default(null),
  createdAt: z.date(),
  createdBy: z.string(),
  updatedAt: z.date(),
  updatedBy: z.string(),
});

export function parseEnquiry(data: unknown, id: string): Enquiry {
  const result = enquirySchema.safeParse(data);
  if (!result.success) {
    throw new AppError('invalid-input', `Enquiry "${id}" is malformed.`, result.error);
  }
  return result.data;
}
