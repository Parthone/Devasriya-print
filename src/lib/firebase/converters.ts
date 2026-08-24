import {
  Timestamp,
  type DocumentData,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
  type WithFieldValue,
} from 'firebase/firestore';

import type { Entity } from '@/types/common';

/**
 * Firestore <-> domain conversion.
 *
 * Two rules the rest of the app depends on:
 *  1. `id` lives on the domain object but is never written into the document.
 *  2. Dates are `Date` in the domain and `Timestamp` in Firestore - the
 *     conversion is recursive so nested objects and arrays are handled too.
 */
function toFirestoreValue(value: unknown): unknown {
  if (value instanceof Date) return Timestamp.fromDate(value);
  if (Array.isArray(value)) return value.map(toFirestoreValue);
  if (isPlainObject(value)) {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry === undefined) continue;
      output[key] = toFirestoreValue(entry);
    }
    return output;
  }
  return value;
}

function fromFirestoreValue(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate();
  if (Array.isArray(value)) return value.map(fromFirestoreValue);
  if (isPlainObject(value)) {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      output[key] = fromFirestoreValue(entry);
    }
    return output;
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Builds a typed converter for a collection of `T`.
 *
 * `validate` is optional but recommended per collection (a zod parse) so that
 * malformed legacy documents fail loudly at the boundary instead of leaking
 * into the UI.
 */
export function createConverter<T extends Entity>(
  validate?: (data: unknown, id: string) => T,
): FirestoreDataConverter<T> {
  return {
    toFirestore(model: WithFieldValue<T>): DocumentData {
      const { id: _id, ...rest } = model as WithFieldValue<T> & { id?: unknown };
      return toFirestoreValue(rest) as DocumentData;
    },

    fromFirestore(snapshot: QueryDocumentSnapshot): T {
      const raw = fromFirestoreValue(snapshot.data()) as Record<string, unknown>;
      const withId = { ...raw, id: snapshot.id };
      return validate ? validate(withId, snapshot.id) : (withId as unknown as T);
    },
  };
}
