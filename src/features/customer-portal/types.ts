import { z } from 'zod';

import { LANGUAGES, type Language } from '@/constants/india';
import { AppError, type Entity, type Id } from '@/types/common';

/**
 * A customer's login for the review portal.
 *
 * Deliberately a different collection from `users`. A customer is not a staff
 * member with fewer permissions - they are a different kind of principal
 * altogether, with no role, no entry in the permission matrix and no reachable
 * staff screen. The document id is the Firebase Auth uid, which is the link the
 * security rules are built on, exactly as `users/{uid}` is for employees.
 *
 * One uid is never both: creating either kind of account is refused by the
 * rules if the other already exists for that uid.
 */
export interface CustomerAccount extends Entity {
  customerId: Id;
  customerName: string;
  email: string;
  preferredLanguage: Language;
  isActive: boolean;
}

/** The resolved portal session. No permissions, by design. */
export interface CustomerSession {
  uid: Id;
  email: string;
  customerId: Id;
  customerName: string;
  preferredLanguage: Language;
  account: CustomerAccount;
}

const customerAccountSchema = z.object({
  id: z.string().min(1),
  customerId: z.string().min(1),
  customerName: z.string(),
  email: z.string().min(3),
  preferredLanguage: z.enum(LANGUAGES),
  isActive: z.boolean(),
  createdAt: z.date(),
  createdBy: z.string(),
  updatedAt: z.date(),
  updatedBy: z.string(),
});

export function parseCustomerAccount(data: unknown, id: string): CustomerAccount {
  const result = customerAccountSchema.safeParse(data);
  if (!result.success) {
    throw new AppError('invalid-input', `Customer account "${id}" is malformed.`, result.error);
  }
  return result.data;
}

export function toCustomerSession(account: CustomerAccount, email: string | null): CustomerSession {
  return {
    uid: account.id,
    email: email ?? account.email,
    customerId: account.customerId,
    customerName: account.customerName,
    preferredLanguage: account.preferredLanguage,
    account,
  };
}
