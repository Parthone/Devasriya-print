import { deleteField, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

import { parseCustomer, type Customer, type CustomerInput } from '@/features/customers/types';
import { getDb } from '@/lib/firebase/client';
import { toAppError } from '@/lib/firebase/errors';
import { COLLECTIONS } from '@/services/base/collections';
import { FirestoreRepository, orderBy } from '@/services/base/repository';
import type { Id } from '@/types/common';

export const customerRepository = new FirestoreRepository<Customer>(
  COLLECTIONS.customers,
  parseCustomer,
);

/**
 * Safety cap on the directory fetch.
 *
 * Module 3 loads the customer list once, caches it, and searches and paginates
 * it in the browser. That gives substring search across every field, which is
 * what people expect, and stays cheap at this size. If a business ever passes
 * this many customers the load reports it (see `capReached`) so search can move
 * server-side behind this same service - the UI calls these functions, never
 * Firestore.
 */
export const CUSTOMER_FETCH_CAP = 1000;

export interface CustomerDirectory {
  customers: Customer[];
  /** True when there are more customers than the cap; the list is incomplete. */
  capReached: boolean;
  cap: number;
}

export async function listCustomers(): Promise<CustomerDirectory> {
  const page = await customerRepository.list({
    constraints: [orderBy('nameLower', 'asc')],
    pageSize: CUSTOMER_FETCH_CAP,
  });

  if (page.hasMore) {
    console.warn(
      `[customers] more than ${String(CUSTOMER_FETCH_CAP)} customers exist; ` +
        'the directory is showing the first page only. Move search server-side.',
    );
  }

  return { customers: page.items, capReached: page.hasMore, cap: CUSTOMER_FETCH_CAP };
}

export async function getCustomer(id: Id): Promise<Customer> {
  return customerRepository.getById(id);
}

export async function findCustomer(id: Id): Promise<Customer | null> {
  return customerRepository.findById(id);
}

function documentFor(input: CustomerInput, actorId: Id) {
  return {
    ...input,
    nameLower: input.name.toLowerCase(),
    updatedAt: serverTimestamp(),
    updatedBy: actorId,
  };
}

export async function createCustomer(input: CustomerInput, actorId: Id): Promise<Customer> {
  try {
    const id = customerRepository.newId();
    await setDoc(doc(getDb(), COLLECTIONS.customers, id), {
      ...documentFor(input, actorId),
      // Reserved for the future customer portal. Never set by this module.
      portalUserId: null,
      createdAt: serverTimestamp(),
      createdBy: actorId,
    });

    const now = new Date();
    return {
      ...input,
      id,
      nameLower: input.name.toLowerCase(),
      portalUserId: null,
      createdAt: now,
      createdBy: actorId,
      updatedAt: now,
      updatedBy: actorId,
    };
  } catch (error) {
    throw toAppError(error);
  }
}

/**
 * Updates the editable fields only.
 *
 * `portalUserId`, `createdAt` and `createdBy` are never part of the payload, so
 * an ordinary edit cannot overwrite them; the security rules enforce the same.
 */
export async function updateCustomer(id: Id, input: CustomerInput, actorId: Id): Promise<void> {
  try {
    await updateDoc(doc(getDb(), COLLECTIONS.customers, id), {
      ...documentFor(input, actorId),
      // A cleared optional field is removed from the document rather than
      // stored as an empty value, so reads stay clean.
      businessName: input.businessName ?? deleteField(),
      alternateMobile: input.alternateMobile ?? deleteField(),
      email: input.email ?? deleteField(),
      gstin: input.gstin ?? deleteField(),
      notes: input.notes ?? deleteField(),
    });
  } catch (error) {
    throw toAppError(error);
  }
}

/** Customers are archived, never deleted: their history must stay intact. */
export async function setCustomerArchived(id: Id, isArchived: boolean, actorId: Id): Promise<void> {
  try {
    await updateDoc(doc(getDb(), COLLECTIONS.customers, id), {
      isArchived,
      updatedAt: serverTimestamp(),
      updatedBy: actorId,
    });
  } catch (error) {
    throw toAppError(error);
  }
}
