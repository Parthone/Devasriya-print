import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { toast } from 'sonner';

import type { ActorSnapshot } from '@/features/enquiries/services/enquiry.service';
import type { JobPricingDocument } from '@/features/jobs/pricing-types';
import { findJobPricing, saveJobPricing } from '@/features/jobs/services/job-pricing.service';
import type { JobPricing } from '@/lib/pricing';
import { queryKeys } from '@/lib/queryClient';
import { AppError, type Id } from '@/types/common';

export const JOB_PRICING_QUERY_KEY = queryKeys.scope('job-pricing');

/**
 * Pricing for one job.
 *
 * `enabled` is how the caller keeps a role without estimates:view from ever
 * asking for it, so no denied request is sent.
 */
export function useJobPricing(
  jobId: Id | undefined,
  options: { enabled?: boolean } = {},
): UseQueryResult<JobPricingDocument | null, Error> {
  return useQuery({
    queryKey: [...JOB_PRICING_QUERY_KEY, jobId],
    queryFn: () => findJobPricing(jobId ?? ''),
    enabled: Boolean(jobId) && (options.enabled ?? true),
  });
}

export function useUpdateJobPricing(actor: ActorSnapshot) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ jobId, pricing }: { jobId: Id; pricing: JobPricing }) =>
      saveJobPricing(jobId, pricing, actor),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: JOB_PRICING_QUERY_KEY });
      toast.success('Pricing saved');
    },
    onError: (error) => {
      toast.error('Could not save the pricing', {
        description: error instanceof AppError ? error.message : 'Try again.',
      });
    },
  });
}
