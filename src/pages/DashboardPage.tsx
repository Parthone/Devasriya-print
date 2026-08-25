import {
  AlarmClock,
  CalendarClock,
  ClipboardList,
  FileText,
  Images,
  MailCheck,
  MessageSquare,
  MessageSquareText,
  PackageCheck,
  Users,
} from 'lucide-react';
import { useMemo } from 'react';

import { PageHeader } from '@/components/common/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { parseFirebaseEnv } from '@/config/env';
import { isDemoMode } from '@/config/demo';
import { ROUTES } from '@/constants/routes';
import { FirstRunPanel } from '@/features/dashboard/components/FirstRunPanel';
import { KpiCard } from '@/features/dashboard/components/KpiCard';
import { NeedsAttention } from '@/features/dashboard/components/NeedsAttention';
import { QuickActions } from '@/features/dashboard/components/QuickActions';
import { RecentUpdates } from '@/features/dashboard/components/RecentUpdates';
import { RoadmapStatus } from '@/features/dashboard/components/RoadmapStatus';
import { StatusBreakdown, type StatusRow } from '@/features/dashboard/components/StatusBreakdown';
import { UpcomingDeliveries } from '@/features/dashboard/components/UpcomingDeliveries';
import { useDashboardData } from '@/features/dashboard/hooks/use-dashboard-data';
import { DUE_SOON_DAYS } from '@/features/dashboard/services/dashboard-metrics';
import { ENQUIRY_STATUSES, ENQUIRY_STATUS_LABELS } from '@/features/enquiries/types';
import { JOB_STATUSES, JOB_STATUS_LABELS } from '@/features/jobs/types';

const UPCOMING_LIMIT = 8;

/** Warns only when the app genuinely cannot reach a backend, and never in demo. */
function ConfigurationWarning() {
  if (isDemoMode() || parseFirebaseEnv().ok) return null;

  return (
    <p role="alert" className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
      This installation is not connected to a backend yet, so nothing can be saved. Ask your
      administrator to finish the setup.
    </p>
  );
}

/**
 * The operational overview.
 *
 * Everything here is derived from the customer, enquiry and job caches the
 * directory screens already use, and every section is bounded by the same
 * permissions as the screen it summarises.
 */
export function DashboardPage() {
  const now = useMemo(() => new Date(), []);
  const data = useDashboardData(now);

  const enquiryRows: StatusRow[] = ENQUIRY_STATUSES.map((status) => ({
    key: status,
    label: ENQUIRY_STATUS_LABELS[status],
    count: data.enquirySummary.byStatus[status],
    to: ROUTES.enquiries,
  }));

  const jobRows: StatusRow[] = JOB_STATUSES.filter((status) => status !== 'cancelled').map(
    (status) => ({
      key: status,
      label: JOB_STATUS_LABELS[status],
      count: data.jobSummary.byStatus[status],
      to: ROUTES.jobs,
    }),
  );

  const followUpsDue =
    data.enquirySummary.followUpsDueToday.length + data.enquirySummary.followUpsOverdue.length;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="What needs attention today."
        actions={<QuickActions />}
      />

      <ConfigurationWarning />

      {data.isPending ? (
        <div className="space-y-4" aria-busy="true">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      ) : data.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Could not load the dashboard. Check your connection and try again.
        </p>
      ) : data.isFirstRun ? (
        <FirstRunPanel />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.canSeeCustomers ? (
              <KpiCard
                label="Customers"
                value={data.customerSummary.total}
                icon={Users}
                to={ROUTES.customers}
              />
            ) : null}

            {data.canSeeEnquiries ? (
              <>
                <KpiCard
                  label="Open enquiries"
                  value={data.enquirySummary.open}
                  icon={MessageSquareText}
                  to={ROUTES.enquiries}
                />
                <KpiCard
                  label="Follow-ups due"
                  value={followUpsDue}
                  icon={AlarmClock}
                  hint="Today or earlier"
                  tone="warning"
                  to={ROUTES.enquiries}
                />
              </>
            ) : null}

            {data.canSeeJobs ? (
              <>
                <KpiCard
                  label="Active jobs"
                  value={data.jobSummary.active}
                  icon={ClipboardList}
                  to={ROUTES.jobs}
                />
                <KpiCard
                  label="Jobs due soon"
                  value={data.jobSummary.dueSoon.length}
                  icon={CalendarClock}
                  hint={`Next ${String(DUE_SOON_DAYS)} days, overdue counted separately`}
                  tone="warning"
                  to={ROUTES.jobs}
                />
                <KpiCard
                  label="Ready for pickup"
                  value={data.jobSummary.ready}
                  icon={PackageCheck}
                  to={ROUTES.jobs}
                />
              </>
            ) : null}

            {data.canSeeDesigns &&
            (data.designSummary.awaitingCustomer > 0 || data.designSummary.changesRequested > 0) ? (
              <>
                <KpiCard
                  label="Designs with customers"
                  value={data.designSummary.awaitingCustomer}
                  icon={Images}
                  hint="Sent for approval, no reply yet"
                  to={ROUTES.designs}
                />
                <KpiCard
                  label="Changes requested"
                  value={data.designSummary.changesRequested}
                  icon={MessageSquare}
                  hint="A new version is owed"
                  tone="warning"
                  to={ROUTES.designs}
                />
              </>
            ) : null}

            {data.canSeeEstimates ? (
              <>
                <KpiCard
                  label="Draft quotations"
                  value={data.estimateSummary.drafts}
                  icon={FileText}
                  hint="Not sent to the customer yet"
                  to={ROUTES.estimates}
                />
                <KpiCard
                  label="Awaiting approval"
                  value={data.estimateSummary.awaitingApproval}
                  icon={MailCheck}
                  hint={
                    data.estimateSummary.pastValidity > 0
                      ? `${String(data.estimateSummary.pastValidity)} more past validity`
                      : 'Sent and still valid'
                  }
                  to={ROUTES.estimates}
                />
              </>
            ) : null}
          </div>

          {data.canSeeEnquiries || data.canSeeJobs ? (
            <NeedsAttention
              enquiries={data.canSeeEnquiries ? data.enquirySummary : null}
              jobs={data.canSeeJobs ? data.jobSummary : null}
              now={now}
            />
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            {data.canSeeEnquiries ? (
              <StatusBreakdown
                title="Enquiry pipeline"
                description="Where enquiries currently stand."
                rows={enquiryRows}
                emptyMessage="No enquiries recorded yet."
              />
            ) : null}

            {data.canSeeJobs ? (
              <StatusBreakdown
                title="Job overview"
                description="Work in hand, by status."
                rows={jobRows}
                emptyMessage="No jobs recorded yet."
              />
            ) : null}
          </div>

          {data.canSeeJobs ? (
            <UpcomingDeliveries
              jobs={data.jobSummary.upcomingDeliveries.slice(0, UPCOMING_LIMIT)}
              now={now}
            />
          ) : null}

          <RecentUpdates updates={data.recentUpdates} />
        </>
      )}

      <RoadmapStatus />
    </>
  );
}
