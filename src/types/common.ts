/**
 * Shared primitives used by every module. Domain types live with their feature;
 * only genuinely cross-cutting shapes belong here.
 */

/** A record identifier: a UUID primary key. */
export type Id = string;

/** Present on every persisted document. Written by the data-access layer. */
export interface AuditFields {
  createdAt: Date;
  createdBy: Id;
  updatedAt: Date;
  updatedBy: Id;
}

/** Soft-delete marker. Business records are never hard-deleted. */
export interface SoftDeleteFields {
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: Id;
}

/** Base shape of any stored entity. */
export interface Entity extends AuditFields {
  id: Id;
}

export type WithId<T> = T & { id: Id };

/** Fields the caller supplies on create - audit fields are added by the layer. */
export type CreateInput<T extends Entity> = Omit<T, keyof Entity>;

/** Fields the caller may change on update. */
export type UpdateInput<T extends Entity> = Partial<CreateInput<T>>;

export type SortDirection = 'asc' | 'desc';

export interface SortSpec<TField extends string = string> {
  field: TField;
  direction: SortDirection;
}

export interface PageRequest {
  pageSize: number;
  /** Opaque cursor returned by the previous page. */
  cursor?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  /** Cursor for the next page; absent when the last page has been reached. */
  nextCursor?: string;
  hasMore: boolean;
}

/** Explicit success/failure without exceptions, for expected error paths. */
export type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export type AppErrorCode =
  | 'unauthenticated'
  | 'permission-denied'
  | 'not-found'
  | 'already-exists'
  | 'invalid-input'
  | 'conflict'
  | 'unavailable'
  | 'unknown';

/** Transport-agnostic error surfaced to the UI. */
export class AppError extends Error {
  readonly code: AppErrorCode;
  override readonly cause?: unknown;

  constructor(code: AppErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

/** Value + label pair for selects and filters. */
export interface Option<TValue extends string = string> {
  value: TValue;
  label: string;
}

/** Simple range used by report and dashboard filters. */
export interface DateRange {
  from: Date;
  to: Date;
}
