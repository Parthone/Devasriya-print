import { Link } from 'react-router-dom';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export interface StatusRow {
  key: string;
  label: string;
  count: number;
  /** Optional link into the matching filtered list. */
  to?: string;
}

interface StatusBreakdownProps {
  title: string;
  description?: string;
  rows: StatusRow[];
  emptyMessage: string;
}

/** A simple labelled count list, used for the enquiry and job breakdowns. */
export function StatusBreakdown({ title, description, rows, emptyMessage }: StatusBreakdownProps) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <ul className="divide-y">
            {rows.map((row) => (
              <li key={row.key} className="flex items-center justify-between gap-3 py-2">
                <span className="text-sm">
                  {row.to ? (
                    <Link to={row.to} className="underline-offset-2 hover:underline">
                      {row.label}
                    </Link>
                  ) : (
                    row.label
                  )}
                </span>
                <span className="tabular-money text-sm font-medium">{row.count}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
