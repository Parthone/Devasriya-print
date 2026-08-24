import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  createEmployee,
  resendPasswordSetupEmail,
  updateEmployee,
} from '@/features/users/services/employee.service';
import { listUserProfiles, setUserActive } from '@/features/users/services/user-profile.service';
import type { EmployeeInput, EmployeeUpdateInput } from '@/features/users/types';
import { queryKeys } from '@/lib/queryClient';
import type { UserProfile } from '@/types/auth';
import { AppError, type Id } from '@/types/common';

export const USERS_QUERY_KEY = queryKeys.scope('users');

function describe(error: unknown, fallback: string): string {
  return error instanceof AppError ? error.message : fallback;
}

export function useUsers(): UseQueryResult<UserProfile[], Error> {
  return useQuery({
    queryKey: USERS_QUERY_KEY,
    queryFn: listUserProfiles,
  });
}

export function useCreateEmployee(actorId: Id) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: EmployeeInput) => createEmployee(input, actorId),
    onSuccess: (profile) => {
      void queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
      toast.success(`${profile.name} added`, {
        description: `A password setup email has been sent to ${profile.email}.`,
      });
    },
    onError: (error) => {
      toast.error('Could not add the employee', {
        description: describe(error, 'Please try again.'),
      });
    },
  });
}

export function useUpdateEmployee(actorId: Id) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ uid, changes }: { uid: Id; changes: EmployeeUpdateInput }) =>
      updateEmployee(uid, changes, actorId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
      toast.success('Employee updated');
    },
    onError: (error) => {
      toast.error('Could not update the employee', {
        description: describe(error, 'Please try again.'),
      });
    },
  });
}

export function useSetUserActive(actorId: Id) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ uid, isActive }: { uid: Id; isActive: boolean }) =>
      setUserActive(uid, isActive, actorId),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
      toast.success(variables.isActive ? 'Employee activated' : 'Employee deactivated');
    },
    onError: (error) => {
      toast.error('Could not change the account status', {
        description: describe(error, 'Please try again.'),
      });
    },
  });
}

export function useResendPasswordEmail() {
  return useMutation({
    mutationFn: (email: string) => resendPasswordSetupEmail(email),
    onSuccess: (_result, email) => {
      toast.success('Password email sent', { description: `Sent to ${email}.` });
    },
    onError: (error) => {
      toast.error('Could not send the password email', {
        description: describe(error, 'Please try again.'),
      });
    },
  });
}
