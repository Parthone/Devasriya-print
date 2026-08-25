import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { toast } from 'sonner';

import type {
  ActorSnapshot,
  CustomerSnapshot,
} from '@/features/enquiries/services/enquiry.service';
import type { RecordingChange } from '@/features/enquiries/services/enquiry-workflow';
import {
  convertEnquiryToJob,
  type ConvertEnquiryInput,
} from '@/features/jobs/services/conversion.service';
import {
  assignJob,
  findJob,
  listJobs,
  type JobDirectory,
} from '@/features/jobs/services/job.service';
import { createJobWithAudio, updateJobWithAudio } from '@/features/jobs/services/job-workflow';
import type { Job, JobInput } from '@/features/jobs/types';
import type { LocalRecording } from '@/lib/audio/use-audio-recorder';
import { queryKeys } from '@/lib/queryClient';
import { AppError, type Id } from '@/types/common';

export const JOBS_QUERY_KEY = queryKeys.scope('jobs');
const ENQUIRIES_KEY = queryKeys.scope('enquiries');

function describe(error: unknown, fallback: string): string {
  return error instanceof AppError ? error.message : fallback;
}

export function useJobDirectory(): UseQueryResult<JobDirectory, Error> {
  return useQuery({ queryKey: JOBS_QUERY_KEY, queryFn: listJobs });
}

export function useJob(id: Id | undefined): UseQueryResult<Job | null, Error> {
  return useQuery({
    queryKey: [...JOBS_QUERY_KEY, id],
    queryFn: () => findJob(id ?? ''),
    enabled: Boolean(id),
  });
}

export function useCreateJob(actor: ActorSnapshot) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: {
      input: JobInput;
      customer: CustomerSnapshot;
      recording: LocalRecording | null;
    }) => createJobWithAudio({ ...variables, actor }),
    onSuccess: (job) => {
      void queryClient.invalidateQueries({ queryKey: JOBS_QUERY_KEY });
      toast.success(`Job ${job.jobNumber} created`);
    },
    onError: (error) => {
      toast.error('Could not save the job', { description: describe(error, 'Try again.') });
    },
  });
}

export function useUpdateJob(actor: ActorSnapshot) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: {
      previous: Job;
      input: JobInput;
      customer: CustomerSnapshot;
      change: RecordingChange;
    }) => updateJobWithAudio({ ...variables, actor }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: JOBS_QUERY_KEY });
      toast.success('Job updated');
    },
    onError: (error) => {
      toast.error('Could not update the job', { description: describe(error, 'Try again.') });
    },
  });
}

/** Assigning a job needs jobs:assign, which is owner and admin only. */
export function useAssignJob(actor: ActorSnapshot) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: { jobId: Id; assignee: { id: Id; name: string } | null }) =>
      assignJob(variables.jobId, variables.assignee, actor),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: JOBS_QUERY_KEY });
      toast.success('Job assignment updated');
    },
    onError: (error) => {
      toast.error('Could not assign the job', { description: describe(error, 'Try again.') });
    },
  });
}

export function useConvertEnquiry(actor: ActorSnapshot) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: Omit<ConvertEnquiryInput, 'actor'>) =>
      convertEnquiryToJob({ ...variables, actor }),
    onSuccess: (job) => {
      void queryClient.invalidateQueries({ queryKey: JOBS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ENQUIRIES_KEY });
      toast.success(`Job ${job.jobNumber} created from the enquiry`);
    },
    onError: (error) => {
      toast.error('Could not convert the enquiry', {
        description: describe(error, 'Try again.'),
      });
    },
  });
}
