import { Badge } from '@/components/ui/badge';
import { JOB_PRIORITY_LABELS, JOB_STATUS_LABELS, type Job } from '@/features/jobs/types';

type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline';

const VARIANTS: Record<Job['status'], BadgeVariant> = {
  open: 'default',
  'in-progress': 'warning',
  ready: 'success',
  delivered: 'secondary',
  'on-hold': 'warning',
  cancelled: 'destructive',
};

export function JobStatusBadge({ status }: { status: Job['status'] }) {
  return <Badge variant={VARIANTS[status]}>{JOB_STATUS_LABELS[status]}</Badge>;
}

export function JobPriorityBadge({ priority }: { priority: Job['priority'] }) {
  if (priority === 'normal') return null;
  return <Badge variant="destructive">{JOB_PRIORITY_LABELS[priority]}</Badge>;
}
