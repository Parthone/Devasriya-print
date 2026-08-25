import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';

import { CustomerRoute } from '@/app/router/CustomerRoute';
import { ProtectedRoute } from '@/app/router/ProtectedRoute';
import { ROUTES } from '@/constants/routes';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { CustomerDetailPage } from '@/features/customers/pages/CustomerDetailPage';
import { EnquiriesPage } from '@/features/enquiries/pages/EnquiriesPage';
import { EnquiryDetailPage } from '@/features/enquiries/pages/EnquiryDetailPage';
import { BillingPage } from '@/features/billing/pages/BillingPage';
import { ReportsPage } from '@/features/reports/pages/ReportsPage';
import { SettingsPage } from '@/features/settings/pages/SettingsPage';
import { InvoiceDetailPage } from '@/features/billing/pages/InvoiceDetailPage';
import { InventoryPage } from '@/features/inventory/pages/InventoryPage';
import { EstimateDetailPage } from '@/features/estimates/pages/EstimateDetailPage';
import { EstimatesPage } from '@/features/estimates/pages/EstimatesPage';
import { PortalHomePage } from '@/features/customer-portal/pages/PortalHomePage';
import { PortalLoginPage } from '@/features/customer-portal/pages/PortalLoginPage';
import { PortalReviewPage } from '@/features/customer-portal/pages/PortalReviewPage';
import { DesignsPage } from '@/features/designs/pages/DesignsPage';
import { DeadlinesPage } from '@/features/production/pages/DeadlinesPage';
import { ProductionPage } from '@/features/production/pages/ProductionPage';
import { WorkflowStagesPage } from '@/features/production/pages/WorkflowStagesPage';
import { JobDetailPage } from '@/features/jobs/pages/JobDetailPage';
import { JobsPage } from '@/features/jobs/pages/JobsPage';
import { LocationsPage } from '@/features/locations/pages/LocationsPage';
import { ProductsPage } from '@/features/products/pages/ProductsPage';
import { CustomersPage } from '@/features/customers/pages/CustomersPage';
import { RolesPage } from '@/features/permissions/pages/RolesPage';
import { UsersPage } from '@/features/users/pages/UsersPage';
import { AppLayout } from '@/layouts/AppLayout';
import { AuthLayout } from '@/layouts/AuthLayout';
import { PortalLayout } from '@/layouts/PortalLayout';
import { DashboardPage } from '@/pages/DashboardPage';
import { ForbiddenPage } from '@/pages/ForbiddenPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

export const routes: RouteObject[] = [
  {
    path: ROUTES.login,
    element: <AuthLayout />,
    children: [{ index: true, element: <LoginPage /> }],
  },
  // The customer review portal. A separate shell, a separate guard and a
  // separate kind of session - it is deliberately not a corner of the staff
  // application with some things hidden.
  {
    path: ROUTES.portal,
    element: <PortalLayout />,
    children: [
      { path: 'login', element: <PortalLoginPage /> },
      {
        index: true,
        element: (
          <CustomerRoute>
            <PortalHomePage />
          </CustomerRoute>
        ),
      },
      {
        path: 'designs/:designId',
        element: (
          <CustomerRoute>
            <PortalReviewPage />
          </CustomerRoute>
        ),
      },
    ],
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
        path: ROUTES.customers,
        element: (
          <ProtectedRoute requires={['customers:view']}>
            <CustomersPage />
          </ProtectedRoute>
        ),
      },
      {
        path: ROUTES.customerDetail,
        element: (
          <ProtectedRoute requires={['customers:view']}>
            <CustomerDetailPage />
          </ProtectedRoute>
        ),
      },
      {
        path: ROUTES.enquiries,
        element: (
          <ProtectedRoute requires={['enquiries:view']}>
            <EnquiriesPage />
          </ProtectedRoute>
        ),
      },
      {
        path: ROUTES.enquiryDetail,
        element: (
          <ProtectedRoute requires={['enquiries:view']}>
            <EnquiryDetailPage />
          </ProtectedRoute>
        ),
      },
      {
        path: ROUTES.jobs,
        element: (
          <ProtectedRoute requires={['jobs:view']}>
            <JobsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: ROUTES.jobDetail,
        element: (
          <ProtectedRoute requires={['jobs:view']}>
            <JobDetailPage />
          </ProtectedRoute>
        ),
      },
      {
        path: ROUTES.estimates,
        element: (
          <ProtectedRoute requires={['estimates:view']}>
            <EstimatesPage />
          </ProtectedRoute>
        ),
      },
      {
        path: ROUTES.estimateDetail,
        element: (
          <ProtectedRoute requires={['estimates:view']}>
            <EstimateDetailPage />
          </ProtectedRoute>
        ),
      },
      {
        path: ROUTES.designs,
        element: (
          <ProtectedRoute requires={['designs:view']}>
            <DesignsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: ROUTES.production,
        element: (
          <ProtectedRoute requires={['production:view']}>
            <ProductionPage />
          </ProtectedRoute>
        ),
      },
      {
        path: ROUTES.scheduling,
        element: (
          <ProtectedRoute requires={['production:view']}>
            <DeadlinesPage />
          </ProtectedRoute>
        ),
      },
      {
        path: ROUTES.billing,
        element: (
          <ProtectedRoute requires={['billing:view']}>
            <BillingPage />
          </ProtectedRoute>
        ),
      },
      {
        path: ROUTES.invoiceDetail,
        element: (
          <ProtectedRoute requires={['billing:view']}>
            <InvoiceDetailPage />
          </ProtectedRoute>
        ),
      },
      {
        path: ROUTES.inventory,
        element: (
          <ProtectedRoute requires={['inventory:view']}>
            <InventoryPage />
          </ProtectedRoute>
        ),
      },
      {
        path: ROUTES.reports,
        element: (
          <ProtectedRoute requires={['reports:view']}>
            <ReportsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: ROUTES.settings,
        element: (
          <ProtectedRoute requires={['settings:view']}>
            <SettingsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: ROUTES.workflowStages,
        element: (
          <ProtectedRoute requires={['settings:manage']}>
            <WorkflowStagesPage />
          </ProtectedRoute>
        ),
      },
      {
        path: ROUTES.products,
        element: (
          <ProtectedRoute requires={['settings:manage']}>
            <ProductsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: ROUTES.locations,
        element: (
          <ProtectedRoute requires={['settings:manage']}>
            <LocationsPage />
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
      { path: ROUTES.forbidden, element: <ForbiddenPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes, {
  basename: '/Devasriya-print',
});
