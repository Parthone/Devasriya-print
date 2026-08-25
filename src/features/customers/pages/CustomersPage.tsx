import { AlertTriangle, Plus, Search, Users } from 'lucide-react';
import { useMemo, useState } from 'react';

import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthenticatedUser } from '@/features/auth/hooks/use-auth';
import { ArchiveCustomerDialog } from '@/features/customers/components/ArchiveCustomerDialog';
import { CustomerCardList } from '@/features/customers/components/CustomerCardList';
import { CustomerFormDialog } from '@/features/customers/components/CustomerFormDialog';
import { CustomerTable } from '@/features/customers/components/CustomerTable';
import {
  useCreateCustomer,
  useCustomerDirectory,
  useSetCustomerArchived,
  useUpdateCustomer,
} from '@/features/customers/hooks/use-customers';
import {
  DEFAULT_PAGE_SIZE,
  queryCustomers,
  type CustomerStatusFilter,
} from '@/features/customers/services/customer-search';
import type { Customer, CustomerInput } from '@/features/customers/types';
import { Can } from '@/features/permissions/components/Can';
import { usePermissions } from '@/features/permissions/hooks/use-permissions';
import { AppError } from '@/types/common';

const STATUS_LABELS: Record<CustomerStatusFilter, string> = {
  active: 'Active',
  archived: 'Archived',
  all: 'All',
};

/** Customer directory: search, filter, page, add and edit. */
export function CustomersPage() {
  const currentUser = useAuthenticatedUser();
  const { can } = usePermissions();
  const canEdit = can('customers:edit');

  const directoryQuery = useCustomerDirectory();
  const createCustomer = useCreateCustomer(currentUser.uid);
  const updateCustomer = useUpdateCustomer(currentUser.uid);
  const setArchived = useSetCustomerArchived(currentUser.uid);

  const [term, setTerm] = useState('');
  const [status, setStatus] = useState<CustomerStatusFilter>('active');
  const [page, setPage] = useState(1);
  const [isFormOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | undefined>(undefined);
  const [archiveTarget, setArchiveTarget] = useState<Customer | null>(null);

  const customers = useMemo(() => directoryQuery.data?.customers ?? [], [directoryQuery.data]);

  const result = useMemo(
    () => queryCustomers(customers, { term, status, page, pageSize: DEFAULT_PAGE_SIZE }),
    [customers, term, status, page],
  );

  const handleSubmit = async (values: CustomerInput): Promise<void> => {
    if (editing) {
      await updateCustomer.mutateAsync({ id: editing.id, input: values });
    } else {
      await createCustomer.mutateAsync(values);
    }
    setFormOpen(false);
    setEditing(undefined);
  };

  const isSaving = createCustomer.isPending || updateCustomer.isPending;

  return (
    <>
      <PageHeader
        title="Customers"
        description="Everyone the print shop works for. Records are archived, never deleted."
        actions={
          <Can permission="customers:create">
            <Button
              onClick={() => {
                setEditing(undefined);
                setFormOpen(true);
              }}
            >
              <Plus className="size-4" aria-hidden="true" /> Add customer
            </Button>
          </Can>
        }
      />

      {directoryQuery.data?.capReached ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Showing the first {directoryQuery.data.cap} customers only. Search and paging cover this
            set; ask for server side search before adding more.
          </span>
        </div>
      ) : null}

      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search
                className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={term}
                onChange={(event) => {
                  setTerm(event.target.value);
                  setPage(1);
                }}
                placeholder="Search name, business, mobile, email or GSTIN"
                aria-label="Search customers"
                className="pl-8"
              />
            </div>
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value as CustomerStatusFilter);
                setPage(1);
              }}
            >
              <SelectTrigger className="sm:w-40" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS_LABELS) as CustomerStatusFilter[]).map((value) => (
                  <SelectItem key={value} value={value}>
                    {STATUS_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {directoryQuery.isPending ? (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : directoryQuery.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {directoryQuery.error instanceof AppError
                ? directoryQuery.error.message
                : 'Could not load customers.'}
            </p>
          ) : result.items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <Users className="size-6" aria-hidden="true" />
              <p className="text-sm">
                {term || status !== 'active'
                  ? 'No customers match this search.'
                  : 'No customers yet. Add the first one to get started.'}
              </p>
            </div>
          ) : (
            <>
              <div className="hidden sm:block">
                <CustomerTable
                  customers={result.items}
                  canEdit={canEdit}
                  onEdit={(customer) => {
                    setEditing(customer);
                    setFormOpen(true);
                  }}
                  onToggleArchived={(customer) => {
                    setArchiveTarget(customer);
                  }}
                />
              </div>
              <div className="sm:hidden">
                <CustomerCardList
                  customers={result.items}
                  canEdit={canEdit}
                  onEdit={(customer) => {
                    setEditing(customer);
                    setFormOpen(true);
                  }}
                  onToggleArchived={(customer) => {
                    setArchiveTarget(customer);
                  }}
                />
              </div>

              <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  Showing {result.items.length} of {result.total} customers
                  {result.pageCount > 1 ? ` (page ${result.page} of ${result.pageCount})` : ''}
                </p>
                {result.pageCount > 1 ? (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={result.page <= 1}
                      onClick={() => {
                        setPage((current) => Math.max(1, current - 1));
                      }}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={result.page >= result.pageCount}
                      onClick={() => {
                        setPage((current) => current + 1);
                      }}
                    >
                      Next
                    </Button>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <CustomerFormDialog
        open={isFormOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(undefined);
        }}
        customer={editing}
        existingCustomers={customers}
        isSaving={isSaving}
        onSubmit={handleSubmit}
      />

      <ArchiveCustomerDialog
        customer={archiveTarget}
        isSaving={setArchived.isPending}
        onCancel={() => {
          setArchiveTarget(null);
        }}
        onConfirm={(customer) => {
          setArchived.mutate(
            { id: customer.id, isArchived: !customer.isArchived },
            {
              onSettled: () => {
                setArchiveTarget(null);
              },
            },
          );
        }}
      />
    </>
  );
}
