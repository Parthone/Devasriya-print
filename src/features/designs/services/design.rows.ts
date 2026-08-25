import {
  parseDesign,
  type DecisionOutcome,
  type DecisionSource,
  type Design,
  type DesignStatus,
} from '@/features/designs/types';
import type { Language } from '@/constants/india';
import { toAudit, toDate, toDateOrNull, toOptional, type AuditRow } from '@/lib/supabase/rows';
import type { DesignMimeType, DesignPreviewKind } from '@/types/attachments';

export interface DesignRow extends AuditRow {
  id: string;
  job_id: string;
  job_number: string;
  job_title: string;
  customer_id: string;
  customer_name: string;
  version: number;
  file_id: string;
  file_path: string;
  file_mime: DesignMimeType;
  file_size_bytes: number | string;
  file_original_name: string;
  file_uploaded_at: string;
  file_uploaded_by: string;
  preview_kind: DesignPreviewKind;
  preview_width: number | null;
  preview_height: number | null;
  uploaded_by_id: string;
  uploaded_by_name: string;
  uploaded_at: string;
  status: DesignStatus;
  designer_note: string | null;
  decision_outcome: DecisionOutcome | null;
  decision_comment: string | null;
  decision_at: string | null;
  decision_source: DecisionSource | null;
  decision_by_id: string | null;
  decision_by_name: string | null;
  decision_language: Language | null;
  submitted_at: string | null;
  superseded_at: string | null;
}

export const DESIGN_COLUMNS =
  'id, job_id, job_number, job_title, customer_id, customer_name, version, file_id, file_path,' +
  ' file_mime, file_size_bytes, file_original_name, file_uploaded_at, file_uploaded_by,' +
  ' preview_kind, preview_width, preview_height, uploaded_by_id, uploaded_by_name, uploaded_at,' +
  ' status, designer_note, decision_outcome, decision_comment, decision_at, decision_source,' +
  ' decision_by_id, decision_by_name, decision_language, submitted_at, superseded_at,' +
  ' created_at, created_by, updated_at, updated_by';

export function toDesign(row: DesignRow): Design {
  return parseDesign(
    {
      id: row.id,
      jobId: row.job_id,
      jobNumber: row.job_number,
      jobTitle: row.job_title,
      customerId: row.customer_id,
      customerName: row.customer_name,
      version: row.version,
      file: {
        id: row.file_id,
        storagePath: row.file_path,
        mimeType: row.file_mime,
        sizeBytes: Number(row.file_size_bytes),
        originalFileName: row.file_original_name,
        uploadedAt: toDate(row.file_uploaded_at),
        uploadedById: row.file_uploaded_by,
      },
      preview: {
        kind: row.preview_kind,
        width: row.preview_width,
        height: row.preview_height,
      },
      uploadedById: row.uploaded_by_id,
      uploadedByName: row.uploaded_by_name,
      uploadedAt: toDate(row.uploaded_at),
      status: row.status,
      designerNote: toOptional(row.designer_note),
      decision: row.decision_outcome
        ? {
            outcome: row.decision_outcome,
            comment: row.decision_comment ?? '',
            decidedAt: toDate(row.decision_at),
            source: row.decision_source ?? 'staff',
            byId: row.decision_by_id ?? '',
            byName: row.decision_by_name ?? '',
            ...(row.decision_language ? { language: row.decision_language } : {}),
          }
        : null,
      submittedAt: toDateOrNull(row.submitted_at),
      supersededAt: toDateOrNull(row.superseded_at),
      ...toAudit(row),
    },
    row.id,
  );
}
