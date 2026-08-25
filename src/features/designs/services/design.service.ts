import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';

import { isDemoMode } from '@/config/demo';
import type { Language } from '@/constants/india';
import {
  addDemoDesign,
  demoDesign,
  demoDesigns,
  demoDesignsForJob,
  updateDemoDesign,
} from '@/features/demo/demo-store';
import {
  canTransition,
  designIdFor,
  isSupersededByNewVersion,
  nextVersionNumber,
  parseDesign,
  type DecisionOutcome,
  type DecisionSource,
  type Design,
  type DesignStatus,
} from '@/features/designs/types';
import type { Job } from '@/features/jobs/types';
import { getDb } from '@/lib/firebase/client';
import { toAppError } from '@/lib/firebase/errors';
import { COLLECTIONS } from '@/services/base/collections';
import { FirestoreRepository, orderBy, where } from '@/services/base/repository';
import {
  discardDesignFile,
  measurePreview,
  uploadDesignFile,
} from '@/services/storage/design-storage.service';
import type { DesignMimeType } from '@/types/attachments';
import { AppError, type Id } from '@/types/common';

export const designRepository = new FirestoreRepository<Design>(COLLECTIONS.designs, parseDesign);

export const DESIGN_FETCH_CAP = 500;

export interface DesignDirectory {
  designs: Design[];
  capReached: boolean;
  cap: number;
}

/** Every design version, newest upload first. Staff only. */
export async function listDesigns(): Promise<DesignDirectory> {
  if (isDemoMode()) {
    return { designs: demoDesigns(), capReached: false, cap: DESIGN_FETCH_CAP };
  }

  const page = await designRepository.list({
    constraints: [orderBy('uploadedAt', 'desc')],
    pageSize: DESIGN_FETCH_CAP,
  });

  return { designs: page.items, capReached: page.hasMore, cap: DESIGN_FETCH_CAP };
}

/**
 * The versions one customer may see.
 *
 * The query filters on the customer id because that is exactly the condition
 * the security rules check: a portal user asking for anything wider is refused
 * by the database, not merely by this function.
 */
export async function listDesignsForCustomer(customerId: Id): Promise<Design[]> {
  if (isDemoMode()) {
    return demoDesigns().filter((design) => design.customerId === customerId);
  }

  const page = await designRepository.list({
    constraints: [where('customerId', '==', customerId), orderBy('uploadedAt', 'desc')],
    pageSize: DESIGN_FETCH_CAP,
  });
  return page.items;
}

export async function listDesignsForJob(jobId: Id): Promise<Design[]> {
  if (isDemoMode()) return demoDesignsForJob(jobId);

  const page = await designRepository.list({
    constraints: [where('jobId', '==', jobId), orderBy('version', 'desc')],
    pageSize: DESIGN_FETCH_CAP,
  });
  return page.items;
}

export async function findDesign(id: Id): Promise<Design | null> {
  if (isDemoMode()) return demoDesign(id);
  return designRepository.findById(id);
}

export interface ActorSnapshot {
  uid: Id;
  name: string;
}

export interface UploadDesignInput {
  job: Job;
  /** Every version already on the job, used to work out the next number. */
  existing: readonly Design[];
  file: Blob & { name?: string };
  mimeType: DesignMimeType;
  originalFileName: string;
  designerNote?: string | undefined;
  /** Send it to the customer straight away instead of keeping it as a draft. */
  submitNow?: boolean;
  actor: ActorSnapshot;
}

/**
 * Adds a new version to a job.
 *
 * Nothing existing is rewritten. The file goes to a path of its own, the
 * version gets its own document, and the versions it replaces are marked
 * superseded in the same batch - so the moment the revision exists, exactly one
 * version is the one under review. A version the customer has already answered
 * (approved, rejected or asked for changes on) keeps its status and its comment:
 * it is history, and replacing artwork never rewrites what was said about it.
 *
 * The document id is `{jobId}-v{version}`, so two designers uploading at the
 * same instant collide on the create rather than both being handed version 3.
 */
export async function uploadDesign({
  job,
  existing,
  file,
  mimeType,
  originalFileName,
  designerNote,
  submitNow = false,
  actor,
}: UploadDesignInput): Promise<Design> {
  const version = nextVersionNumber(existing);
  const designId = designIdFor(job.id, version);
  const now = new Date();

  const attachment = await uploadDesignFile({
    jobId: job.id,
    designId,
    file,
    mimeType,
    originalFileName,
    uploadedById: actor.uid,
  });
  const preview = await measurePreview(file, mimeType);

  const status: DesignStatus = submitNow ? 'submitted-for-review' : 'draft';
  const replaced = existing.filter((design) => isSupersededByNewVersion(design.status));

  const design: Design = {
    id: designId,
    jobId: job.id,
    jobNumber: job.jobNumber,
    jobTitle: job.title,
    customerId: job.customerId,
    customerName: job.customerName,
    version,
    file: attachment,
    preview,
    uploadedById: actor.uid,
    uploadedByName: actor.name,
    uploadedAt: now,
    status,
    decision: null,
    submittedAt: submitNow ? now : null,
    supersededAt: null,
    createdAt: now,
    createdBy: actor.uid,
    updatedAt: now,
    updatedBy: actor.uid,
    ...(designerNote?.trim() ? { designerNote: designerNote.trim() } : {}),
  };

  if (isDemoMode()) {
    for (const previous of replaced) {
      updateDemoDesign(previous.id, {
        status: 'superseded',
        supersededAt: now,
        updatedAt: now,
        updatedBy: actor.uid,
      });
    }
    return addDemoDesign(design);
  }

  try {
    const batch = writeBatch(getDb());
    const { id: _id, ...data } = design;
    batch.set(doc(getDb(), COLLECTIONS.designs, designId), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    for (const previous of replaced) {
      batch.update(doc(getDb(), COLLECTIONS.designs, previous.id), {
        status: 'superseded',
        supersededAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: actor.uid,
      });
    }

    await batch.commit();
    return design;
  } catch (error) {
    // The document never landed, so nothing points at the file we just wrote.
    await discardDesignFile(attachment);
    throw toAppError(error);
  }
}

function assertTransition(design: Design, next: DesignStatus): void {
  if (!canTransition(design.status, next)) {
    throw new AppError(
      'conflict',
      `A design that is ${design.status.replace(/-/g, ' ')} cannot become ${next.replace(/-/g, ' ')}.`,
    );
  }
}

/** Sends a draft to the customer for approval. */
export async function submitDesignForReview(design: Design, actor: ActorSnapshot): Promise<void> {
  assertTransition(design, 'submitted-for-review');
  const now = new Date();

  if (isDemoMode()) {
    updateDemoDesign(design.id, {
      status: 'submitted-for-review',
      submittedAt: now,
      updatedAt: now,
      updatedBy: actor.uid,
    });
    return;
  }

  try {
    const batch = writeBatch(getDb());
    batch.update(doc(getDb(), COLLECTIONS.designs, design.id), {
      status: 'submitted-for-review',
      submittedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: actor.uid,
    });
    await batch.commit();
  } catch (error) {
    throw toAppError(error);
  }
}

export interface RecordDecisionInput {
  design: Design;
  outcome: DecisionOutcome;
  comment: string;
  source: DecisionSource;
  /** Who is answering: the customer's portal uid, or the staff member's uid. */
  actor: ActorSnapshot;
  /** The version already approved for this job, if the outcome is approval. */
  previouslyApproved?: Design | null;
  language?: Language | undefined;
}

/**
 * Records the answer to one version.
 *
 * A comment is kept whatever the outcome. "Approved, but make the font bigger"
 * is an approval and an instruction at the same time, and throwing away the
 * second half because the first half was a yes would lose the only place that
 * instruction was ever written down.
 *
 * `source` says whether the customer answered themselves or a staff member
 * wrote it down for them. The security rules pin it to whoever is signed in, so
 * staff cannot post an answer as though it came from the customer.
 */
export async function recordDesignDecision({
  design,
  outcome,
  comment,
  source,
  actor,
  previouslyApproved = null,
  language,
}: RecordDecisionInput): Promise<void> {
  assertTransition(design, outcome === 'changes-requested' ? 'changes-requested' : outcome);

  const trimmed = comment.trim();
  if (outcome !== 'approved' && !trimmed) {
    throw new AppError('invalid-input', 'Say what needs to change, or why it was rejected.');
  }

  const now = new Date();
  const decision = {
    outcome,
    comment: trimmed,
    decidedAt: now,
    source,
    byId: actor.uid,
    byName: actor.name,
    ...(language ? { language } : {}),
  };

  // An earlier approved version steps aside so that a job never has two.
  const supersede =
    outcome === 'approved' && previouslyApproved && previouslyApproved.id !== design.id
      ? previouslyApproved
      : null;

  if (isDemoMode()) {
    updateDemoDesign(design.id, {
      status: outcome,
      decision,
      updatedAt: now,
      updatedBy: actor.uid,
    });
    if (supersede) {
      updateDemoDesign(supersede.id, {
        status: 'superseded',
        supersededAt: now,
        updatedAt: now,
        updatedBy: actor.uid,
      });
    }
    return;
  }

  try {
    const batch = writeBatch(getDb());
    batch.update(doc(getDb(), COLLECTIONS.designs, design.id), {
      status: outcome,
      decision: { ...decision, decidedAt: serverTimestamp() },
      updatedAt: serverTimestamp(),
      updatedBy: actor.uid,
    });

    if (supersede) {
      batch.update(doc(getDb(), COLLECTIONS.designs, supersede.id), {
        status: 'superseded',
        supersededAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: actor.uid,
      });
    }

    await batch.commit();
  } catch (error) {
    throw toAppError(error);
  }
}
