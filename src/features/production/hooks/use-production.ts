import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { toast } from 'sonner';

import type { ActorSnapshot } from '@/features/enquiries/services/enquiry.service';
import {
  advanceProductionTask,
  assignProductionTask,
  createWorkflowStage,
  findRunForJob,
  listProductionRuns,
  listRunEvents,
  listWorkflowStages,
  startProductionRun,
  updateWorkflowStage,
  type AdvanceTaskInput,
} from '@/features/production/services/production.service';
import {
  PRODUCTION_STATUS_LABELS,
  type ProductionEvent,
  type ProductionRun,
  type ProductionTask,
  type WorkflowStage,
  type WorkflowStageInput,
} from '@/features/production/types';
import { JOBS_QUERY_KEY } from '@/features/jobs/hooks/use-jobs';
import { queryKeys } from '@/lib/queryClient';
import { AppError, type Id } from '@/types/common';

export const PRODUCTION_QUERY_KEY = queryKeys.scope('production');
export const STAGES_QUERY_KEY = queryKeys.scope('workflowStages');

function describe(error: unknown, fallback: string): string {
  return error instanceof AppError ? error.message : fallback;
}

export function useWorkflowStages(
  options: { enabled?: boolean } = {},
): UseQueryResult<WorkflowStage[], Error> {
  return useQuery({
    queryKey: STAGES_QUERY_KEY,
    queryFn: listWorkflowStages,
    enabled: options.enabled ?? true,
  });
}

export function useCreateWorkflowStage(actorId: Id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: WorkflowStageInput) => createWorkflowStage(input, actorId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: STAGES_QUERY_KEY });
      toast.success('Stage added');
    },
    onError: (error) => {
      toast.error('Could not add the stage', { description: describe(error, 'Try again.') });
    },
  });
}

export function useUpdateWorkflowStage(actorId: Id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: { id: Id; input: WorkflowStageInput }) =>
      updateWorkflowStage(variables.id, variables.input, actorId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: STAGES_QUERY_KEY });
      toast.success('Stage updated');
    },
    onError: (error) => {
      toast.error('Could not update the stage', { description: describe(error, 'Try again.') });
    },
  });
}

export function useProductionRuns(
  options: { enabled?: boolean } = {},
): UseQueryResult<ProductionRun[], Error> {
  return useQuery({
    queryKey: PRODUCTION_QUERY_KEY,
    queryFn: listProductionRuns,
    enabled: options.enabled ?? true,
  });
}

export function useRunForJob(
  jobId: Id | undefined,
  options: { enabled?: boolean } = {},
): UseQueryResult<ProductionRun | null, Error> {
  return useQuery({
    queryKey: [...PRODUCTION_QUERY_KEY, 'job', jobId],
    queryFn: () => findRunForJob(jobId ?? ''),
    enabled: Boolean(jobId) && (options.enabled ?? true),
  });
}

export function useRunEvents(runId: Id | undefined): UseQueryResult<ProductionEvent[], Error> {
  return useQuery({
    queryKey: [...PRODUCTION_QUERY_KEY, 'events', runId],
    queryFn: () => listRunEvents(runId ?? ''),
    enabled: Boolean(runId),
  });
}

/**
 * Every production write also moves the job on, so both caches are invalidated
 * together - a job card must never show "open" while its first stage is running.
 */
function invalidateProduction(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: PRODUCTION_QUERY_KEY });
  void queryClient.invalidateQueries({ queryKey: JOBS_QUERY_KEY });
}

export function useStartProductionRun(actor: ActorSnapshot) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: Id) => startProductionRun(jobId, actor),
    onSuccess: (run) => {
      invalidateProduction(queryClient);
      toast.success(`${run.jobNumber} is in production`);
    },
    onError: (error) => {
      toast.error('Could not start production', { description: describe(error, 'Try again.') });
    },
  });
}

export function useAdvanceTask(actor: ActorSnapshot) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: Omit<AdvanceTaskInput, 'actor'>) =>
      advanceProductionTask({ ...variables, actor }),
    onSuccess: (task) => {
      invalidateProduction(queryClient);
      toast.success(`${task.stageName}: ${PRODUCTION_STATUS_LABELS[task.status].toLowerCase()}`);
    },
    onError: (error) => {
      toast.error('Could not update the stage', { description: describe(error, 'Try again.') });
    },
  });
}

export function useAssignTask(actor: ActorSnapshot) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: { task: ProductionTask; assignee: { id: Id; name: string } | null }) =>
      assignProductionTask(variables.task, variables.assignee, actor),
    onSuccess: () => {
      invalidateProduction(queryClient);
      toast.success('Assignment saved');
    },
    onError: (error) => {
      toast.error('Could not assign the stage', { description: describe(error, 'Try again.') });
    },
  });
}
