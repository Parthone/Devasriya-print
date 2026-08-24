import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { ROUTES } from '@/constants/routes';

export function ForbiddenPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <p className="text-sm font-medium text-muted-foreground">403</p>
      <h1 className="text-2xl font-semibold tracking-tight">Access denied</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Your role does not have permission to open this page. Ask an administrator if you need
        access.
      </p>
      <Button asChild>
        <Link to={ROUTES.dashboard}>Back to dashboard</Link>
      </Button>
    </div>
  );
}
