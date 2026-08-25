import { useMemo } from 'react';

import { useInvoiceDirectory } from '@/features/billing/hooks/use-billing';
import { useCustomerDirectory } from '@/features/customers/hooks/use-customers';
import { useInventoryItems } from '@/features/inventory/hooks/use-inventory';
import { useJobDirectory } from '@/features/jobs/hooks/use-jobs';
import { usePermissions } from '@/features/permissions/hooks/use-permissions';
import { useProductionRuns } from '@/features/production/hooks/use-production';
import type { ReportSources } from '@/features/reports/services/report-builders';
import { REPORT_DEFINITIONS, type ReportDefinition, type ReportId } from '@/features/reports/types';
import { useUsers } from '@/features/users/hooks/use-users';

export interface ReportSourceState {
  sources: ReportSources;
  /** The reports this role holds every permission for. Never empty-checked here. */
  available: ReportDefinition[];
  isPending: boolean;
  isError: boolean;
}

/**
 * Everything the reports read.
 *
 * These are the same React Query keys the directory screens use, so a report
 * costs nothing extra once a screen has been opened - and a source is only
 * fetched when the signed-in role may read it, which is what keeps a report
 * from asking the database a question it would refuse to answer.
 */
export function useReportSources(id: ReportId): ReportSourceState {
  const { can } = usePermissions();

  const available = useMemo(
    () => REPORT_DEFINITIONS.filter((definition) => definition.requires.every((one) => can(one))),
    [can],
  );

  const selected = available.find((definition) => definition.id === id);
  const needs = (permission: Parameters<typeof can>[0]) =>
    Boolean(selected?.requires.includes(permission)) && can(permission);

  // Jobs and production runs back three of the six reports, so they are
  // fetched whenever the chosen report names them.
  const wantsJobs = needs('jobs:view');
  const wantsCustomers = needs('customers:view');
  const wantsInvoices = needs('billing:view');
  const wantsInventory = needs('inventory:view');
  const wantsEmployees = needs('employees:view');
  const wantsRuns = (wantsJobs || needs('production:view')) && can('production:view');

  const customerQuery = useCustomerDirectory({ enabled: wantsCustomers });
  const jobQuery = useJobDirectory({ enabled: wantsJobs });
  const invoiceQuery = useInvoiceDirectory({ enabled: wantsInvoices });
  const inventoryQuery = useInventoryItems({ enabled: wantsInventory });
  const runQuery = useProductionRuns({ enabled: wantsRuns });
  const employeeQuery = useUsers({ enabled: wantsEmployees });

  const sources = useMemo<ReportSources>(
    () => ({
      customers: customerQuery.data?.customers ?? [],
      jobs: jobQuery.data?.jobs ?? [],
      invoices: invoiceQuery.data?.invoices ?? [],
      inventory: inventoryQuery.data ?? [],
      runs: runQuery.data ?? [],
      employees: employeeQuery.data ?? [],
    }),
    [
      customerQuery.data,
      jobQuery.data,
      invoiceQuery.data,
      inventoryQuery.data,
      runQuery.data,
      employeeQuery.data,
    ],
  );

  const active = [
    wantsCustomers ? customerQuery : null,
    wantsJobs ? jobQuery : null,
    wantsInvoices ? invoiceQuery : null,
    wantsInventory ? inventoryQuery : null,
    wantsRuns ? runQuery : null,
    wantsEmployees ? employeeQuery : null,
  ].filter((query) => query !== null);

  return {
    sources,
    available,
    isPending: active.some((query) => query.isPending),
    isError: active.some((query) => query.isError),
  };
}
