import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  createLocation,
  listLocations,
  updateLocation,
} from '@/features/locations/services/location.service';
import type { Location, LocationInput } from '@/features/locations/types';
import { queryKeys } from '@/lib/queryClient';
import { AppError, type Id } from '@/types/common';

export const LOCATIONS_QUERY_KEY = queryKeys.scope('locations');

function describe(error: unknown, fallback: string): string {
  return error instanceof AppError ? error.message : fallback;
}

export function useLocations(): UseQueryResult<Location[], Error> {
  return useQuery({ queryKey: LOCATIONS_QUERY_KEY, queryFn: listLocations });
}

/** Only the offices that can currently be chosen for a job. */
export function useActiveLocations(): Location[] {
  const query = useLocations();
  return (query.data ?? []).filter((location) => location.isActive);
}

export function useCreateLocation(actorId: Id) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: LocationInput) => createLocation(input, actorId),
    onSuccess: (location) => {
      void queryClient.invalidateQueries({ queryKey: LOCATIONS_QUERY_KEY });
      toast.success(`${location.name} added`);
    },
    onError: (error) => {
      toast.error('Could not add the office', { description: describe(error, 'Try again.') });
    },
  });
}

export function useUpdateLocation(actorId: Id) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: Id; input: LocationInput }) =>
      updateLocation(id, input, actorId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LOCATIONS_QUERY_KEY });
      toast.success('Office updated');
    },
    onError: (error) => {
      toast.error('Could not update the office', { description: describe(error, 'Try again.') });
    },
  });
}
