import { FileSpreadsheet } from 'lucide-react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Report } from '@/features/reports/types';
import { cn } from '@/lib/utils';

/**
 * A report on screen.
 *
 * Wide reports scroll inside their own box rather than pushing the page
 * sideways, and the same rows go into the CSV unchanged.
 */
export function ReportTable({ report }: { report: Report }) {
  if (report.rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
        <FileSpreadsheet className="size-6" aria-hidden="true" />
        <p className="text-sm">Nothing matches these filters.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {report.columns.map((column) => (
                <TableHead key={column.key} className={cn(column.numeric && 'text-right')}>
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.rows.map((row) => (
              <TableRow key={row.key}>
                {report.columns.map((column) => (
                  <TableCell
                    key={column.key}
                    className={cn(
                      'text-sm whitespace-nowrap',
                      column.numeric && 'tabular-money text-right',
                      row.tone === 'danger' && 'text-destructive',
                    )}
                  >
                    {row.cells[column.key] ?? '-'}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {report.summary ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {report.summary}
        </p>
      ) : null}
    </div>
  );
}
