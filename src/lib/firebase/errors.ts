import { FirebaseError } from 'firebase/app';

import { AppError, type AppErrorCode } from '@/types/common';

const FIRESTORE_CODE_MAP: Record<string, AppErrorCode> = {
  'permission-denied': 'permission-denied',
  unauthenticated: 'unauthenticated',
  'not-found': 'not-found',
  'already-exists': 'already-exists',
  'invalid-argument': 'invalid-input',
  'failed-precondition': 'conflict',
  aborted: 'conflict',
  unavailable: 'unavailable',
  'deadline-exceeded': 'unavailable',
  'resource-exhausted': 'unavailable',
};

const AUTH_CODE_MAP: Record<string, AppErrorCode> = {
  'auth/invalid-email': 'invalid-input',
  'auth/invalid-credential': 'unauthenticated',
  'auth/wrong-password': 'unauthenticated',
  'auth/user-not-found': 'unauthenticated',
  'auth/user-disabled': 'permission-denied',
  'auth/too-many-requests': 'unavailable',
  'auth/network-request-failed': 'unavailable',
  'auth/requires-recent-login': 'unauthenticated',
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

/** Normalises any thrown value into an AppError with a user-safe message. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (error instanceof FirebaseError) {
    const code =
      AUTH_CODE_MAP[error.code] ??
      FIRESTORE_CODE_MAP[error.code.replace(/^firestore\//, '')] ??
      'unknown';
    return new AppError(code, USER_MESSAGES[code], error);
  }

  return new AppError('unknown', USER_MESSAGES.unknown, error);
}

export function getUserMessage(code: AppErrorCode): string {
  return USER_MESSAGES[code];
}
