/**
 * Canonical Firestore collection paths.
 *
 * Every module registers its collection here so paths are never spelled out as
 * string literals in feature code, and so the full data model is visible in one
 * place. Collections are added as their modules are implemented.
 */
export const COLLECTIONS = {
  users: 'users',
  auditLogs: 'auditLogs',
  customers: 'customers',
  enquiries: 'enquiries',
  jobs: 'jobs',
  locations: 'locations',
  counters: 'counters',
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];
