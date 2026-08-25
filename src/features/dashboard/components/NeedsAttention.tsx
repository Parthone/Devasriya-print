import { AlarmClock, CalendarClock, CheckCircle2, Flame, UserPlus } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ROUTES } from '@/constants/routes';
import { AttentionList, type AttentionItem } from '@/features/dashboard/components/AttentionList';
import type { EnquirySummary, JobSummary } from '@/features/dashboard/services/dashboard-metrics';
import { describeDueDate } from '@/lib/business-day';
import { formatDate } from '@/lib/format';

interface NeedsAttentionProps {
  enquiries: EnquirySummary | null;
  jobs: JobSummary | null;
  now: Date;
}

/** Everything that wants doing today, grouped by why it matters. */
export function NeedsAttention({ enquiries, jobs, now }: NeedsAttentionProps) {
  const followUpsToday: AttentionItem[] = (enquiries?.followUpsDueToday ?? []).map((enquiry) => ({
    id: enquiry.id,
    title: enquiry.enquiryNumber,
    subtitle: enquiry.customerName,
    note: 'Today',
    href: `/enquiries/${enquiry.id}`,
  }));

  const followUpsOverdue: AttentionItem[] = (enquiries?.followUpsOverdue ?? []).map((enquiry) => ({
    id: enquiry.id,
    title: enquiry.enquiryNumber,
    subtitle: enquiry.customerName,
    note: enquiry.nextFollowUpAt ? describeDueDate(enquiry.nextFollowUpAt, now) : undefined,
    href: `/enquiries/${enquiry.id}`,
  }));

  const overdueJobs: AttentionItem[] = (jobs?.overdue ?? []).map((job) => ({
    id: job.id,
    title: job.jobNumber,
    subtitle: `${job.customerName} - ${job.title}`,
    note: job.expectedDeliveryDate ? describeDueDate(job.expectedDeliveryDate, now) : undefined,
    href: `/jobs/${job.id}`,
  }));

  const dueSoonJobs: AttentionItem[] = (jobs?.dueSoon ?? []).map((job) => ({
    id: job.id,
    title: job.jobNumber,
    subtitle: `${job.customerName} - ${job.title}`,
    note: job.expectedDeliveryDate ? formatDate(job.expectedDeliveryDate) : undefined,
    href: `/jobs/${job.id}`,
  }));

  const urgentJobs: AttentionItem[] = (jobs?.urgent ?? []).map((job) => ({
    id: job.id,
    title: job.jobNumber,
    subtitle: `${job.customerName} - ${job.title}`,
    href: `/jobs/${job.id}`,
  }));

  const unassignedJobs: AttentionItem[] = (jobs?.unassigned ?? []).map((job) => ({
    id: job.id,
    title: job.jobNumber,
    subtitle: `${job.customerName} - ${job.title}`,
    href: `/jobs/${job.id}`,
  }));

  const nothingToDo =
    followUpsToday.length === 0 &&
    followUpsOverdue.length === 0 &&
    overdueJobs.length === 0 &&
    dueSoonJobs.length === 0 &&
    urgentJobs.length === 0 &&
    unassignedJobs.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Needs attention</CardTitle>
        <CardDescription>Chasing, deadlines and work nobody has picked up.</CardDescription>
      </CardHeader>
      <CardContent>
        {nothingToDo ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
            <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
            <p className="text-sm">Nothing needs attention today.</p>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            <AttentionList
              title="Overdue follow-ups"
              icon={AlarmClock}
              items={followUpsOverdue}
              tone="danger"
              moreHref={ROUTES.enquiries}
            />
            <AttentionList
              title="Follow-ups due today"
              icon={AlarmClock}
              items={followUpsToday}
              tone="warning"
              moreHref={ROUTES.enquiries}
            />
            <AttentionList
              title="Overdue jobs"
              icon={CalendarClock}
              items={overdueJobs}
              tone="danger"
              moreHref={ROUTES.jobs}
            />
            <AttentionList
              title="Jobs due soon"
              icon={CalendarClock}
              items={dueSoonJobs}
              tone="warning"
              moreHref={ROUTES.jobs}
            />
            <AttentionList
              title="Urgent jobs"
              icon={Flame}
              items={urgentJobs}
              tone="danger"
              moreHref={ROUTES.jobs}
            />
            <AttentionList
              title="Unassigned jobs"
              icon={UserPlus}
              items={unassignedJobs}
              moreHref={ROUTES.jobs}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
