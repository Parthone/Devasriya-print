import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

import { isDemoMode } from '@/config/demo';
import type { Language } from '@/constants/india';
import {
  demoCustomerAccount,
  demoCustomerAccountForCustomer,
  setDemoCustomerAccountActive,
  upsertDemoCustomerAccount,
} from '@/features/demo/demo-store';
import { parseCustomerAccount, type CustomerAccount } from '@/features/customer-portal/types';
import { getUserAccountProvisioner } from '@/features/users/services/provisioning';
import { getDb } from '@/lib/firebase/client';
import { toAppError } from '@/lib/firebase/errors';
import { COLLECTIONS } from '@/services/base/collections';
import { FirestoreRepository, where } from '@/services/base/repository';
import { AppError, type Id } from '@/types/common';

export const customerAccountRepository = new FirestoreRepository<CustomerAccount>(
  COLLECTIONS.customerAccounts,
  parseCustomerAccount,
);

/** The portal account for one auth uid, or null when the uid is not a customer. */
export async function findCustomerAccount(uid: Id): Promise<CustomerAccount | null> {
  if (isDemoMode()) return demoCustomerAccount(uid);
  return customerAccountRepository.findById(uid);
}

/** The portal account attached to a customer record, if one has been created. */
export async function findAccountForCustomer(customerId: Id): Promise<CustomerAccount | null> {
  if (isDemoMode()) return demoCustomerAccountForCustomer(customerId);

  const page = await customerAccountRepository.list({
    constraints: [where('customerId', '==', customerId)],
    pageSize: 1,
  });
  return page.items[0] ?? null;
}

export interface CreateCustomerAccountInput {
  customerId: Id;
  customerName: string;
  email: string;
  preferredLanguage: Language;
  actor: { uid: Id; name: string };
}

/**
 * Gives a customer a login for the review portal.
 *
 * The account is created with a throwaway password and the customer is sent a
 * password-setup email, so nobody at the print shop ever knows or chooses a
 * customer's password - the same rule Module 1 applies to staff. The Firestore
 * document is written after the auth account exists, so a failed sign-up never
 * leaves a portal record pointing at nothing.
 */
export async function createCustomerAccount({
  customerId,
  customerName,
  email,
  preferredLanguage,
  actor,
}: CreateCustomerAccountInput): Promise<CustomerAccount> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) {
    throw new AppError('invalid-input', 'A portal login needs an email address.');
  }

  const existing = await findAccountForCustomer(customerId);
  if (existing) {
    throw new AppError('conflict', 'This customer already has a portal login.');
  }

  const provisioner = getUserAccountProvisioner();
  const { uid } = await provisioner.createAccount(trimmed);
  const now = new Date();

  const account: CustomerAccount = {
    id: uid,
    customerId,
    customerName,
    email: trimmed,
    preferredLanguage,
    isActive: true,
    createdAt: now,
    createdBy: actor.uid,
    updatedAt: now,
    updatedBy: actor.uid,
  };

  if (isDemoMode()) {
    upsertDemoCustomerAccount(account);
    return account;
  }

  try {
    const { id: _id, ...data } = account;
    await setDoc(doc(getDb(), COLLECTIONS.customerAccounts, uid), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw toAppError(error);
  }

  await provisioner.sendPasswordSetupEmail(trimmed).catch(() => undefined);
  return account;
}

/** Revokes or restores portal access without destroying the review history. */
export async function setCustomerAccountActive(
  account: CustomerAccount,
  isActive: boolean,
  actorId: Id,
): Promise<void> {
  if (isDemoMode()) {
    setDemoCustomerAccountActive(account.id, isActive, actorId);
    return;
  }

  try {
    await updateDoc(doc(getDb(), COLLECTIONS.customerAccounts, account.id), {
      isActive,
      updatedAt: serverTimestamp(),
      updatedBy: actorId,
    });
  } catch (error) {
    throw toAppError(error);
  }
}
