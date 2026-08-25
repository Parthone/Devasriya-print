import { isDemoMode } from '@/config/demo';
import { demoJobPricing, setDemoJobPricing } from '@/features/demo/demo-store';
import type { ActorSnapshot } from '@/features/enquiries/services/enquiry.service';
import type { JobPricingDocument } from '@/features/jobs/pricing-types';
import {
  PRICING_COLUMNS,
  fromPricingLine,
  toJobPricingDocument,
  type JobPricingRow,
} from '@/features/jobs/services/pricing.rows';
import type { JobPricing } from '@/lib/pricing';
import { getSupabase } from '@/lib/supabase/client';
import { toAppError, unwrapMaybe } from '@/lib/supabase/errors';
import { TABLES } from '@/services/base/tables';
import type { Id } from '@/types/common';

/**
 * Reads the pricing for a job.
 *
 * Only ever requested when the signed-in user holds estimates:view - the caller
 * decides whether to ask, and the row level security policy on `job_pricing`
 * enforces it whatever the caller does. A job with no pricing yet simply has no
 * row, which is not an error.
 */
export async function findJobPricing(jobId: Id): Promise<JobPricingDocument | null> {
  if (isDemoMode()) return demoJobPricing(jobId);

  const row = unwrapMaybe(
    await getSupabase()
      .from(TABLES.jobPricing)
      .select(PRICING_COLUMNS)
      .eq('job_id', jobId)
      .maybeSingle<JobPricingRow>(),
  );
  return row ? toJobPricingDocument(row) : null;
}

/**
 * Saves pricing for a job.
 *
 * The header and every line are written in one transaction, so a half-saved
 * price list can never be read. Each line keeps the rate that was actually
 * used rather than a reference to the rate card, which is what stops a change
 * to a product price tomorrow from moving a job priced yesterday.
 */
export async function saveJobPricing(
  jobId: Id,
  pricing: JobPricing,
  actor: ActorSnapshot,
): Promise<void> {
  if (isDemoMode()) {
    setDemoJobPricing(jobId, pricing, actor.uid);
    return;
  }

  try {
    const { error } = await getSupabase().rpc('save_job_pricing', {
      p_job_id: jobId,
      p_pricing: {
        subtotal_paise: pricing.subtotal.paise,
        adjustment_paise: pricing.adjustment?.amount.paise ?? null,
        adjustment_reason: pricing.adjustment?.reason ?? null,
        total_paise: pricing.total.paise,
        lines: pricing.lines.map(fromPricingLine),
      },
    });
    if (error) throw error;
  } catch (error) {
    throw toAppError(error);
  }
}
