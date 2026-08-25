import { CalendarClock } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { JobPriorityBadge } from '@/features/jobs/components/JobStatusBadge';
import type { Job } from '@/features/jobs/types';
import { describeDueDate } from '@/lib/business-day';
import { formatDate } from '@/lib/format';
import { formatMobile } from '@/lib/phone';

/** Jobs with a delivery date, soonest first: table on desktop, cards on phones. */
export function UpcomingDeliveries({ jobs, now }: { jobs: Job[]; now: Date }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming deliveries</CardTitle>
        <CardDescription>Where each job is being collected, and who to ask.</CardDescription>
      </CardHeader>
      <CardContent>
        {jobs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
            <CalendarClock className="size-5" aria-hidden="true" />
            <p className="text-sm">No jobs have a delivery date yet.</p>
          </div>
        ) : (
          <>
            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Expected</TableHead>
                    <TableHead>Pickup</TableHead>
                    <TableHead>Contact</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell>
                        <Link
                          to={`/jobs/${job.id}`}
                          className="font-medium underline-offset-2 hover:underline"
                        >
                          {job.jobNumber}
                        </Link>
                        <div className="mt-1">
                          <JobPriorityBadge priority={job.priority} />
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{job.customerName}</TableCell>
                      <TableCell className="text-sm">
                        {job.expectedDeliveryDate ? formatDate(job.expectedDeliveryDate) : '-'}
                        <div className="text-xs text-muted-foreground">
                          {job.expectedDeliveryDate
                            ? describeDueDate(job.expectedDeliveryDate, now)
                            : ''}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {job.pickupLocationName ?? 'Not set'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {job.contactPersonName ?? 'Not set'}
                        {job.contactPersonMobile ? (
                          <div className="text-xs text-muted-foreground">
                            {formatMobile(job.contactPersonMobile)}
                          </div>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <ul aria-label="Upcoming delivery cards" className="space-y-3 sm:hidden">
              {jobs.map((job) => (
                <li key={job.id} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      to={`/jobs/${job.id}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {job.jobNumber}
                    </Link>
                    <JobPriorityBadge priority={job.priority} />
                  </div>
                  <p className="text-xs text-muted-foreground">{job.customerName}</p>
                  <dl className="mt-2 space-y-0.5 text-sm">
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground">Expected</dt>
                      <dd>
                        {job.expectedDeliveryDate ? formatDate(job.expectedDeliveryDate) : '-'}
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground">Pickup</dt>
                      <dd>{job.pickupLocationName ?? 'Not set'}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground">Contact</dt>
                      <dd>{job.contactPersonName ?? 'Not set'}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
