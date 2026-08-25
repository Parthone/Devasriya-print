import { z } from 'zod';

import { LANGUAGES, type Language } from '@/constants/india';
import {
  DESIGN_MIME_TYPES,
  DESIGN_PREVIEW_KINDS,
  type DesignAttachment,
  type DesignPreview,
} from '@/types/attachments';
import { AppError, type Entity, type Id } from '@/types/common';

export const DESIGN_STATUSES = [
  'draft',
  'submitted-for-review',
  'changes-requested',
  'approved',
  'rejected',
  'superseded',
] as const;
export type DesignStatus = (typeof DESIGN_STATUSES)[number];

/** Staff-facing labels. The customer-facing wording lives in the i18n layer. */
export const DESIGN_STATUS_LABELS: Record<DesignStatus, string> = {
  draft: 'Draft',
  'submitted-for-review': 'With the customer',
  'changes-requested': 'Changes requested',
  approved: 'Approved',
  rejected: 'Rejected',
  superseded: 'Superseded',
};

/**
 * Allowed moves.
 *
 * A version is never edited into a different outcome: it is answered once and
 * then, when a newer version takes its place, marked superseded. `superseded`
 * is the only move out of a decided version, and it changes the status alone -
 * the file, the version number and the customer's comment stay exactly as they
 * were.
 */
export const DESIGN_TRANSITIONS: Record<DesignStatus, DesignStatus[]> = {
  draft: ['submitted-for-review', 'superseded'],
  'submitted-for-review': ['approved', 'rejected', 'changes-requested', 'superseded'],
  'changes-requested': ['superseded'],
  approved: ['superseded'],
  rejected: ['superseded'],
  superseded: [],
};

export function canTransition(from: DesignStatus, to: DesignStatus): boolean {
  return DESIGN_TRANSITIONS[from].includes(to);
}

/** Statuses that a decision may still be recorded against. */
export function isAwaitingDecision(status: DesignStatus): boolean {
  return status === 'submitted-for-review';
}

/** Versions that a newer revision replaces the moment it is uploaded. */
export function isSupersededByNewVersion(status: DesignStatus): boolean {
  return status === 'draft' || status === 'submitted-for-review';
}

export const DECISION_OUTCOMES = ['approved', 'rejected', 'changes-requested'] as const;
export type DecisionOutcome = (typeof DECISION_OUTCOMES)[number];

/** Who gave the answer. Never inferred - the rules pin it to the caller. */
export const DECISION_SOURCES = ['customer', 'staff'] as const;
export type DecisionSource = (typeof DECISION_SOURCES)[number];

/**
 * The customer's answer to one version.
 *
 * A comment is kept whatever the outcome, including approval: "approved, but
 * please make the font bigger" is a real and common answer, and losing the
 * second half of it would lose the instruction.
 */
export interface DesignDecision {
  outcome: DecisionOutcome;
  comment: string;
  decidedAt: Date;
  source: DecisionSource;
  /** The customer portal uid, or the staff uid when recorded on their behalf. */
  byId: Id;
  byName: string;
  /** The language the customer was reading in when they answered. */
  language?: Language | undefined;
}

/**
 * One design version.
 *
 * Every version is its own document and is never rewritten: a revision is a new
 * document with the next version number, so the file, the designer's note and
 * whatever the customer said about it stay readable for good.
 */
export interface Design extends Entity {
  jobId: Id;
  jobNumber: string;
  jobTitle: string;
  customerId: Id;
  customerName: string;
  version: number;
  file: DesignAttachment;
  preview: DesignPreview;
  uploadedById: Id;
  uploadedByName: string;
  uploadedAt: Date;
  status: DesignStatus;
  designerNote?: string | undefined;
  decision?: DesignDecision | null;
  submittedAt?: Date | null;
  supersededAt?: Date | null;
}

export const MAX_DESIGN_VERSIONS = 50;

/** The id of one version. Deterministic, which is what makes it unique. */
export function designIdFor(jobId: Id, version: number): Id {
  return `${jobId}-v${String(version)}`;
}

/** What a designer types when uploading. The file itself is not a form field. */
export const designUploadSchema = z.object({
  designerNote: z.string().trim().max(1000, 'Note is too long').optional(),
});

export type DesignUploadValues = z.infer<typeof designUploadSchema>;

const attachmentSchema = z.object({
  id: z.string().min(1),
  storagePath: z.string().min(1),
  mimeType: z.enum(DESIGN_MIME_TYPES),
  sizeBytes: z.number().int().nonnegative(),
  originalFileName: z.string(),
  uploadedAt: z.date(),
  uploadedById: z.string().min(1),
});

const previewSchema = z.object({
  kind: z.enum(DESIGN_PREVIEW_KINDS),
  width: z.number().int().positive().nullable().default(null),
  height: z.number().int().positive().nullable().default(null),
});

const designSchema = z.object({
  id: z.string().min(1),
  jobId: z.string().min(1),
  jobNumber: z.string(),
  jobTitle: z.string(),
  customerId: z.string().min(1),
  customerName: z.string(),
  version: z.number().int().positive(),
  file: attachmentSchema,
  preview: previewSchema,
  uploadedById: z.string().min(1),
  uploadedByName: z.string(),
  uploadedAt: z.date(),
  status: z.enum(DESIGN_STATUSES),
  designerNote: z.string().optional(),
  decision: z
    .object({
      outcome: z.enum(DECISION_OUTCOMES),
      comment: z.string(),
      decidedAt: z.date(),
      source: z.enum(DECISION_SOURCES),
      byId: z.string().min(1),
      byName: z.string(),
      language: z.enum(LANGUAGES).optional(),
    })
    .nullable()
    .default(null),
  submittedAt: z.date().nullable().default(null),
  supersededAt: z.date().nullable().default(null),
  createdAt: z.date(),
  createdBy: z.string(),
  updatedAt: z.date(),
  updatedBy: z.string(),
});

export function parseDesign(data: unknown, id: string): Design {
  const result = designSchema.safeParse(data);
  if (!result.success) {
    throw new AppError('invalid-input', `Design "${id}" is malformed.`, result.error);
  }
  return result.data;
}

/**
 * The version a job is currently working on: the highest numbered one that has
 * not been replaced. Everything else is history.
 */
export function currentDesign(designs: readonly Design[]): Design | null {
  const live = designs.filter((design) => design.status !== 'superseded');
  return live.reduce<Design | null>(
    (best, design) => (best === null || design.version > best.version ? design : best),
    null,
  );
}

/**
 * The approved artwork for a job - what Module 8 will send to production.
 *
 * The approval lives on the design document rather than as a pointer copied
 * onto the job. A customer approving from the portal writes one document, their
 * own design version; they are never given write access to the job record, and
 * there is no denormalised field that can drift out of step with the decision
 * that produced it.
 */
export function approvedDesign(designs: readonly Design[]): Design | null {
  return designs.find((design) => design.status === 'approved') ?? null;
}

export function nextVersionNumber(designs: readonly Design[]): number {
  return designs.reduce((highest, design) => Math.max(highest, design.version), 0) + 1;
}
