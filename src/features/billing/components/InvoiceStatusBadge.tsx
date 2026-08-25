import { Badge } from '@/components/ui/badge';
import { PAYMENT_STATUS_LABELS, type PaymentStatus } from '@/features/billing/types';

type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline';

const VARIANTS: Record<PaymentStatus, BadgeVariant> = {
  unpaid: 'destructive',
  partial: 'warning',
  paid: 'success',
};

export function InvoiceStatusBadge({ status }: { status: PaymentStatus }) {
  return <Badge variant={VARIANTS[status]}>{PAYMENT_STATUS_LABELS[status]}</Badge>;
}
