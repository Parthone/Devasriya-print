import { useMemo } from 'react';

import { useInvoiceDirectory } from '@/features/billing/hooks/use-billing';
import type { Invoice } from '@/features/billing/types';
import { useInventoryItems } from '@/features/inventory/hooks/use-inventory';
import type { InventoryItem } from '@/features/inventory/types';
import { useCustomerDirectory } from '@/features/customers/hooks/use-customers';
import type { Customer } from '@/features/customers/types';
import { useEnquiryDirectory } from '@/features/enquiries/hooks/use-enquiries';
import type { Enquiry } from '@/features/enquiries/types';
import { useDesignDirectory } from '@/features/designs/hooks/use-designs';
import type { Design } from '@/features/designs/types';
import { useEstimateDirectory } from '@/features/estimates/hooks/use-estimates';
import { useProductionRuns } from '@/features/production/hooks/use-production';
import type { ProductionRun } from '@/features/production/types';
import type { Estimate } from '@/features/estimates/types';
import { useJobDirectory } from '@/features/jobs/hooks/use-jobs';
import type { Job } from '@/features/jobs/types';
import { usePermissions } from '@/features/permissions/hooks/use-permissions';
import {
  summariseBilling,
  summariseCustomers,
  summariseEnquiries,
  summariseInventory,
  summariseDesigns,
  summariseEstimates,
  summariseJobs,
  summariseProduction,
  type BillingSummary,
  type CustomerSummary,
  type EnquirySummary,
  type DesignSummary,
  type EstimateSummary,
  type InventorySummary,
  type JobSummary,
  type ProductionSummary,
} from '@/features/dashboard/services/dashboard-metrics';
import {
  buildRecentUpdates,
  type RecentUpdate,
} from '@/features/dashboard/services/recent-updates';

export interface DashboardData {
  /** What this user is allowed to see, decided by the existing matrix. */
  canSeeCustomers: boolean;
  canSeeEnquiries: boolean;
  canSeeJobs: boolean;
  canSeeEstimates: boolean;
  canSeeDesigns: boolean;
  canSeeProduction: boolean;
  canSeeBilling: boolean;
  canSeeInventory: boolean;

  customers: Customer[];
  enquiries: Enquiry[];
  jobs: Job[];
  estimates: Estimate[];
  designs: Design[];
  productionRuns: ProductionRun[];
  invoices: Invoice[];
  inventoryItems: InventoryItem[];

  customerSummary: CustomerSummary;
  enquirySummary: EnquirySummary;
  jobSummary: JobSummary;
  estimateSummary: EstimateSummary;
  designSummary: DesignSummary;
  productionSummary: ProductionSummary;
  billingSummary: BillingSummary;
  inventorySummary: InventorySummary;
  recentUpdates: RecentUpdate[];

  isPending: boolean;
  isError: boolean;
  /** True when every readable source is empty: a brand new business. */
  isFirstRun: boolean;
}

/**
 * Everything the dashboard shows, derived from the directory caches.
 *
 * These are the same React Query keys the Customers, Enquiries and Jobs screens
 * use, so opening the dashboard first warms those screens and vice versa - no
 * extra database reads, and no separate counting queries. A source is only
 * fetched when the signed-in role may read it.
 */
export function useDashboardData(now: Date = new Date()): DashboardData {
  const { can } = usePermissions();

  const canSeeCustomers = can('customers:view');
  const canSeeEnquiries = can('enquiries:view');
  const canSeeJobs = can('jobs:view');
  const canSeeEstimates = can('estimates:view');
  const canSeeDesigns = can('designs:view');
  const canSeeProduction = can('production:view');
  const canSeeBilling = can('billing:view');
  const canSeeInventory = can('inventory:view');

  const customerQuery = useCustomerDirectory({ enabled: canSeeCustomers });
  const enquiryQuery = useEnquiryDirectory({ enabled: canSeeEnquiries });
  const jobQuery = useJobDirectory({ enabled: canSeeJobs });
  const estimateQuery = useEstimateDirectory({ enabled: canSeeEstimates });
  const designQuery = useDesignDirectory({ enabled: canSeeDesigns });
  const productionQuery = useProductionRuns({ enabled: canSeeProduction });
  const invoiceQuery = useInvoiceDirectory({ enabled: canSeeBilling });
  const inventoryQuery = useInventoryItems({ enabled: canSeeInventory });

  const customers = useMemo(() => customerQuery.data?.customers ?? [], [customerQuery.data]);
  const enquiries = useMemo(() => enquiryQuery.data?.enquiries ?? [], [enquiryQuery.data]);
  const jobs = useMemo(() => jobQuery.data?.jobs ?? [], [jobQuery.data]);
  const estimates = useMemo(() => estimateQuery.data?.estimates ?? [], [estimateQuery.data]);
  const designs = useMemo(() => designQuery.data?.designs ?? [], [designQuery.data]);
  const productionRuns = useMemo(() => productionQuery.data ?? [], [productionQuery.data]);
  const invoices = useMemo(() => invoiceQuery.data?.invoices ?? [], [invoiceQuery.data]);
  const inventoryItems = useMemo(() => inventoryQuery.data ?? [], [inventoryQuery.data]);

  const customerSummary = useMemo(() => summariseCustomers(customers), [customers]);
  const enquirySummary = useMemo(() => summariseEnquiries(enquiries, now), [enquiries, now]);
  const jobSummary = useMemo(() => summariseJobs(jobs, now), [jobs, now]);
  const estimateSummary = useMemo(() => summariseEstimates(estimates, now), [estimates, now]);
  const designSummary = useMemo(() => summariseDesigns(designs), [designs]);
  const productionSummary = useMemo(
    () => summariseProduction(productionRuns, now),
    [productionRuns, now],
  );
  const billingSummary = useMemo(() => summariseBilling(invoices), [invoices]);
  const inventorySummary = useMemo(() => summariseInventory(inventoryItems), [inventoryItems]);
  const recentUpdates = useMemo(
    () => buildRecentUpdates(customers, enquiries, jobs),
    [customers, enquiries, jobs],
  );

  const activeQueries = [
    canSeeCustomers ? customerQuery : null,
    canSeeEnquiries ? enquiryQuery : null,
    canSeeJobs ? jobQuery : null,
    canSeeEstimates ? estimateQuery : null,
    canSeeDesigns ? designQuery : null,
    canSeeProduction ? productionQuery : null,
    canSeeBilling ? invoiceQuery : null,
    canSeeInventory ? inventoryQuery : null,
  ].filter((query) => query !== null);

  return {
    canSeeCustomers,
    canSeeEnquiries,
    canSeeJobs,
    canSeeEstimates,
    canSeeDesigns,
    canSeeProduction,
    canSeeBilling,
    canSeeInventory,
    customers,
    enquiries,
    jobs,
    estimates,
    designs,
    productionRuns,
    invoices,
    inventoryItems,
    customerSummary,
    enquirySummary,
    jobSummary,
    estimateSummary,
    designSummary,
    productionSummary,
    billingSummary,
    inventorySummary,
    recentUpdates,
    isPending: activeQueries.some((query) => query.isPending),
    isError: activeQueries.some((query) => query.isError),
    isFirstRun:
      activeQueries.length > 0 &&
      activeQueries.every((query) => query.isSuccess) &&
      customers.length === 0 &&
      enquiries.length === 0 &&
      jobs.length === 0 &&
      estimates.length === 0 &&
      designs.length === 0 &&
      productionRuns.length === 0 &&
      invoices.length === 0 &&
      inventoryItems.length === 0,
  };
}
