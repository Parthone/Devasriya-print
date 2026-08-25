import { LogOut } from 'lucide-react';
import { Link, Outlet } from 'react-router-dom';

import { AppLogo } from '@/components/common/AppLogo';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/constants/routes';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { LanguageToggle } from '@/features/customer-portal/components/LanguageToggle';
import { useTranslation } from '@/i18n/use-translation';

/**
 * Shell for the customer side.
 *
 * Intentionally nothing like the staff shell: no sidebar, no navigation into
 * the business, one column that reads well on a phone. The language toggle sits
 * in the header of every screen, because a customer who opened the wrong
 * language needs it before they can read anything else.
 */
export function PortalLayout() {
  const { session, signOut } = useAuth();
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <header className="sticky top-0 z-10 border-b bg-background">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-2 p-3">
          <Link to={ROUTES.portal} className="min-w-0">
            <AppLogo />
          </Link>
          <div className="flex items-center gap-1">
            <LanguageToggle />
            <ThemeToggle />
            {session.status === 'customer' ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void signOut();
                }}
              >
                <LogOut className="size-4" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">{t('portal.signOut')}</span>
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-3 sm:p-6">
        <Outlet />
      </main>
    </div>
  );
}
