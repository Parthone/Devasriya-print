import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  createCustomer,
  findCustomer,
  listCustomers,
  setCustomerArchived,
  updateCustomer,
  type CustomerDirectory,
} from '@/features/customers/services/customer.service';
import type { Customer, CustomerInput } from '@/features/customers/types';
import { queryKeys } from '@/lib/queryClient';
import { AppError, type Id } from '@/types/common';

export const CUSTOMERS_QUERY_KEY = queryKeys.scope('customers');

function describe(error: unknown, fallback: string): string {
  return error instanceof AppError ? error.message : fallback;
}

/** The whole directory, cached. Search and pagination run against this. */
export function useCustomerDirectory(): UseQueryResult<CustomerDirectory, Error> {
  return useQuery({
    queryKey: CUSTOMERS_QUERY_KEY,
    queryFn: listCustomers,
  });
}

/** One customer, for the detail page and for deep links. */
export function useCustomer(id: Id | undefined): UseQueryResult<Customer | null, Error> {
  return useQuery({
    queryKey: [...CUSTOMERS_QUERY_KEY, id],
    queryFn: () => findCustomer(id ?? ''),
    enabled: Boolean(id),
  });
}

export function useCreateCustomer(actorId: Id) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CustomerInput) => createCustomer(input, actorId),
    onSuccess: (customer) => {
      void queryClient.invalidateQueries({ queryKey: CUSTOMERS_QUERY_KEY });
      toast.success(`${customer.name} added`);
    },
    onError: (error) => {
      toast.error('Could not add the customer', {
        description: describe(error, 'Please try again.'),
      });
    },
  });
}

export function useUpdateCustomer(actorId: Id) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: Id; input: CustomerInput }) =>
      updateCustomer(id, input, actorId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CUSTOMERS_QUERY_KEY });
      toast.success('Customer updated');
    },
    onError: (error) => {
      toast.error('Could not update the customer', {
        description: describe(error, 'Please try again.'),
      });
    },
  });
}

export function useSetCustomerArchived(actorId: Id) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, isArchived }: { id: Id; isArchived: boolean }) =>
      setCustomerArchived(id, isArchived, actorId),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: CUSTOMERS_QUERY_KEY });
      toast.success(variables.isArchived ? 'Customer archived' : 'Customer restored');
    },
    onError: (error) => {
      toast.error('Could not change the customer status', {
        description: describe(error, 'Please try again.'),
      });
    },
  });
}
