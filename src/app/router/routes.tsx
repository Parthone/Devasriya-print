import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';

import { ProtectedRoute } from '@/app/router/ProtectedRoute';
import { ROUTES, NAV_SECTIONS } from '@/constants/routes';
import { AppLayout } from '@/layouts/AppLayout';
import { AuthLayout } from '@/layouts/AuthLayout';
import { DashboardPage } from '@/pages/DashboardPage';
import { ForbiddenPage } from '@/pages/ForbiddenPage';
import { LoginPage } from '@/pages/LoginPage';
import { ModuleComingSoonPage } from '@/pages/ModuleComingSoonPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

/**
 * Routes for modules that are not implemented yet. Each module replaces its own
 * entry here with real routes (using route-level `lazy` for code splitting) as
 * it is built.
 */
const placeholderRoutes: RouteObject[] = NAV_SECTIONS.flatMap((section) => section.items)
  .filter((item) => !item.enabled)
  .map((item) => ({ path: item.path, element: <ModuleComingSoonPage /> }));

export const routes: RouteObject[] = [
  {
    path: ROUTES.login,
    element: <AuthLayout />,
    children: [{ index: true, element: <LoginPage /> }],
  },
  {
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { path: ROUTES.root, element: <Navigate to={ROUTES.dashboard} replace /> },
      { path: ROUTES.dashboard, element: <DashboardPage /> },
      ...placeholderRoutes,
      { path: ROUTES.forbidden, element: <ForbiddenPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
