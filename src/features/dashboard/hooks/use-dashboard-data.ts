import { useMemo } from 'react';

import { useCustomerDirectory } from '@/features/customers/hooks/use-customers';
import type { Customer } from '@/features/customers/types';
import { useEnquiryDirectory } from '@/features/enquiries/hooks/use-enquiries';
import type { Enquiry } from '@/features/enquiries/types';
import { useJobDirectory } from '@/features/jobs/hooks/use-jobs';
import type { Job } from '@/features/jobs/types';
import { usePermissions } from '@/features/permissions/hooks/use-permissions';
import {
  summariseCustomers,
  summariseEnquiries,
  summariseJobs,
  type CustomerSummary,
  type EnquirySummary,
  type JobSummary,
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

  customers: Customer[];
  enquiries: Enquiry[];
  jobs: Job[];

  customerSummary: CustomerSummary;
  enquirySummary: EnquirySummary;
  jobSummary: JobSummary;
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
 * extra Firestore reads, and no separate counting queries. A source is only
 * fetched when the signed-in role may read it.
 */
export function useDashboardData(now: Date = new Date()): DashboardData {
  const { can } = usePermissions();

  const canSeeCustomers = can('customers:view');
  const canSeeEnquiries = can('enquiries:view');
  const canSeeJobs = can('jobs:view');

  const customerQuery = useCustomerDirectory({ enabled: canSeeCustomers });
  const enquiryQuery = useEnquiryDirectory({ enabled: canSeeEnquiries });
  const jobQuery = useJobDirectory({ enabled: canSeeJobs });

  const customers = useMemo(() => customerQuery.data?.customers ?? [], [customerQuery.data]);
  const enquiries = useMemo(() => enquiryQuery.data?.enquiries ?? [], [enquiryQuery.data]);
  const jobs = useMemo(() => jobQuery.data?.jobs ?? [], [jobQuery.data]);

  const customerSummary = useMemo(() => summariseCustomers(customers), [customers]);
  const enquirySummary = useMemo(() => summariseEnquiries(enquiries, now), [enquiries, now]);
  const jobSummary = useMemo(() => summariseJobs(jobs, now), [jobs, now]);
  const recentUpdates = useMemo(
    () => buildRecentUpdates(customers, enquiries, jobs),
    [customers, enquiries, jobs],
  );

  const activeQueries = [
    canSeeCustomers ? customerQuery : null,
    canSeeEnquiries ? enquiryQuery : null,
    canSeeJobs ? jobQuery : null,
  ].filter((query) => query !== null);

  return {
    canSeeCustomers,
    canSeeEnquiries,
    canSeeJobs,
    customers,
    enquiries,
    jobs,
    customerSummary,
    enquirySummary,
    jobSummary,
    recentUpdates,
    isPending: activeQueries.some((query) => query.isPending),
    isError: activeQueries.some((query) => query.isError),
    isFirstRun:
      activeQueries.length > 0 &&
      activeQueries.every((query) => query.isSuccess) &&
      customers.length === 0 &&
      enquiries.length === 0 &&
      jobs.length === 0,
  };
}
