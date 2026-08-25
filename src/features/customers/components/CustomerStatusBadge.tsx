import { Badge } from '@/components/ui/badge';
import { LANGUAGE_LABELS } from '@/constants/india';
import type { Customer } from '@/features/customers/types';

export function CustomerStatusBadge({ customer }: { customer: Customer }) {
  return (
    <Badge variant={customer.isArchived ? 'secondary' : 'success'}>
      {customer.isArchived ? 'Archived' : 'Active'}
    </Badge>
  );
}

export function CustomerLanguageBadge({ customer }: { customer: Customer }) {
  return (
    <Badge variant="outline" className="text-[10px]">
      {LANGUAGE_LABELS[customer.preferredLanguage]}
    </Badge>
  );
}
