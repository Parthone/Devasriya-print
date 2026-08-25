import { Badge } from '@/components/ui/badge';
import { DESIGN_STATUS_LABELS, type DesignStatus } from '@/features/designs/types';

type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline';

const VARIANTS: Record<DesignStatus, BadgeVariant> = {
  draft: 'secondary',
  'submitted-for-review': 'warning',
  'changes-requested': 'warning',
  approved: 'success',
  rejected: 'destructive',
  superseded: 'outline',
};

export function DesignStatusBadge({ status }: { status: DesignStatus }) {
  return <Badge variant={VARIANTS[status]}>{DESIGN_STATUS_LABELS[status]}</Badge>;
}
