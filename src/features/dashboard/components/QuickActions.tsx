import { ClipboardList, MessageSquarePlus, Plus, UserPlus } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { ROUTES } from '@/constants/routes';
import { Can } from '@/features/permissions/components/Can';

/**
 * Shortcuts in the page header.
 *
 * Each one is gated on the permission that the destination screen already
 * requires, so nothing appears that the user cannot then do.
 */
export function QuickActions() {
  return (
    <div className="flex flex-wrap gap-2">
      <Can permission="customers:create">
        <Button asChild size="sm">
          <Link to={ROUTES.customers}>
            <UserPlus className="size-4" aria-hidden="true" /> Add customer
          </Link>
        </Button>
      </Can>

      <Can permission="enquiries:create">
        <Button asChild size="sm">
          <Link to={ROUTES.enquiries}>
            <MessageSquarePlus className="size-4" aria-hidden="true" /> Add enquiry
          </Link>
        </Button>
      </Can>

      <Can permission="jobs:create">
        <Button asChild size="sm">
          <Link to={ROUTES.jobs}>
            <Plus className="size-4" aria-hidden="true" /> Create job
          </Link>
        </Button>
      </Can>

      <Can permission="enquiries:view">
        <Button asChild size="sm" variant="outline">
          <Link to={ROUTES.enquiries}>View follow-ups</Link>
        </Button>
      </Can>

      <Can permission="jobs:view">
        <Button asChild size="sm" variant="outline">
          <Link to={ROUTES.jobs}>
            <ClipboardList className="size-4" aria-hidden="true" /> View jobs
          </Link>
        </Button>
      </Can>
    </div>
  );
}
