import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface KpiCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  /** Where the number came from, e.g. "due today or overdue". */
  hint?: string;
  /** Draws attention when the number is not zero. */
  tone?: 'default' | 'warning' | 'danger';
  to?: string;
}

export function KpiCard({ label, value, icon: Icon, hint, tone = 'default', to }: KpiCardProps) {
  const highlight = tone !== 'default' && value > 0;

  const body = (
    <CardContent className="flex items-start justify-between gap-3 py-1">
      <div className="min-w-0">
        <p className="truncate text-sm text-muted-foreground">{label}</p>
        <p
          className={cn(
            'tabular-money text-2xl font-semibold',
            highlight && tone === 'danger' && 'text-destructive',
            highlight && tone === 'warning' && 'text-warning',
          )}
        >
          {value}
        </p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <Icon
        className={cn(
          'size-5 shrink-0',
          highlight && tone === 'danger' ? 'text-destructive' : 'text-muted-foreground',
        )}
        aria-hidden="true"
      />
    </CardContent>
  );

  if (to) {
    return (
      <Card className="transition-colors hover:bg-accent/40">
        <Link to={to} aria-label={`${label}: ${String(value)}`}>
          {body}
        </Link>
      </Card>
    );
  }

  return <Card>{body}</Card>;
}
