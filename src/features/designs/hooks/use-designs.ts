import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  findDesign,
  listDesigns,
  listDesignsForCustomer,
  listDesignsForJob,
  recordDesignDecision,
  submitDesignForReview,
  uploadDesign,
  type ActorSnapshot,
  type DesignDirectory,
  type RecordDecisionInput,
  type UploadDesignInput,
} from '@/features/designs/services/design.service';
import type { Design } from '@/features/designs/types';
import { queryKeys } from '@/lib/queryClient';
import { AppError, type Id } from '@/types/common';

export const DESIGNS_QUERY_KEY = queryKeys.scope('designs');

function describe(error: unknown, fallback: string): string {
  return error instanceof AppError ? error.message : fallback;
}

export function useDesignDirectory(
  options: { enabled?: boolean } = {},
): UseQueryResult<DesignDirectory, Error> {
  return useQuery({
    queryKey: DESIGNS_QUERY_KEY,
    queryFn: listDesigns,
    enabled: options.enabled ?? true,
  });
}

export function useDesignsForJob(
  jobId: Id | undefined,
  options: { enabled?: boolean } = {},
): UseQueryResult<Design[], Error> {
  return useQuery({
    queryKey: [...DESIGNS_QUERY_KEY, 'job', jobId],
    queryFn: () => listDesignsForJob(jobId ?? ''),
    enabled: Boolean(jobId) && (options.enabled ?? true),
  });
}

/** The portal's own query: scoped to one customer, exactly as the rules are. */
export function useDesignsForCustomer(customerId: Id | undefined): UseQueryResult<Design[], Error> {
  return useQuery({
    queryKey: [...DESIGNS_QUERY_KEY, 'customer', customerId],
    queryFn: () => listDesignsForCustomer(customerId ?? ''),
    enabled: Boolean(customerId),
  });
}

export function useDesign(id: Id | undefined): UseQueryResult<Design | null, Error> {
  return useQuery({
    queryKey: [...DESIGNS_QUERY_KEY, id],
    queryFn: () => findDesign(id ?? ''),
    enabled: Boolean(id),
  });
}

export function useUploadDesign(actor: ActorSnapshot) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: Omit<UploadDesignInput, 'actor'>) =>
      uploadDesign({ ...variables, actor }),
    onSuccess: (design) => {
      void queryClient.invalidateQueries({ queryKey: DESIGNS_QUERY_KEY });
      toast.success(`Version ${String(design.version)} uploaded`);
    },
    onError: (error) => {
      toast.error('Could not upload the design', {
        description: describe(error, 'Try again.'),
      });
    },
  });
}

export function useSubmitDesign(actor: ActorSnapshot) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (design: Design) => submitDesignForReview(design, actor),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: DESIGNS_QUERY_KEY });
      toast.success('Sent to the customer for approval');
    },
    onError: (error) => {
      toast.error('Could not send it', { description: describe(error, 'Try again.') });
    },
  });
}

export function useRecordDesignDecision(actor: ActorSnapshot) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: Omit<RecordDecisionInput, 'actor'>) =>
      recordDesignDecision({ ...variables, actor }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: DESIGNS_QUERY_KEY });
      toast.success('Recorded');
    },
    onError: (error) => {
      toast.error('Could not record that', { description: describe(error, 'Try again.') });
    },
  });
}
