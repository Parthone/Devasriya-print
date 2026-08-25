import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  createProduct,
  listProducts,
  setProductActive,
  updateProduct,
} from '@/features/products/services/product.service';
import type { Product, ProductInput } from '@/features/products/types';
import { queryKeys } from '@/lib/queryClient';
import { AppError, type Id } from '@/types/common';

export const PRODUCTS_QUERY_KEY = queryKeys.scope('products');

function describe(error: unknown, fallback: string): string {
  return error instanceof AppError ? error.message : fallback;
}

export function useProducts(options: { enabled?: boolean } = {}): UseQueryResult<Product[], Error> {
  return useQuery({
    queryKey: PRODUCTS_QUERY_KEY,
    queryFn: listProducts,
    enabled: options.enabled ?? true,
  });
}

/** Only the entries that can be chosen for new work. */
export function useActiveProducts(enabled = true): Product[] {
  const query = useProducts({ enabled });
  return (query.data ?? []).filter((product) => product.isActive);
}

export function useCreateProduct(actorId: Id) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ProductInput) => createProduct(input, actorId),
    onSuccess: (product) => {
      void queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
      toast.success(`${product.name} added to the rate card`);
    },
    onError: (error) => {
      toast.error('Could not add the item', { description: describe(error, 'Try again.') });
    },
  });
}

export function useUpdateProduct(actorId: Id) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: Id; input: ProductInput }) =>
      updateProduct(id, input, actorId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
      toast.success('Rate card updated', {
        description: 'Jobs already priced keep the rate they were saved with.',
      });
    },
    onError: (error) => {
      toast.error('Could not update the item', { description: describe(error, 'Try again.') });
    },
  });
}

export function useSetProductActive(actorId: Id) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, isActive }: { id: Id; isActive: boolean }) =>
      setProductActive(id, isActive, actorId),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
      toast.success(variables.isActive ? 'Item reactivated' : 'Item deactivated');
    },
    onError: (error) => {
      toast.error('Could not change the item', { description: describe(error, 'Try again.') });
    },
  });
}
