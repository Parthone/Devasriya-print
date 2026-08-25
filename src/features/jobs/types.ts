import { z } from 'zod';

import { fromDateInputValue, toDateInputValue } from '@/features/enquiries/types';
import { EMPTY_PICKUP, type PickupSnapshot } from '@/features/locations/types';
import type { AudioAttachment } from '@/types/attachments';
import type { Entity, Id } from '@/types/common';
import { AppError } from '@/types/common';

export const JOB_PRIORITIES = ['normal', 'urgent'] as const;
export type JobPriority = (typeof JOB_PRIORITIES)[number];

export const JOB_PRIORITY_LABELS: Record<JobPriority, string> = {
  normal: 'Normal',
  urgent: 'Urgent',
};

/**
 * Job status is deliberately coarse.
 *
 * Department level production stages belong to Module 8 and will live in their
 * own records keyed by job id; this field is the headline state everybody sees.
 */
export const JOB_STATUSES = [
  'open',
  'in-progress',
  'ready',
  'delivered',
  'on-hold',
  'cancelled',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  open: 'Open',
  'in-progress': 'In progress',
  ready: 'Ready for delivery',
  delivered: 'Delivered',
  'on-hold': 'On hold',
  cancelled: 'Cancelled',
};

export function isJobFinished(status: JobStatus): boolean {
  return status === 'delivered' || status === 'cancelled';
}

export interface Job extends Entity, PickupSnapshot {
  jobNumber: string;
  customerId: Id;
  customerName: string;
  customerMobile: string;
  /** Null for a direct job taken without an enquiry. */
  enquiryId?: Id | null;
  enquiryNumber?: string | null;
  jobDate: Date;
  title: string;
  requirementText: string;
  /** The exact recording referenced when the job was created or converted. */
  requirementAudio?: AudioAttachment | null;
  priority: JobPriority;
  expectedDeliveryDate?: Date | null;
  internalNotes?: string | undefined;
  assignedToId?: Id | null;
  assignedToName?: string | null;
  status: JobStatus;
}

export const jobFormSchema = z.object({
  customerId: z.string().min(1, 'Choose a customer'),
  jobDate: z.string().min(1, 'Job date is required'),
  title: z.string().trim().min(3, 'Give the job a short title').max(160, 'Title is too long'),
  requirementText: z
    .string()
    .trim()
    .min(3, 'Describe the work')
    .max(2000, 'Requirement is too long'),
  priority: z.enum(JOB_PRIORITIES),
  expectedDeliveryDate: z.string().optional(),
  internalNotes: z.string().trim().max(1000, 'Notes are too long').optional(),
  pickupLocationId: z.string().optional(),
  status: z.enum(JOB_STATUSES),
});

export type JobFormValues = z.infer<typeof jobFormSchema>;

export const EMPTY_JOB_VALUES: JobFormValues = {
  customerId: '',
  jobDate: '',
  title: '',
  requirementText: '',
  priority: 'normal',
  expectedDeliveryDate: '',
  internalNotes: '',
  pickupLocationId: '',
  status: 'open',
};

export interface JobInput extends PickupSnapshot {
  customerId: Id;
  jobDate: Date;
  title: string;
  requirementText: string;
  priority: JobPriority;
  expectedDeliveryDate: Date | null;
  internalNotes?: string | undefined;
  status: JobStatus;
}

export function normaliseJobValues(
  values: JobFormValues,
  pickup: PickupSnapshot = EMPTY_PICKUP,
): JobInput {
  const internalNotes = values.internalNotes?.trim();

  return {
    customerId: values.customerId,
    jobDate: fromDateInputValue(values.jobDate) ?? new Date(),
    title: values.title.trim(),
    requirementText: values.requirementText.trim(),
    priority: values.priority,
    expectedDeliveryDate: fromDateInputValue(values.expectedDeliveryDate),
    status: values.status,
    ...pickup,
    ...(internalNotes ? { internalNotes } : {}),
  };
}

export function toJobFormValues(job: Job): JobFormValues {
  return {
    customerId: job.customerId,
    jobDate: toDateInputValue(job.jobDate),
    title: job.title,
    requirementText: job.requirementText,
    priority: job.priority,
    expectedDeliveryDate: toDateInputValue(job.expectedDeliveryDate),
    internalNotes: job.internalNotes ?? '',
    pickupLocationId: job.pickupLocationId ?? '',
    status: job.status,
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

const jobSchema = z.object({
  id: z.string().min(1),
  jobNumber: z.string().min(1),
  customerId: z.string().min(1),
  customerName: z.string(),
  customerMobile: z.string(),
  enquiryId: z.string().nullable().default(null),
  enquiryNumber: z.string().nullable().default(null),
  jobDate: z.date(),
  title: z.string().min(1),
  requirementText: z.string(),
  requirementAudio: audioAttachmentSchema.nullable().optional().default(null),
  priority: z.enum(JOB_PRIORITIES),
  expectedDeliveryDate: z.date().nullable().default(null),
  internalNotes: z.string().optional(),
  pickupLocationId: z.string().nullable().default(null),
  pickupLocationName: z.string().nullable().default(null),
  contactPersonId: z.string().nullable().default(null),
  contactPersonName: z.string().nullable().default(null),
  contactPersonMobile: z.string().nullable().default(null),
  assignedToId: z.string().nullable().default(null),
  assignedToName: z.string().nullable().default(null),
  status: z.enum(JOB_STATUSES),
  createdAt: z.date(),
  createdBy: z.string(),
  updatedAt: z.date(),
  updatedBy: z.string(),
});

export function parseJob(data: unknown, id: string): Job {
  const result = jobSchema.safeParse(data);
  if (!result.success) {
    throw new AppError('invalid-input', `Job "${id}" is malformed.`, result.error);
  }
  return result.data;
}

/** What the convert-to-job dialog collects on top of the enquiry. */
export const conversionFormSchema = z.object({
  title: z.string().trim().min(3, 'Give the job a short title').max(160, 'Title is too long'),
  jobDate: z.string().min(1, 'Job date is required'),
  priority: z.enum(JOB_PRIORITIES),
  expectedDeliveryDate: z.string().optional(),
  pickupLocationId: z.string().optional(),
  internalNotes: z.string().trim().max(1000, 'Notes are too long').optional(),
});

export type ConversionFormValues = z.infer<typeof conversionFormSchema>;
