import { Badge } from '@/components/ui/badge';
import { ENQUIRY_STATUS_LABELS, type EnquiryStatus } from '@/features/enquiries/types';

type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline';

const VARIANTS: Record<EnquiryStatus, BadgeVariant> = {
  new: 'default',
  contacted: 'secondary',
  'follow-up': 'warning',
  'quotation-required': 'warning',
  converted: 'success',
  lost: 'destructive',
  closed: 'secondary',
};

export function EnquiryStatusBadge({ status }: { status: EnquiryStatus }) {
  return <Badge variant={VARIANTS[status]}>{ENQUIRY_STATUS_LABELS[status]}</Badge>;
}
