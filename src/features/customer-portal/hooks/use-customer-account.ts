import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  createCustomerAccount,
  findAccountForCustomer,
  setCustomerAccountActive,
  type CreateCustomerAccountInput,
} from '@/features/customer-portal/services/customer-account.service';
import type { CustomerAccount } from '@/features/customer-portal/types';
import { queryKeys } from '@/lib/queryClient';
import { AppError, type Id } from '@/types/common';

export const CUSTOMER_ACCOUNTS_QUERY_KEY = queryKeys.scope('customerAccounts');

function describe(error: unknown, fallback: string): string {
  return error instanceof AppError ? error.message : fallback;
}

export function useCustomerAccount(
  customerId: Id | undefined,
  options: { enabled?: boolean } = {},
): UseQueryResult<CustomerAccount | null, Error> {
  return useQuery({
    queryKey: [...CUSTOMER_ACCOUNTS_QUERY_KEY, customerId],
    queryFn: () => findAccountForCustomer(customerId ?? ''),
    enabled: Boolean(customerId) && (options.enabled ?? true),
  });
}

export function useCreateCustomerAccount(actor: { uid: Id; name: string }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: Omit<CreateCustomerAccountInput, 'actor'>) =>
      createCustomerAccount({ ...variables, actor }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CUSTOMER_ACCOUNTS_QUERY_KEY });
      toast.success('Portal login created', {
        description: 'The customer has been emailed a link to set their password.',
      });
    },
    onError: (error) => {
      toast.error('Could not create the portal login', {
        description: describe(error, 'Try again.'),
      });
    },
  });
}

export function useSetCustomerAccountActive(actorId: Id) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: { account: CustomerAccount; isActive: boolean }) =>
      setCustomerAccountActive(variables.account, variables.isActive, actorId),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: CUSTOMER_ACCOUNTS_QUERY_KEY });
      toast.success(variables.isActive ? 'Portal access restored' : 'Portal access revoked');
    },
    onError: (error) => {
      toast.error('Could not change portal access', {
        description: describe(error, 'Try again.'),
      });
    },
  });
}
