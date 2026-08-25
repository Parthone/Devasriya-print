import { Loader2 } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { Customer } from '@/features/customers/types';

interface ArchiveCustomerDialogProps {
  customer: Customer | null;
  isSaving: boolean;
  onCancel: () => void;
  onConfirm: (customer: Customer) => void;
}

export function ArchiveCustomerDialog({
  customer,
  isSaving,
  onCancel,
  onConfirm,
}: ArchiveCustomerDialogProps) {
  const isArchiving = customer ? !customer.isArchived : true;

  return (
    <AlertDialog
      open={customer !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isArchiving ? 'Archive this customer?' : 'Restore this customer?'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isArchiving
              ? `${customer?.name ?? 'This customer'} will be hidden from the active list. Nothing is deleted - their enquiries, jobs and invoices stay linked and can be seen again by restoring the customer.`
              : `${customer?.name ?? 'This customer'} will appear in the active list again.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isSaving}
            onClick={() => {
              if (customer) onConfirm(customer);
            }}
          >
            {isSaving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {isArchiving ? 'Archive' : 'Restore'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
