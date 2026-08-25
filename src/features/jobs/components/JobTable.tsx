import { Link } from 'react-router-dom';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { JobPriorityBadge, JobStatusBadge } from '@/features/jobs/components/JobStatusBadge';
import type { Job } from '@/features/jobs/types';
import { formatDate } from '@/lib/format';
import { formatMobile } from '@/lib/phone';

export function JobTable({ jobs }: { jobs: Job[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Job</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Title</TableHead>
          <TableHead>Delivery</TableHead>
          <TableHead>Pickup</TableHead>
          <TableHead>Status</TableHead>
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
              <div className="text-xs text-muted-foreground">{formatDate(job.jobDate)}</div>
            </TableCell>
            <TableCell>
              <div className="text-sm">{job.customerName}</div>
              <div className="text-xs text-muted-foreground">
                {formatMobile(job.customerMobile)}
              </div>
            </TableCell>
            <TableCell className="max-w-xs">
              <p className="truncate text-sm">{job.title}</p>
              <div className="mt-1">
                <JobPriorityBadge priority={job.priority} />
              </div>
            </TableCell>
            <TableCell className="text-sm">
              {job.expectedDeliveryDate ? formatDate(job.expectedDeliveryDate) : '-'}
            </TableCell>
            <TableCell className="text-sm">{job.pickupLocationName ?? '-'}</TableCell>
            <TableCell>
              <JobStatusBadge status={job.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function JobCardList({ jobs }: { jobs: Job[] }) {
  return (
    <ul aria-label="Job cards" className="space-y-3">
      {jobs.map((job) => (
        <li key={job.id} className="rounded-lg border p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link
                to={`/jobs/${job.id}`}
                className="font-medium underline-offset-2 hover:underline"
              >
                {job.jobNumber}
              </Link>
              <p className="truncate text-xs text-muted-foreground">{job.customerName}</p>
            </div>
            <JobStatusBadge status={job.status} />
          </div>
          <p className="mt-2 line-clamp-2 text-sm">{job.title}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {formatDate(job.jobDate)}
            {job.expectedDeliveryDate ? ` - due ${formatDate(job.expectedDeliveryDate)}` : ''}
          </p>
        </li>
      ))}
    </ul>
  );
}
