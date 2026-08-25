/**
 * Canonical PostgreSQL table names.
 *
 * Every module registers its table here so names are never spelled out as
 * string literals in feature code, and so the full data model is visible in one
 * place.
 */
export const TABLES = {
  principals: 'principals',
  staffProfiles: 'staff_profiles',
  customerAccounts: 'customer_accounts',
  customers: 'customers',
  rolePermissions: 'role_permissions',
  locations: 'locations',
  products: 'products',
  enquiries: 'enquiries',
  enquiryFollowUps: 'enquiry_follow_ups',
  jobs: 'jobs',
  jobPricing: 'job_pricing',
  jobPricingLines: 'job_pricing_lines',
  estimates: 'estimates',
  estimateLines: 'estimate_lines',
  designs: 'designs',
  auditEvents: 'audit_events',
  workflowStages: 'workflow_stages',
  productionRuns: 'production_runs',
  productionTasks: 'production_tasks',
  productionEvents: 'production_events',
} as const;

export type TableName = (typeof TABLES)[keyof typeof TABLES];

/** Private Storage buckets. Mirrored in supabase/migrations/*_storage.sql. */
export const BUCKETS = {
  enquiryAudio: 'enquiry-audio',
  jobAudio: 'job-audio',
  designs: 'designs',
} as const;

export type BucketName = (typeof BUCKETS)[keyof typeof BUCKETS];

/**
 * How long a signed file URL lives.
 *
 * Short on purpose. The URL is resolved when somebody looks at a file and is
 * never stored, so it only has to outlive the page that asked for it.
 */
export const SIGNED_URL_TTL_SECONDS = 300;
