import { doc, runTransaction, type Transaction } from 'firebase/firestore';

import { formatDocumentNumber } from '@/lib/financial-year';
import { getDb } from '@/lib/firebase/client';
import { toAppError } from '@/lib/firebase/errors';
import { COLLECTIONS } from '@/services/base/collections';

/**
 * Sequential document numbers.
 *
 * A counter document per collection and financial year holds the last used
 * value; allocation reads and increments it inside a transaction, so two people
 * creating a record at the same moment cannot get the same number. Counters are
 * never shown in the UI, and the security rules only accept an increment of
 * exactly one from somebody allowed to create that kind of document.
 */
export type CounterScope = 'enquiries' | 'jobs';

export function counterId(scope: CounterScope, yearKey: string): string {
  return `${scope}-${yearKey}`;
}

const PREFIX: Record<CounterScope, string> = { enquiries: 'ENQ', jobs: 'JOB' };

/** Allocates the next number inside an existing transaction. */
export async function allocateNumberInTransaction(
  transaction: Transaction,
  scope: CounterScope,
  yearKey: string,
): Promise<string> {
  const ref = doc(getDb(), COLLECTIONS.counters, counterId(scope, yearKey));
  const snapshot = await transaction.get(ref);
  const current = snapshot.exists() ? (snapshot.data().value as number) : 0;
  const next = current + 1;

  if (snapshot.exists()) {
    transaction.update(ref, { value: next });
  } else {
    transaction.set(ref, { value: next });
  }

  return formatDocumentNumber(PREFIX[scope], yearKey, next);
}

/** Allocates a number in its own transaction. */
export async function allocateNumber(scope: CounterScope, yearKey: string): Promise<string> {
  try {
    return await runTransaction(getDb(), (transaction) =>
      allocateNumberInTransaction(transaction, scope, yearKey),
    );
  } catch (error) {
    throw toAppError(error);
  }
}
