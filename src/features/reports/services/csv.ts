import type { Report } from '@/features/reports/types';

/**
 * One CSV field.
 *
 * Anything containing a comma, a quote or a newline is quoted and its quotes
 * doubled - the whole of RFC 4180 that matters here. A leading =, +, - or @ is
 * prefixed with a quote so a spreadsheet treats it as text: a customer called
 * "-Sharma" is a name, not a formula.
 */
export function csvField(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/** Exactly what is on screen, in the same order. */
export function toCsv(report: Report): string {
  const header = report.columns.map((column) => csvField(column.label)).join(',');
  const body = report.rows.map((row) =>
    report.columns.map((column) => csvField(row.cells[column.key] ?? '')).join(','),
  );
  return [header, ...body].join('\r\n');
}

export function csvFileName(report: Report, now: Date = new Date()): string {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return `devasriya-${report.id}-${day}.csv`;
}

/**
 * Hands the file to the browser.
 *
 * A BOM so Excel opens Devanagari and the rupee sign correctly, and the object
 * URL is released once the click has been dispatched.
 */
export function downloadCsv(report: Report, now: Date = new Date()): void {
  const blob = new Blob([`\uFEFF${toCsv(report)}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = csvFileName(report, now);
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
