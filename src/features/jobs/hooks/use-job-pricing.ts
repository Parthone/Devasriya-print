import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import type { ActorSnapshot } from '@/features/enquiries/services/enquiry.service';
import { JOBS_QUERY_KEY } from '@/features/jobs/hooks/use-jobs';
import { updateJobPricing } from '@/features/jobs/services/job.service';
import type { JobPricing } from '@/lib/pricing';
import { AppError, type Id } from '@/types/common';

export function useUpdateJobPricing(actor: ActorSnapshot) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ jobId, pricing }: { jobId: Id; pricing: JobPricing }) =>
      updateJobPricing(jobId, pricing, actor),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: JOBS_QUERY_KEY });
      toast.success('Pricing saved');
    },
    onError: (error) => {
      toast.error('Could not save the pricing', {
        description: error instanceof AppError ? error.message : 'Try again.',
      });
    },
  });
}
