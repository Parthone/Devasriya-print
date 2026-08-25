import {
  DEMO_AUDIT_EVENTS,
  DEMO_CUSTOMERS,
  DEMO_EMPLOYEES,
  DEMO_ENQUIRIES,
  DEMO_ESTIMATES,
  DEMO_JOBS,
  DEMO_JOB_PRICING,
  DEMO_LOCATIONS,
  DEMO_OWNER_UID,
  DEMO_PRODUCTS,
} from '@/features/demo/demo-data';
import type { AuditEvent } from '@/features/audit/types';
import type { Customer, CustomerInput } from '@/features/customers/types';
import type { Enquiry } from '@/features/enquiries/types';
import type { Estimate } from '@/features/estimates/types';
import type { JobPricingDocument } from '@/features/jobs/pricing-types';
import type { Job } from '@/features/jobs/types';
import type { Location, LocationInput } from '@/features/locations/types';
import type { Product, ProductInput } from '@/features/products/types';
import type { JobPricing } from '@/lib/pricing';
import type { UserProfile } from '@/types/auth';
import type { Id } from '@/types/common';

/**
 * In-memory store behind demo mode.
 *
 * Edits made during a demo last until the page is reloaded, which is enough to
 * show that the screens work. There is deliberately no offline database and no
 * persistence: this exists to demonstrate the UI, not to be a second backend.
 */
let customers: Customer[] = [...DEMO_CUSTOMERS];
let employees: UserProfile[] = [...DEMO_EMPLOYEES];
let auditEvents: AuditEvent[] = [...DEMO_AUDIT_EVENTS];
let sequence = 0;
/** Object URLs for recordings made during a demo. Never uploaded anywhere. */
let audioUrls = new Map<string, string>();

function nextId(prefix: string): Id {
  sequence += 1;
  return `${prefix}-${String(sequence)}`;
}

/** Resets everything to the seed data. Used by tests. */
export function rememberDemoAudio(attachmentId: string, url: string): void {
  audioUrls.set(attachmentId, url);
}

export function demoAudioUrl(attachmentId: string): string | undefined {
  return audioUrls.get(attachmentId);
}

export function resetDemoStore(): void {
  audioUrls = new Map();
  locations = [...DEMO_LOCATIONS];
  enquiries = [...DEMO_ENQUIRIES];
  jobs = [...DEMO_JOBS];
  products = [...DEMO_PRODUCTS];
  jobPricing = new Map(DEMO_JOB_PRICING.map((entry) => [entry.jobId, entry]));
  estimates = [...DEMO_ESTIMATES];
  customers = [...DEMO_CUSTOMERS];
  employees = [...DEMO_EMPLOYEES];
  auditEvents = [...DEMO_AUDIT_EVENTS];
  sequence = 0;
}

export function demoCustomers(): Customer[] {
  return [...customers].sort((a, b) => a.nameLower.localeCompare(b.nameLower));
}

export function demoCustomer(id: Id): Customer | null {
  return customers.find((customer) => customer.id === id) ?? null;
}

export function addDemoCustomer(input: CustomerInput, actorId: Id): Customer {
  const now = new Date();
  const customer: Customer = {
    ...input,
    id: nextId('demo-customer-new'),
    nameLower: input.name.toLowerCase(),
    portalUserId: null,
    createdAt: now,
    createdBy: actorId,
    updatedAt: now,
    updatedBy: actorId,
  };
  customers = [...customers, customer];
  return customer;
}

export function updateDemoCustomer(id: Id, input: CustomerInput, actorId: Id): void {
  customers = customers.map((customer) =>
    customer.id === id
      ? {
          ...customer,
          ...input,
          nameLower: input.name.toLowerCase(),
          updatedAt: new Date(),
          updatedBy: actorId,
        }
      : customer,
  );
}

export function setDemoCustomerArchived(id: Id, isArchived: boolean, actorId: Id): void {
  customers = customers.map((customer) =>
    customer.id === id
      ? { ...customer, isArchived, updatedAt: new Date(), updatedBy: actorId }
      : customer,
  );
}

export function demoEmployees(): UserProfile[] {
  return [...employees].sort((a, b) => a.name.localeCompare(b.name));
}

export function demoEmployee(id: Id): UserProfile | null {
  return employees.find((employee) => employee.id === id) ?? null;
}

export function addDemoEmployee(
  input: Omit<UserProfile, 'id' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'>,
  actorId: Id,
): UserProfile {
  const now = new Date();
  const employee: UserProfile = {
    ...input,
    id: nextId('demo-employee-new'),
    createdAt: now,
    createdBy: actorId,
    updatedAt: now,
    updatedBy: actorId,
  };
  employees = [...employees, employee];
  return employee;
}

export function updateDemoEmployee(id: Id, changes: Partial<UserProfile>, actorId: Id): void {
  employees = employees.map((employee) =>
    employee.id === id
      ? { ...employee, ...changes, updatedAt: new Date(), updatedBy: actorId }
      : employee,
  );
}

export function demoAuditEventsFor(userId: Id): AuditEvent[] {
  return auditEvents
    .filter((event) => event.targetUserId === userId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function recordDemoAuditEvent(event: Omit<AuditEvent, 'id'>): void {
  auditEvents = [...auditEvents, { ...event, id: nextId('demo-audit-new') }];
}

export { DEMO_OWNER_UID };

// ---------------------------------------------------------------------------
// Module 4: locations, enquiries and jobs
// ---------------------------------------------------------------------------

let locations: Location[] = [...DEMO_LOCATIONS];
let enquiries: Enquiry[] = [...DEMO_ENQUIRIES];
let jobs: Job[] = [...DEMO_JOBS];

export function demoLocations(): Location[] {
  return [...locations].sort((a, b) => a.name.localeCompare(b.name));
}

export function demoLocation(id: Id): Location | null {
  return locations.find((location) => location.id === id) ?? null;
}

export function addDemoLocation(input: LocationInput, actorId: Id): Location {
  const now = new Date();
  const location: Location = {
    ...input,
    id: nextId('demo-location-new'),
    contactUserId: null,
    createdAt: now,
    createdBy: actorId,
    updatedAt: now,
    updatedBy: actorId,
  };
  locations = [...locations, location];
  return location;
}

export function updateDemoLocation(id: Id, input: LocationInput, actorId: Id): void {
  locations = locations.map((location) =>
    location.id === id
      ? { ...location, ...input, updatedAt: new Date(), updatedBy: actorId }
      : location,
  );
}

export function demoEnquiries(): Enquiry[] {
  return [...enquiries].sort((a, b) => b.enquiryDate.getTime() - a.enquiryDate.getTime());
}

export function demoEnquiry(id: Id): Enquiry | null {
  return enquiries.find((enquiry) => enquiry.id === id) ?? null;
}

export function addDemoEnquiry(enquiry: Omit<Enquiry, 'id'>): Enquiry {
  const created: Enquiry = { ...enquiry, id: nextId('demo-enquiry-new') };
  enquiries = [...enquiries, created];
  return created;
}

export function updateDemoEnquiry(id: Id, changes: Partial<Enquiry>): void {
  enquiries = enquiries.map((enquiry) =>
    enquiry.id === id ? { ...enquiry, ...changes, updatedAt: new Date() } : enquiry,
  );
}

export function demoJobs(): Job[] {
  return [...jobs].sort((a, b) => b.jobDate.getTime() - a.jobDate.getTime());
}

export function demoJob(id: Id): Job | null {
  return jobs.find((job) => job.id === id) ?? null;
}

export function addDemoJob(job: Omit<Job, 'id'>): Job {
  const created: Job = { ...job, id: nextId('demo-job-new') };
  jobs = [...jobs, created];
  return created;
}

export function updateDemoJob(id: Id, changes: Partial<Job>): void {
  jobs = jobs.map((job) => (job.id === id ? { ...job, ...changes, updatedAt: new Date() } : job));
}

/** Next demo document number for a scope, mimicking the real counters. */
export function nextDemoNumber(prefix: string, yearKey: string, existing: string[]): string {
  const used = existing
    .map((value) => Number(value.split('-').at(-1) ?? '0'))
    .filter((value) => Number.isFinite(value));
  const next = (used.length > 0 ? Math.max(...used) : 0) + 1;
  return `${prefix}-${yearKey}-${String(next).padStart(4, '0')}`;
}

// ---------------------------------------------------------------------------
// Module 5: rate card
// ---------------------------------------------------------------------------

let products: Product[] = [...DEMO_PRODUCTS];
let jobPricing = new Map<Id, JobPricingDocument>(
  DEMO_JOB_PRICING.map((entry) => [entry.jobId, entry]),
);

export function demoJobPricing(jobId: Id): JobPricingDocument | null {
  return jobPricing.get(jobId) ?? null;
}

export function setDemoJobPricing(jobId: Id, pricing: JobPricing, actorId: Id): void {
  const now = new Date();
  const existing = jobPricing.get(jobId);
  jobPricing.set(jobId, {
    ...pricing,
    id: jobId,
    jobId,
    createdAt: existing?.createdAt ?? now,
    createdBy: existing?.createdBy ?? actorId,
    updatedAt: now,
    updatedBy: actorId,
  });
}

export function demoProducts(): Product[] {
  return [...products].sort((a, b) => a.name.localeCompare(b.name));
}

export function addDemoProduct(input: ProductInput, actorId: Id): Product {
  const now = new Date();
  const product: Product = {
    ...input,
    id: nextId('demo-product-new'),
    createdAt: now,
    createdBy: actorId,
    updatedAt: now,
    updatedBy: actorId,
  };
  products = [...products, product];
  return product;
}

export function updateDemoProduct(id: Id, changes: Partial<Product>, actorId: Id): void {
  products = products.map((product) =>
    product.id === id
      ? { ...product, ...changes, updatedAt: new Date(), updatedBy: actorId }
      : product,
  );
}

// ---------------------------------------------------------------------------
// Module 6: estimates
// ---------------------------------------------------------------------------

let estimates: Estimate[] = [...DEMO_ESTIMATES];

export function demoEstimates(): Estimate[] {
  return [...estimates].sort((a, b) => b.estimateDate.getTime() - a.estimateDate.getTime());
}

export function demoEstimate(id: Id): Estimate | null {
  return estimates.find((estimate) => estimate.id === id) ?? null;
}

export function addDemoEstimate(estimate: Omit<Estimate, 'id'>): Estimate {
  const created: Estimate = { ...estimate, id: nextId('demo-estimate-new') };
  estimates = [...estimates, created];
  return created;
}

export function updateDemoEstimate(id: Id, changes: Partial<Estimate>): void {
  estimates = estimates.map((estimate) =>
    estimate.id === id ? { ...estimate, ...changes, updatedAt: new Date() } : estimate,
  );
}
