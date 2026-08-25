import { Rocket, UserPlus } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ROUTES } from '@/constants/routes';
import { usePermissions } from '@/features/permissions/hooks/use-permissions';

/**
 * Shown instead of a wall of zeros when the business has no records yet.
 *
 * A read-only role gets an explanation rather than an action it cannot take.
 */
export function FirstRunPanel() {
  const { can } = usePermissions();
  const canAddCustomer = can('customers:create');

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Rocket className="size-5 text-muted-foreground" aria-hidden="true" />
          <CardTitle>Get started</CardTitle>
        </div>
        <CardDescription>
          {canAddCustomer
            ? 'Add your first customer, then record what they need as an enquiry and turn it into a job.'
            : 'Nothing has been added yet. Once your team records customers, enquiries and jobs, this dashboard shows what needs attention.'}
        </CardDescription>
      </CardHeader>
      {canAddCustomer ? (
        <CardContent>
          <Button asChild>
            <Link to={ROUTES.customers}>
              <UserPlus className="size-4" aria-hidden="true" /> Add your first customer
            </Link>
          </Button>
        </CardContent>
      ) : null}
    </Card>
  );
}
