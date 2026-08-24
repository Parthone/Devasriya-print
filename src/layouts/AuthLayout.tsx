import { Outlet } from 'react-router-dom';

import { AppLogo } from '@/components/common/AppLogo';
import { APP_CONFIG } from '@/config/app.config';

/** Shell for unauthenticated screens (sign in, password reset). */
export function AuthLayout() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/40 p-4">
      <AppLogo showTagline />
      <main className="w-full max-w-sm">
        <Outlet />
      </main>
      <p className="text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} {APP_CONFIG.name}
      </p>
    </div>
  );
}
