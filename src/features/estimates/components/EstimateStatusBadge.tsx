import { Badge } from '@/components/ui/badge';
import { ESTIMATE_STATUS_LABELS, type EstimateStatus } from '@/features/estimates/types';

type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline';

const VARIANTS: Record<EstimateStatus, BadgeVariant> = {
  draft: 'secondary',
  sent: 'warning',
  approved: 'success',
  rejected: 'destructive',
  expired: 'outline',
  cancelled: 'secondary',
};

export function EstimateStatusBadge({ status }: { status: EstimateStatus }) {
  return <Badge variant={VARIANTS[status]}>{ESTIMATE_STATUS_LABELS[status]}</Badge>;
}
