import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { toast } from 'sonner';

import type { ActorSnapshot } from '@/features/enquiries/services/enquiry.service';
import {
  closeEstimate,
  createEstimate,
  findEstimate,
  listEstimates,
  markEstimateSent,
  recordEstimateDecision,
  updateDraftEstimate,
  type CreateEstimateInput,
  type EstimateDirectory,
} from '@/features/estimates/services/estimate.service';
import type { Estimate } from '@/features/estimates/types';
import { queryKeys } from '@/lib/queryClient';
import { AppError, type Id } from '@/types/common';

export const ESTIMATES_QUERY_KEY = queryKeys.scope('estimates');

function describe(error: unknown, fallback: string): string {
  return error instanceof AppError ? error.message : fallback;
}

export function useEstimateDirectory(
  options: { enabled?: boolean } = {},
): UseQueryResult<EstimateDirectory, Error> {
  return useQuery({
    queryKey: ESTIMATES_QUERY_KEY,
    queryFn: listEstimates,
    enabled: options.enabled ?? true,
  });
}

export function useEstimate(id: Id | undefined): UseQueryResult<Estimate | null, Error> {
  return useQuery({
    queryKey: [...ESTIMATES_QUERY_KEY, id],
    queryFn: () => findEstimate(id ?? ''),
    enabled: Boolean(id),
  });
}

/** Estimates raised against one job, newest first. */
export function useEstimatesForJob(
  jobId: Id | undefined,
  options: { enabled?: boolean } = {},
): Estimate[] {
  const directory = useEstimateDirectory({ enabled: options.enabled ?? true });
  return (directory.data?.estimates ?? []).filter((estimate) => estimate.jobId === jobId);
}

export function useCreateEstimate(actor: ActorSnapshot) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: Omit<CreateEstimateInput, 'actor'>) =>
      createEstimate({ ...variables, actor }),
    onSuccess: (estimate) => {
      void queryClient.invalidateQueries({ queryKey: ESTIMATES_QUERY_KEY });
      toast.success(`Quotation ${estimate.estimateNumber} created`);
    },
    onError: (error) => {
      toast.error('Could not create the quotation', {
        description: describe(error, 'Try again.'),
      });
    },
  });
}

export function useUpdateDraftEstimate(actor: ActorSnapshot) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: {
      estimate: Estimate;
      validUntil: Date;
      notes?: string | undefined;
      terms?: string | undefined;
    }) => updateDraftEstimate({ ...variables, actor }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ESTIMATES_QUERY_KEY });
      toast.success('Quotation updated');
    },
    onError: (error) => {
      toast.error('Could not update the quotation', {
        description: describe(error, 'Try again.'),
      });
    },
  });
}

export function useMarkEstimateSent(actor: ActorSnapshot) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (estimate: Estimate) => markEstimateSent(estimate, actor),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ESTIMATES_QUERY_KEY });
      toast.success('Marked as sent');
    },
    onError: (error) => {
      toast.error('Could not mark it sent', { description: describe(error, 'Try again.') });
    },
  });
}

export function useRecordEstimateDecision(actor: ActorSnapshot) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: {
      estimate: Estimate;
      outcome: 'approved' | 'rejected';
      note?: string | undefined;
    }) => recordEstimateDecision(variables.estimate, variables.outcome, variables.note, actor),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: ESTIMATES_QUERY_KEY });
      toast.success(variables.outcome === 'approved' ? 'Approval recorded' : 'Rejection recorded');
    },
    onError: (error) => {
      toast.error('Could not record the decision', {
        description: describe(error, 'Try again.'),
      });
    },
  });
}

export function useCloseEstimate(actor: ActorSnapshot) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: { estimate: Estimate; status: 'cancelled' | 'expired' }) =>
      closeEstimate(variables.estimate, variables.status, actor),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: ESTIMATES_QUERY_KEY });
      toast.success(variables.status === 'cancelled' ? 'Quotation cancelled' : 'Marked expired');
    },
    onError: (error) => {
      toast.error('Could not update the quotation', {
        description: describe(error, 'Try again.'),
      });
    },
  });
}
