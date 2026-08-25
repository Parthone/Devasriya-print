import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';

import { ProtectedRoute } from '@/app/router/ProtectedRoute';
import { NAV_SECTIONS, ROUTES } from '@/constants/routes';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { RolesPage } from '@/features/permissions/pages/RolesPage';
import { UsersPage } from '@/features/users/pages/UsersPage';
import { AppLayout } from '@/layouts/AppLayout';
import { AuthLayout } from '@/layouts/AuthLayout';
import { DashboardPage } from '@/pages/DashboardPage';
import { ForbiddenPage } from '@/pages/ForbiddenPage';
import { ModuleComingSoonPage } from '@/pages/ModuleComingSoonPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

/**
 * Routes for modules that are not implemented yet.
 *
 * They are already permission-guarded, so a role that will never be allowed
 * into an area cannot reach it by typing the URL, even before the module that
 * owns it exists. Each module replaces its own entry here with real routes
 * (using route-level `lazy` for code splitting) as it is built.
 */
const placeholderRoutes: RouteObject[] = NAV_SECTIONS.flatMap((section) => section.items)
  .filter((item) => !item.enabled)
  .map((item) => ({
    path: item.path,
    element: (
      <ProtectedRoute requires={[item.permission]}>
        <ModuleComingSoonPage />
      </ProtectedRoute>
    ),
  }));

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
      {
        path: ROUTES.dashboard,
        element: (
          <ProtectedRoute requires={['dashboard:view']}>
            <DashboardPage />
          </ProtectedRoute>
        ),
      },
      {
        path: ROUTES.users,
        element: (
          <ProtectedRoute requires={['employees:view']}>
            <UsersPage />
          </ProtectedRoute>
        ),
      },
      {
        path: ROUTES.roles,
        element: (
          <ProtectedRoute requires={['settings:view']}>
            <RolesPage />
          </ProtectedRoute>
        ),
      },
      ...placeholderRoutes,
      { path: ROUTES.forbidden, element: <ForbiddenPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes, {
  basename: '/Devasriya-print',
});
