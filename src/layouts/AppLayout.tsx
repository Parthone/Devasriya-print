import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

import { AppLogo } from '@/components/common/AppLogo';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { APP_CONFIG } from '@/config/app.config';
import { NAV_SECTIONS } from '@/constants/routes';
import { cn } from '@/lib/utils';

/**
 * The authenticated application shell: sidebar navigation, top bar and the
 * routed page body. Auth-aware pieces (user menu, permission-filtered nav) are
 * wired up by the authentication and permissions modules.
 */
export function AppLayout() {
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  const closeSidebar = () => {
    setSidebarOpen(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main-content"
        className="sr-only bg-primary text-primary-foreground focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:px-3 focus:py-2"
      >
        Skip to content
      </a>

      {isSidebarOpen ? (
        <div
          className="fixed inset-0 z-30 bg-foreground/40 lg:hidden"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r bg-sidebar text-sidebar-foreground transition-transform lg:translate-x-0',
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b px-4">
          <AppLogo />
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={closeSidebar}
            aria-label="Close navigation"
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>

        <nav aria-label="Main navigation" className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title} className="space-y-1">
              <p className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {section.title}
              </p>
              {section.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={closeSidebar}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors',
                      'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                      isActive
                        ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                        : 'text-muted-foreground',
                    )
                  }
                >
                  <item.icon className="size-4 shrink-0" aria-hidden="true" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {!item.enabled ? (
                    <Badge variant="outline" className="text-[10px]">
                      Soon
                    </Badge>
                  ) : null}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="border-t px-4 py-3 text-xs text-muted-foreground">
          {APP_CONFIG.shortName} &middot; {APP_CONFIG.currencySymbol} {APP_CONFIG.locale}
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => {
              setSidebarOpen(true);
            }}
            aria-label="Open navigation"
          >
            <Menu className="size-4" aria-hidden="true" />
          </Button>

          <div className="flex-1" />

          <ThemeToggle />
        </header>

        <main id="main-content" className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
