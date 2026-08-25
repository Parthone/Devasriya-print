import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

export interface AttentionItem {
  id: string;
  title: string;
  subtitle: string;
  /** Right-hand note, e.g. "Overdue by 2 days". */
  note?: string | undefined;
  href: string;
}

interface AttentionListProps {
  title: string;
  icon: LucideIcon;
  items: AttentionItem[];
  tone?: 'default' | 'warning' | 'danger';
  /** How many to show before "and N more". */
  limit?: number;
  moreHref?: string;
}

/** One group inside the Needs attention panel. Hidden when there is nothing. */
export function AttentionList({
  title,
  icon: Icon,
  items,
  tone = 'default',
  limit = 4,
  moreHref,
}: AttentionListProps) {
  if (items.length === 0) return null;

  const shown = items.slice(0, limit);
  const remaining = items.length - shown.length;
  const toneClass =
    tone === 'danger' ? 'text-destructive' : tone === 'warning' ? 'text-warning' : '';

  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <Icon className={`size-4 ${toneClass}`} aria-hidden="true" />
        {title}
        <span className="tabular-money text-muted-foreground">({items.length})</span>
      </h3>
      <ul className="divide-y rounded-md border">
        {shown.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <Link
                to={item.href}
                className="text-sm font-medium underline-offset-2 hover:underline"
              >
                {item.title}
              </Link>
              <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
            </div>
            {item.note ? (
              <span className={`shrink-0 text-xs ${toneClass}`}>{item.note}</span>
            ) : null}
          </li>
        ))}
      </ul>
      {remaining > 0 && moreHref ? (
        <Link to={moreHref} className="text-xs text-muted-foreground underline underline-offset-2">
          and {remaining} more
        </Link>
      ) : null}
    </section>
  );
}
