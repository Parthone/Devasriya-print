import { BarChart3, Download, Printer } from 'lucide-react';
import { useMemo, useState } from 'react';

import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { fromDateInputValue, toDateInputValue } from '@/features/enquiries/types';
import { ReportTable } from '@/features/reports/components/ReportTable';
import { useReportSources } from '@/features/reports/hooks/use-report-sources';
import { downloadCsv } from '@/features/reports/services/csv';
import {
  describeRange,
  RANGE_PRESET_LABELS,
  RANGE_PRESETS,
  rangeFor,
  type RangePreset,
} from '@/features/reports/services/date-range';
import { buildReport } from '@/features/reports/services/report-builders';
import { ANY_STATUS, type ReportId } from '@/features/reports/types';

/**
 * Operational reports.
 *
 * Every report is built in the browser from the directory caches the rest of
 * the application already holds, so opening one costs nothing extra and there
 * is no second copy of the business rules on a server somewhere. What is on
 * screen is exactly what the CSV contains.
 */
export function ReportsPage() {
  const now = useMemo(() => new Date(), []);

  const [selected, setSelected] = useState<ReportId>('jobs');
  const [preset, setPreset] = useState<RangePreset>('last-30');
  const [status, setStatus] = useState<string>(ANY_STATUS);
  const [from, setFrom] = useState(toDateInputValue(now));
  const [to, setTo] = useState(toDateInputValue(now));

  const { sources, available, isPending, isError } = useReportSources(selected);

  // A role that cannot read the chosen report falls back to the first one it
  // can, so the page is never a dead end.
  const definition = available.find((entry) => entry.id === selected) ?? available[0];
  const activeId = definition?.id ?? selected;

  const range = useMemo(
    () => rangeFor(preset, now, { from: fromDateInputValue(from), to: fromDateInputValue(to) }),
    [preset, now, from, to],
  );

  const report = useMemo(
    () =>
      definition
        ? buildReport(definition.id, sources, {
            range: definition.usesDateRange ? range : { from: null, to: null },
            status,
            now,
          })
        : null,
    [definition, sources, range, status, now],
  );

  if (available.length === 0 || !definition) {
    return (
      <>
        <PageHeader title="Reports" description="Operational reports for the business." />
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <BarChart3 className="size-6" aria-hidden="true" />
            <p className="text-sm">
              Your role does not have access to any of the reports. Ask an administrator if you need
              one.
            </p>
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Reports"
        description="Operational reports for the business, exactly as they appear on screen."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                window.print();
              }}
            >
              <Printer className="size-4" aria-hidden="true" /> Print
            </Button>
            <Button
              disabled={!report || report.rows.length === 0}
              onClick={() => {
                if (report) downloadCsv(report, now);
              }}
            >
              <Download className="size-4" aria-hidden="true" /> Export CSV
            </Button>
          </div>
        }
      />

      <div className="no-print flex flex-wrap gap-2" role="tablist" aria-label="Reports">
        {available.map((entry) => (
          <Button
            key={entry.id}
            role="tab"
            aria-selected={entry.id === activeId}
            variant={entry.id === activeId ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setSelected(entry.id);
              setStatus(ANY_STATUS);
            }}
          >
            {entry.title}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{definition.title}</CardTitle>
          <CardDescription>
            {definition.description}
            {definition.usesDateRange ? ` Showing ${describeRange(range).toLowerCase()}.` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="no-print flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            {definition.usesDateRange ? (
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Period</span>
                <Select
                  value={preset}
                  onValueChange={(value) => {
                    setPreset(value as RangePreset);
                  }}
                >
                  <SelectTrigger className="sm:w-48" aria-label="Period">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RANGE_PRESETS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {RANGE_PRESET_LABELS[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            ) : null}

            {definition.usesDateRange && preset === 'custom' ? (
              <>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted-foreground">From</span>
                  <Input
                    type="date"
                    value={from}
                    aria-label="From date"
                    onChange={(event) => {
                      setFrom(event.target.value);
                    }}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted-foreground">To</span>
                  <Input
                    type="date"
                    value={to}
                    aria-label="To date"
                    onChange={(event) => {
                      setTo(event.target.value);
                    }}
                  />
                </label>
              </>
            ) : null}

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Filter</span>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="sm:w-56" aria-label="Filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {definition.statuses.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>

          {isPending ? (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : isError ? (
            <p role="alert" className="text-sm text-destructive">
              Could not build this report. Check your connection and try again.
            </p>
          ) : report ? (
            <ReportTable report={report} />
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}
