import { AuthError, type PostgrestError } from '@supabase/supabase-js';

import { AppError, type AppErrorCode } from '@/types/common';

/**
 * PostgreSQL SQLSTATE codes we can say something useful about.
 *
 * A row level security refusal surfaces as 42501 (insufficient privilege) or,
 * for a failed INSERT/UPDATE `WITH CHECK`, as PostgREST's own 42501. Either way
 * the honest translation is "you do not have permission to do that" - the
 * database will not say more, and neither should the UI.
 */
const PG_CODE_MAP: Record<string, AppErrorCode> = {
  '42501': 'permission-denied', // insufficient privilege / RLS refusal
  '23505': 'already-exists', // unique violation
  '23503': 'conflict', // foreign key violation
  '23514': 'invalid-input', // check constraint violation
  '23502': 'invalid-input', // not null violation
  '22P02': 'invalid-input', // invalid text representation
  '40001': 'conflict', // serialization failure
  '40P01': 'conflict', // deadlock detected
  '55P03': 'conflict', // lock not available
  PGRST116: 'not-found', // no rows for a single() select
  PGRST301: 'unauthenticated', // JWT missing or expired
};

/**
 * Errors raised on purpose by our own SQL functions and triggers.
 *
 * Business rules that live in the database - an invalid status transition, a
 * quotation whose wording can no longer change - raise with SQLSTATE 'P0001'
 * and a message written for a person. Those messages are passed through
 * verbatim; everything else gets a generic one.
 */
const RAISED_BY_US = 'P0001';

const AUTH_CODE_MAP: Record<string, AppErrorCode> = {
  invalid_credentials: 'unauthenticated',
  email_not_confirmed: 'unauthenticated',
  user_banned: 'permission-denied',
  user_not_found: 'unauthenticated',
  over_request_rate_limit: 'unavailable',
  over_email_send_rate_limit: 'unavailable',
  signup_disabled: 'permission-denied',
  weak_password: 'invalid-input',
  same_password: 'invalid-input',
  session_expired: 'unauthenticated',
  session_not_found: 'unauthenticated',
};

const USER_MESSAGES: Record<AppErrorCode, string> = {
  unauthenticated: 'You are signed out. Please sign in again.',
  'permission-denied': 'You do not have permission to do that.',
  'not-found': 'The requested record was not found.',
  'already-exists': 'That record already exists.',
  'invalid-input': 'Some of the details entered are not valid.',
  conflict: 'This record was changed elsewhere. Refresh and try again.',
  unavailable: 'Cannot reach the server right now. Check your connection and retry.',
  unknown: 'Something went wrong. Please try again.',
};

function isPostgrestError(value: unknown): value is PostgrestError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    'code' in value &&
    'details' in value
  );
}

/** Normalises any thrown value into an AppError with a user-safe message. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (error instanceof AuthError) {
    const code = AUTH_CODE_MAP[error.code ?? ''] ?? 'unknown';
    return new AppError(code, USER_MESSAGES[code], error);
  }

  if (isPostgrestError(error)) {
    // A rule we raised ourselves already carries wording meant for a person.
    if (error.code === RAISED_BY_US && error.message) {
      return new AppError('conflict', error.message, error);
    }
    const code = PG_CODE_MAP[error.code] ?? 'unknown';
    return new AppError(code, USER_MESSAGES[code], error);
  }

  if (error instanceof TypeError && /fetch|network/i.test(error.message)) {
    return new AppError('unavailable', USER_MESSAGES.unavailable, error);
  }

  return new AppError('unknown', USER_MESSAGES.unknown, error);
}

export function getUserMessage(code: AppErrorCode): string {
  return USER_MESSAGES[code];
}

/** Throws on a PostgREST error, otherwise hands back the data. */
export function unwrap<T>(result: { data: T | null; error: PostgrestError | null }): T {
  if (result.error) throw toAppError(result.error);
  if (result.data === null) {
    throw new AppError('not-found', USER_MESSAGES['not-found']);
  }
  return result.data;
}

/** Same, but a missing row is a legitimate answer rather than a failure. */
export function unwrapMaybe<T>(result: { data: T | null; error: PostgrestError | null }): T | null {
  if (result.error) {
    // PGRST116 is "no rows" from `.single()`, which is not an error here.
    if (result.error.code === 'PGRST116') return null;
    throw toAppError(result.error);
  }
  return result.data;
}
