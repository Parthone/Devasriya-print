import { APP_CONFIG } from '@/config/app.config';

/**
 * Indian financial year helpers.
 *
 * The business year starts in April, so document numbers reset then:
 * 1 April 2026 to 31 March 2027 is "2627".
 */
export function financialYearKey(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_CONFIG.timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);

  const year = Number(parts.find((part) => part.type === 'year')?.value ?? '0');
  const month = Number(parts.find((part) => part.type === 'month')?.value ?? '0');

  const startYear = month >= APP_CONFIG.financialYearStartMonth ? year : year - 1;
  const shortStart = String(startYear % 100).padStart(2, '0');
  const shortEnd = String((startYear + 1) % 100).padStart(2, '0');

  return `${shortStart}${shortEnd}`;
}

/** e.g. formatDocumentNumber('ENQ', '2627', 1) -> "ENQ-2627-0001". */
export function formatDocumentNumber(prefix: string, yearKey: string, sequence: number): string {
  return `${prefix}-${yearKey}-${String(sequence).padStart(4, '0')}`;
}
