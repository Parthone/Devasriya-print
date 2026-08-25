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
  isSupersededByNewVersion,
  nextVersionNumber,
  type DecisionOutcome,
  type DecisionSource,
  type Design,
  type DesignStatus,
} from '@/features/designs/types';
import { DESIGN_COLUMNS, toDesign, type DesignRow } from '@/features/designs/services/design.rows';
import type { Job } from '@/features/jobs/types';
import { newId } from '@/lib/ids';
import { getSupabase } from '@/lib/supabase/client';
import { toAppError, unwrap, unwrapMaybe } from '@/lib/supabase/errors';
import { fromDate } from '@/lib/supabase/rows';
import { TABLES } from '@/services/base/tables';
import {
  discardDesignFile,
  measurePreview,
  uploadDesignFile,
} from '@/services/storage/design-storage.service';
import type { DesignMimeType } from '@/types/attachments';
import { AppError, type Id } from '@/types/common';

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

  const rows = unwrap(
    await getSupabase()
      .from(TABLES.designs)
      .select(DESIGN_COLUMNS)
      .order('uploaded_at', { ascending: false })
      .limit(DESIGN_FETCH_CAP + 1)
      .returns<DesignRow[]>(),
  );

  const capReached = rows.length > DESIGN_FETCH_CAP;
  return {
    designs: rows.slice(0, DESIGN_FETCH_CAP).map(toDesign),
    capReached,
    cap: DESIGN_FETCH_CAP,
  };
}

/**
 * The versions one customer may see.
 *
 * The query filters on the customer id because that is exactly the condition
 * the security policy applies: a portal user asking for anything wider gets
 * nothing back, because the database filters it out, not because this function
 * chose to.
 */
export async function listDesignsForCustomer(customerId: Id): Promise<Design[]> {
  if (isDemoMode()) {
    return demoDesigns().filter((design) => design.customerId === customerId);
  }

  const rows = unwrap(
    await getSupabase()
      .from(TABLES.designs)
      .select(DESIGN_COLUMNS)
      .eq('customer_id', customerId)
      .order('uploaded_at', { ascending: false })
      .limit(DESIGN_FETCH_CAP)
      .returns<DesignRow[]>(),
  );
  return rows.map(toDesign);
}

export async function listDesignsForJob(jobId: Id): Promise<Design[]> {
  if (isDemoMode()) return demoDesignsForJob(jobId);

  const rows = unwrap(
    await getSupabase()
      .from(TABLES.designs)
      .select(DESIGN_COLUMNS)
      .eq('job_id', jobId)
      .order('version', { ascending: false })
      .limit(DESIGN_FETCH_CAP)
      .returns<DesignRow[]>(),
  );
  return rows.map(toDesign);
}

export async function findDesign(id: Id): Promise<Design | null> {
  if (isDemoMode()) return demoDesign(id);

  const row = unwrapMaybe(
    await getSupabase()
      .from(TABLES.designs)
      .select(DESIGN_COLUMNS)
      .eq('id', id)
      .maybeSingle<DesignRow>(),
  );
  return row ? toDesign(row) : null;
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
 * version gets its own row, and the versions it replaces are marked superseded
 * in the same transaction - so the moment the revision exists, exactly one
 * version is the one under review. A version the customer has already answered
 * (approved, rejected or asked for changes on) keeps its status and its comment:
 * it is history, and replacing artwork never rewrites what was said about it.
 *
 * The version number is allocated inside the database, under an advisory lock
 * on the job, with a unique (job_id, version) index behind it - so two
 * designers uploading at the same instant cannot both be handed version 3.
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
  const now = new Date();
  const attachmentId = newId();

  const attachment = await uploadDesignFile({
    jobId: job.id,
    attachmentId,
    file,
    mimeType,
    originalFileName,
    uploadedById: actor.uid,
  });
  const preview = await measurePreview(file, mimeType);

  if (isDemoMode()) {
    const version = nextVersionNumber(existing);
    const replaced = existing.filter((design) => isSupersededByNewVersion(design.status));
    for (const previous of replaced) {
      updateDemoDesign(previous.id, {
        status: 'superseded',
        supersededAt: now,
        updatedAt: now,
        updatedBy: actor.uid,
      });
    }
    return addDemoDesign({
      id: `${job.id}-v${String(version)}`,
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
      status: submitNow ? 'submitted-for-review' : 'draft',
      decision: null,
      submittedAt: submitNow ? now : null,
      supersededAt: null,
      createdAt: now,
      createdBy: actor.uid,
      updatedAt: now,
      updatedBy: actor.uid,
      ...(designerNote?.trim() ? { designerNote: designerNote.trim() } : {}),
    });
  }

  try {
    const row = unwrap(
      await getSupabase()
        .rpc('create_design_version', {
          p_job_id: job.id,
          p_payload: {
            file_id: attachment.id,
            file_path: attachment.storagePath,
            file_mime: attachment.mimeType,
            file_size_bytes: attachment.sizeBytes,
            file_original_name: attachment.originalFileName,
            file_uploaded_at: fromDate(attachment.uploadedAt),
            preview_kind: preview.kind,
            preview_width: preview.width,
            preview_height: preview.height,
            uploaded_by_name: actor.name,
            designer_note: designerNote?.trim() ? designerNote.trim() : null,
          },
          p_submit_now: submitNow,
        })
        .single<DesignRow>(),
    );
    return toDesign(row);
  } catch (error) {
    // The row never landed, so nothing points at the file we just wrote.
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
    const { error } = await getSupabase()
      .from(TABLES.designs)
      .update({
        status: 'submitted-for-review',
        submitted_at: fromDate(now),
        updated_by: actor.uid,
      })
      .eq('id', design.id);
    if (error) throw error;
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

  // An earlier approved version steps aside so that a job never has two. In
  // production the database does this inside the same transaction; the demo
  // store needs to be told.
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
    // The answer and the stepping-aside of any earlier approval happen in one
    // transaction, so a job is never briefly showing two approved versions.
    // `record_design_decision` runs as the caller, so the policy that pins the
    // source to whoever is signed in still applies inside it.
    const { error } = await getSupabase().rpc('record_design_decision', {
      p_design_id: design.id,
      p_outcome: outcome,
      p_comment: trimmed,
      p_source: source,
      p_by_name: actor.name,
      p_language: language ?? null,
    });
    if (error) throw error;
  } catch (error) {
    throw toAppError(error);
  }
}
