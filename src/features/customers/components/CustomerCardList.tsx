import { Archive, ArchiveRestore, PencilLine } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  CustomerLanguageBadge,
  CustomerStatusBadge,
} from '@/features/customers/components/CustomerStatusBadge';
import { CUSTOMER_TYPE_LABELS, type Customer } from '@/features/customers/types';
import { formatMobile } from '@/lib/phone';

interface CustomerCardListProps {
  customers: Customer[];
  canEdit: boolean;
  onEdit: (customer: Customer) => void;
  onToggleArchived: (customer: Customer) => void;
}

/** Small-screen view of the directory: one card per customer. */
export function CustomerCardList({
  customers,
  canEdit,
  onEdit,
  onToggleArchived,
}: CustomerCardListProps) {
  return (
    <ul aria-label="Customer cards" className="space-y-3">
      {customers.map((customer) => (
        <li key={customer.id} className="rounded-lg border p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link
                to={`/customers/${customer.id}`}
                className="font-medium underline-offset-2 hover:underline"
              >
                {customer.name}
              </Link>
              <p className="truncate text-xs text-muted-foreground">
                {customer.businessName ?? CUSTOMER_TYPE_LABELS[customer.type]}
              </p>
            </div>
            <CustomerStatusBadge customer={customer} />
          </div>

          <dl className="mt-2 space-y-0.5 text-sm">
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Mobile</dt>
              <dd>{formatMobile(customer.mobile)}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground">City</dt>
              <dd>
                {customer.city}, {customer.state}
              </dd>
            </div>
          </dl>

          <div className="mt-3 flex items-center justify-between gap-2">
            <CustomerLanguageBadge customer={customer} />
            {canEdit ? (
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onEdit(customer);
                  }}
                >
                  <PencilLine className="size-4" aria-hidden="true" /> Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onToggleArchived(customer);
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
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
