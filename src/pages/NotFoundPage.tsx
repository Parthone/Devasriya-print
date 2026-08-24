import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { ROUTES } from '@/constants/routes';

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The page you are looking for does not exist or has been moved.
      </p>
      <Button asChild>
        <Link to={ROUTES.dashboard}>Back to dashboard</Link>
      </Button>
    </div>
  );
}
