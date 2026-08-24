import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { toast } from 'sonner';

import { listAuditEventsForUser } from '@/features/audit/services/audit.service';
import type { AuditActor, AuditEvent } from '@/features/audit/types';
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
export const AUDIT_QUERY_KEY = queryKeys.scope('audit');

function describe(error: unknown, fallback: string): string {
  return error instanceof AppError ? error.message : fallback;
}

export function useUsers(): UseQueryResult<UserProfile[], Error> {
  return useQuery({
    queryKey: USERS_QUERY_KEY,
    queryFn: listUserProfiles,
  });
}

/** Audit history for one employee. Only fetched while the dialog is open. */
export function useUserAuditLog(userId: Id | null): UseQueryResult<AuditEvent[], Error> {
  return useQuery({
    queryKey: [...AUDIT_QUERY_KEY, userId],
    queryFn: () => listAuditEventsForUser(userId ?? ''),
    enabled: Boolean(userId),
  });
}

export function useCreateEmployee(actor: AuditActor) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: EmployeeInput) => createEmployee(input, actor),
    onSuccess: (profile) => {
      void queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: AUDIT_QUERY_KEY });
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

export function useUpdateEmployee(actor: AuditActor) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      uid,
      changes,
      previous,
    }: {
      uid: Id;
      changes: EmployeeUpdateInput;
      previous: UserProfile;
    }) => updateEmployee(uid, changes, previous, actor),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: AUDIT_QUERY_KEY });
      toast.success('Employee updated');
    },
    onError: (error) => {
      toast.error('Could not update the employee', {
        description: describe(error, 'Please try again.'),
      });
    },
  });
}

export function useSetUserActive(actor: AuditActor) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ employee, isActive }: { employee: UserProfile; isActive: boolean }) =>
      setUserActive(employee, isActive, actor),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: AUDIT_QUERY_KEY });
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
