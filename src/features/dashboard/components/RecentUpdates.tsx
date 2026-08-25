import { History } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  RECENT_UPDATE_LABELS,
  type RecentUpdate,
} from '@/features/dashboard/services/recent-updates';
import { formatDateTime } from '@/lib/format';

/**
 * The most recently touched records.
 *
 * Described honestly in the UI: it is built from the timestamps on the records
 * themselves, not from an event log, so it shows the latest change per record.
 */
export function RecentUpdates({ updates }: { updates: RecentUpdate[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent updates</CardTitle>
        <CardDescription>The latest change on each record.</CardDescription>
      </CardHeader>
      <CardContent>
        {updates.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
            <History className="size-5" aria-hidden="true" />
            <p className="text-sm">Nothing has changed yet.</p>
          </div>
        ) : (
          <ol className="divide-y">
            {updates.map((update) => (
              <li key={update.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="text-muted-foreground">
                      {RECENT_UPDATE_LABELS[update.kind]}
                    </span>{' '}
                    {update.href ? (
                      <Link
                        to={update.href}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {update.title}
                      </Link>
                    ) : (
                      <span className="font-medium">{update.title}</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{update.subtitle}</p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDateTime(update.at)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
