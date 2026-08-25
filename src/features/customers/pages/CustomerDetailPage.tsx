import { Archive, ArchiveRestore, ArrowLeft, PencilLine } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { LANGUAGE_LABELS } from '@/constants/india';
import { ROUTES } from '@/constants/routes';
import { useAuthenticatedUser } from '@/features/auth/hooks/use-auth';
import { PortalAccessCard } from '@/features/customer-portal/components/PortalAccessCard';
import { ArchiveCustomerDialog } from '@/features/customers/components/ArchiveCustomerDialog';
import { CustomerFormDialog } from '@/features/customers/components/CustomerFormDialog';
import {
  CustomerLanguageBadge,
  CustomerStatusBadge,
} from '@/features/customers/components/CustomerStatusBadge';
import {
  useCustomer,
  useSetCustomerArchived,
  useUpdateCustomer,
} from '@/features/customers/hooks/use-customers';
import {
  CUSTOMER_TYPE_LABELS,
  type Customer,
  type CustomerInput,
} from '@/features/customers/types';
import { Can } from '@/features/permissions/components/Can';
import { formatDateTime } from '@/lib/format';
import { formatMobile } from '@/lib/phone';
import { AppError } from '@/types/common';

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-2 sm:grid-cols-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="col-span-2 text-sm sm:col-span-3">{value}</dd>
    </div>
  );
}

export function CustomerDetailPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const currentUser = useAuthenticatedUser();
  const customerQuery = useCustomer(customerId);
  const updateCustomer = useUpdateCustomer(currentUser.uid);
  const setArchived = useSetCustomerArchived(currentUser.uid);

  const [isFormOpen, setFormOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Customer | null>(null);

  if (customerQuery.isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (customerQuery.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {customerQuery.error instanceof AppError
          ? customerQuery.error.message
          : 'Could not load this customer.'}
      </p>
    );
  }

  const customer = customerQuery.data;

  if (!customer) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
        <h1 className="text-xl font-semibold">Customer not found</h1>
        <p className="text-sm text-muted-foreground">
          This customer does not exist, or it was removed before archiving was introduced.
        </p>
        <Button asChild>
          <Link to={ROUTES.customers}>Back to customers</Link>
        </Button>
      </div>
    );
  }

  const handleSubmit = async (values: CustomerInput): Promise<void> => {
    await updateCustomer.mutateAsync({ id: customer.id, input: values });
    setFormOpen(false);
  };

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link to={ROUTES.customers}>
          <ArrowLeft className="size-4" aria-hidden="true" /> All customers
        </Link>
      </Button>

      <PageHeader
        title={customer.name}
        description={customer.businessName ?? CUSTOMER_TYPE_LABELS[customer.type]}
        actions={
          <Can permission="customers:edit">
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setFormOpen(true);
                }}
              >
                <PencilLine className="size-4" aria-hidden="true" /> Edit
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setArchiveTarget(customer);
                }}
              >
                {customer.isArchived ? (
                  <>
                    <ArchiveRestore className="size-4" aria-hidden="true" /> Restore
                  </>
                ) : (
                  <>
                    <Archive className="size-4" aria-hidden="true" /> Archive
                  </>
                )}
              </Button>
            </div>
          </Can>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <CustomerStatusBadge customer={customer} />
        <CustomerLanguageBadge customer={customer} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Contact</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              <DetailRow label="Primary mobile" value={formatMobile(customer.mobile)} />
              {customer.alternateMobile ? (
                <DetailRow label="Alternate" value={formatMobile(customer.alternateMobile)} />
              ) : null}
              {customer.email ? <DetailRow label="Email" value={customer.email} /> : null}
              <DetailRow
                label="Preferred language"
                value={LANGUAGE_LABELS[customer.preferredLanguage]}
              />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Address</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              <DetailRow label="Address" value={customer.address} />
              <DetailRow label="City" value={customer.city} />
              <DetailRow label="State" value={customer.state} />
              <DetailRow label="PIN code" value={customer.pincode} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Business</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              <DetailRow label="Type" value={CUSTOMER_TYPE_LABELS[customer.type]} />
              {customer.businessName ? (
                <DetailRow label="Business name" value={customer.businessName} />
              ) : null}
              <DetailRow label="GSTIN" value={customer.gstin ?? 'Not provided'} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Record</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              <DetailRow label="Notes" value={customer.notes ?? 'None'} />
              <DetailRow label="Added" value={formatDateTime(customer.createdAt)} />
              <DetailRow label="Last updated" value={formatDateTime(customer.updatedAt)} />
            </dl>
          </CardContent>
        </Card>

        <PortalAccessCard customer={customer} />
      </div>

      <CustomerFormDialog
        open={isFormOpen}
        onOpenChange={setFormOpen}
        customer={customer}
        existingCustomers={[customer]}
        isSaving={updateCustomer.isPending}
        onSubmit={handleSubmit}
      />

      <ArchiveCustomerDialog
        customer={archiveTarget}
        isSaving={setArchived.isPending}
        onCancel={() => {
          setArchiveTarget(null);
        }}
        onConfirm={(target) => {
          setArchived.mutate(
            { id: target.id, isArchived: !target.isArchived },
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
