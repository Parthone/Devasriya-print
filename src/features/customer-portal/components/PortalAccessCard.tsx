import { KeyRound, Loader2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useCreateCustomerAccount,
  useCustomerAccount,
  useSetCustomerAccountActive,
} from '@/features/customer-portal/hooks/use-customer-account';
import { useAuthenticatedUser } from '@/features/auth/hooks/use-auth';
import type { Customer } from '@/features/customers/types';
import { usePermissions } from '@/features/permissions/hooks/use-permissions';
import { formatDateTime } from '@/lib/format';

/**
 * Gives one customer a login for the review portal.
 *
 * Nobody here ever chooses the customer's password: the account is created with
 * a throwaway one and the customer is emailed a link to set their own, exactly
 * as employees are in Module 1. Access is revoked by switching the account off,
 * never by deleting it, so the designs they approved keep their name on them.
 */
export function PortalAccessCard({ customer }: { customer: Customer }) {
  const currentUser = useAuthenticatedUser();
  const { can } = usePermissions();
  const canManage = can('customers:edit');

  const account = useCustomerAccount(customer.id, { enabled: can('customers:view') });
  const create = useCreateCustomerAccount({ uid: currentUser.uid, name: currentUser.name });
  const setActive = useSetCustomerAccountActive(currentUser.uid);

  const existing = account.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Design review portal</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {account.isPending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : existing ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={existing.isActive ? 'success' : 'secondary'}>
                {existing.isActive ? 'Active' : 'Revoked'}
              </Badge>
              <span className="text-muted-foreground">{existing.email}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Created {formatDateTime(existing.createdAt)}. They can sign in to approve designs, and
              see nothing but their own orders.
            </p>
            {canManage ? (
              <Button
                variant="outline"
                size="sm"
                disabled={setActive.isPending}
                onClick={() => {
                  setActive.mutate({ account: existing, isActive: !existing.isActive });
                }}
              >
                {existing.isActive ? 'Revoke access' : 'Restore access'}
              </Button>
            ) : null}
          </>
        ) : (
          <>
            <p className="text-muted-foreground">
              {customer.email
                ? 'This customer has no portal login yet.'
                : 'Add an email address to this customer before creating a portal login.'}
            </p>
            {canManage && customer.email ? (
              <Button
                variant="outline"
                size="sm"
                disabled={create.isPending}
                onClick={() => {
                  create.mutate({
                    customerId: customer.id,
                    customerName: customer.name,
                    email: customer.email ?? '',
                    preferredLanguage: customer.preferredLanguage,
                  });
                }}
              >
                {create.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <KeyRound className="size-4" aria-hidden="true" />
                )}
                Create portal login
              </Button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
