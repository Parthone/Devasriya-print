import { Badge } from '@/components/ui/badge';
import { PRODUCTION_STATUS_LABELS, type ProductionStatus } from '@/features/production/types';

type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline';

const VARIANTS: Record<ProductionStatus, BadgeVariant> = {
  pending: 'outline',
  ready: 'default',
  'in-progress': 'warning',
  'on-hold': 'destructive',
  completed: 'success',
  skipped: 'secondary',
};

export function ProductionStatusBadge({ status }: { status: ProductionStatus }) {
  return <Badge variant={VARIANTS[status]}>{PRODUCTION_STATUS_LABELS[status]}</Badge>;
}
