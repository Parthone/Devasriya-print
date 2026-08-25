import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

import { isDemoMode } from '@/config/demo';
import { demoJobPricing, setDemoJobPricing } from '@/features/demo/demo-store';
import type { ActorSnapshot } from '@/features/enquiries/services/enquiry.service';
import { parseJobPricing, type JobPricingDocument } from '@/features/jobs/pricing-types';
import { getDb } from '@/lib/firebase/client';
import { toAppError } from '@/lib/firebase/errors';
import type { JobPricing } from '@/lib/pricing';
import { COLLECTIONS } from '@/services/base/collections';
import { FirestoreRepository } from '@/services/base/repository';
import type { Id } from '@/types/common';

export const jobPricingRepository = new FirestoreRepository<JobPricingDocument>(
  COLLECTIONS.jobPricing,
  parseJobPricing,
);

/**
 * Reads the pricing for a job.
 *
 * Only ever called when the signed-in user holds estimates:view - the caller
 * decides, and the security rules enforce it. A job with no pricing yet simply
 * has no document.
 */
export async function findJobPricing(jobId: Id): Promise<JobPricingDocument | null> {
  if (isDemoMode()) return demoJobPricing(jobId);
  return jobPricingRepository.findById(jobId);
}

/**
 * Saves pricing for a job.
 *
 * Lines and totals are written in one document, so they can never disagree.
 * The document id is the job id, which keeps the relationship exact and means
 * the first save creates it and later saves update it.
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
    const reference = doc(getDb(), COLLECTIONS.jobPricing, jobId);
    const existing = await getDoc(reference);

    if (existing.exists()) {
      await updateDoc(reference, {
        ...pricing,
        updatedAt: serverTimestamp(),
        updatedBy: actor.uid,
      });
      return;
    }

    await setDoc(reference, {
      ...pricing,
      jobId,
      createdAt: serverTimestamp(),
      createdBy: actor.uid,
      updatedAt: serverTimestamp(),
      updatedBy: actor.uid,
    });
  } catch (error) {
    throw toAppError(error);
  }
}
