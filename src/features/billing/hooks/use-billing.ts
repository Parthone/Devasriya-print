import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  createInvoice,
  findInvoice,
  listInvoices,
  listPayments,
  recordPayment,
  updateInvoiceWording,
  type CreateInvoiceInput,
  type InvoiceDirectory,
  type RecordPaymentInput,
} from '@/features/billing/services/billing.service';
import type { Invoice, Payment } from '@/features/billing/types';
import type { ActorSnapshot } from '@/features/enquiries/services/enquiry.service';
import { queryKeys } from '@/lib/queryClient';
import { AppError, type Id } from '@/types/common';

export const BILLING_QUERY_KEY = queryKeys.scope('invoices');
export const PAYMENTS_QUERY_KEY = queryKeys.scope('payments');

function describe(error: unknown, fallback: string): string {
  return error instanceof AppError ? error.message : fallback;
}

export function useInvoiceDirectory(
  options: { enabled?: boolean } = {},
): UseQueryResult<InvoiceDirectory, Error> {
  return useQuery({
    queryKey: BILLING_QUERY_KEY,
    queryFn: listInvoices,
    enabled: options.enabled ?? true,
  });
}

export function useInvoice(id: Id | undefined): UseQueryResult<Invoice | null, Error> {
  return useQuery({
    queryKey: [...BILLING_QUERY_KEY, id],
    queryFn: () => findInvoice(id ?? ''),
    enabled: Boolean(id),
  });
}

export function usePayments(
  invoiceId: Id | undefined,
  options: { enabled?: boolean } = {},
): UseQueryResult<Payment[], Error> {
  return useQuery({
    queryKey: [...PAYMENTS_QUERY_KEY, invoiceId],
    queryFn: () => listPayments(invoiceId ?? ''),
    enabled: Boolean(invoiceId) && (options.enabled ?? true),
  });
}

/** Bills raised against one job, newest first. */
export function useInvoicesForJob(
  jobId: Id | undefined,
  options: { enabled?: boolean } = {},
): Invoice[] {
  const directory = useInvoiceDirectory({ enabled: options.enabled ?? true });
  return (directory.data?.invoices ?? []).filter((invoice) => invoice.jobId === jobId);
}

export function useCreateInvoice(actor: ActorSnapshot) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: Omit<CreateInvoiceInput, 'actor'>) =>
      createInvoice({ ...variables, actor }),
    onSuccess: (invoice) => {
      void queryClient.invalidateQueries({ queryKey: BILLING_QUERY_KEY });
      toast.success(`Invoice ${invoice.invoiceNumber} created`);
    },
    onError: (error) => {
      toast.error('Could not raise the invoice', { description: describe(error, 'Try again.') });
    },
  });
}

export function useRecordPayment(actor: ActorSnapshot) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: Omit<RecordPaymentInput, 'actor'>) =>
      recordPayment({ ...variables, actor }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BILLING_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: PAYMENTS_QUERY_KEY });
      toast.success('Payment recorded');
    },
    onError: (error) => {
      toast.error('Could not record the payment', { description: describe(error, 'Try again.') });
    },
  });
}

export function useUpdateInvoiceWording(actor: ActorSnapshot) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: {
      invoice: Invoice;
      notes?: string | undefined;
      terms?: string | undefined;
    }) => updateInvoiceWording({ ...variables, actor }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BILLING_QUERY_KEY });
      toast.success('Invoice updated');
    },
    onError: (error) => {
      toast.error('Could not update the invoice', { description: describe(error, 'Try again.') });
    },
  });
}
