import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  addFollowUp,
  assignEnquiry,
  findEnquiry,
  listEnquiries,
  type ActorSnapshot,
  type CustomerSnapshot,
  type EnquiryDirectory,
} from '@/features/enquiries/services/enquiry.service';
import {
  createEnquiryWithAudio,
  updateEnquiryWithAudio,
  type RecordingChange,
} from '@/features/enquiries/services/enquiry-workflow';
import type { Enquiry, EnquiryInput } from '@/features/enquiries/types';
import { JOBS_QUERY_KEY } from '@/features/jobs/hooks/use-jobs';
import type { LocalRecording } from '@/lib/audio/use-audio-recorder';
import { queryKeys } from '@/lib/queryClient';
import { AppError, type Id } from '@/types/common';

export const ENQUIRIES_QUERY_KEY = queryKeys.scope('enquiries');

function describe(error: unknown, fallback: string): string {
  return error instanceof AppError ? error.message : fallback;
}

export function useEnquiryDirectory(): UseQueryResult<EnquiryDirectory, Error> {
  return useQuery({ queryKey: ENQUIRIES_QUERY_KEY, queryFn: listEnquiries });
}

export function useEnquiry(id: Id | undefined): UseQueryResult<Enquiry | null, Error> {
  return useQuery({
    queryKey: [...ENQUIRIES_QUERY_KEY, id],
    queryFn: () => findEnquiry(id ?? ''),
    enabled: Boolean(id),
  });
}

export function useCreateEnquiry(actor: ActorSnapshot) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: {
      input: EnquiryInput;
      customer: CustomerSnapshot;
      recording: LocalRecording | null;
    }) => createEnquiryWithAudio({ ...variables, actor }),
    onSuccess: (enquiry) => {
      void queryClient.invalidateQueries({ queryKey: ENQUIRIES_QUERY_KEY });
      toast.success(`Enquiry ${enquiry.enquiryNumber} created`);
    },
    onError: (error) => {
      toast.error('Could not save the enquiry', { description: describe(error, 'Try again.') });
    },
  });
}

export function useUpdateEnquiry(actor: ActorSnapshot) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: {
      previous: Enquiry;
      input: EnquiryInput;
      customer: CustomerSnapshot;
      change: RecordingChange;
    }) => updateEnquiryWithAudio({ ...variables, actor }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ENQUIRIES_QUERY_KEY });
      toast.success('Enquiry updated');
    },
    onError: (error) => {
      toast.error('Could not update the enquiry', { description: describe(error, 'Try again.') });
    },
  });
}

export function useAddFollowUp(actor: ActorSnapshot) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: { enquiry: Enquiry; note: string; nextFollowUpAt: Date | null }) =>
      addFollowUp(variables.enquiry, variables.note, variables.nextFollowUpAt, actor),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ENQUIRIES_QUERY_KEY });
      toast.success('Follow-up recorded');
    },
    onError: (error) => {
      toast.error('Could not record the follow-up', { description: describe(error, 'Try again.') });
    },
  });
}

export function useAssignEnquiry(actor: ActorSnapshot) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: { enquiryId: Id; assignee: { id: Id; name: string } | null }) =>
      assignEnquiry(variables.enquiryId, variables.assignee, actor),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ENQUIRIES_QUERY_KEY });
      toast.success('Enquiry assignment updated');
    },
    onError: (error) => {
      toast.error('Could not assign the enquiry', { description: describe(error, 'Try again.') });
    },
  });
}

/** Invalidates both directories: conversion writes an enquiry and a job. */
export function useInvalidateEnquiriesAndJobs() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ENQUIRIES_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: JOBS_QUERY_KEY });
  };
}
