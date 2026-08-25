import type { Money } from '@/lib/money';
import { money } from '@/lib/money';

/**
 * Row <-> domain conversion.
 *
 * PostgreSQL columns are snake_case and timestamps arrive as ISO strings;
 * the domain is camelCase with real `Date` objects and `Money`. These are the
 * only two facts the mapping layer needs, and keeping them here means each
 * service maps its own table explicitly rather than through reflection - a
 * column rename becomes a compile error instead of an undefined at runtime.
 */

/** A timestamptz column as a Date. */
export function toDate(value: string | null | undefined): Date {
  return new Date(value ?? 0);
}

export function toDateOrNull(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

/** A Date for a timestamptz column. */
export function fromDate(value: Date): string;
export function fromDate(value: Date | null | undefined): string | null;
export function fromDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

/** An integer paise column as Money. */
export function toMoney(paise: number | string): Money {
  return money(typeof paise === 'string' ? Number(paise) : paise);
}

/** Money for an integer paise column. bigint arrives as a string over the wire. */
export function fromMoney(value: Money): number {
  return value.paise;
}

/** A nullable text column as an optional domain field. */
export function toOptional(value: string | null | undefined): string | undefined {
  return value ?? undefined;
}

/** An optional domain field as a nullable column - blank means absent. */
export function fromOptional(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** A numeric column, which PostgREST sends as a string to keep precision. */
export function toNumber(value: number | string | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  return typeof value === 'string' ? Number(value) : value;
}

export function toNumberOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? Number(value) : value;
}

/** The four audit columns every business table carries. */
export interface AuditRow {
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
}

export function toAudit(row: AuditRow) {
  return {
    createdAt: toDate(row.created_at),
    createdBy: row.created_by,
    updatedAt: toDate(row.updated_at),
    updatedBy: row.updated_by,
  };
}
