import {
  DEMO_AUDIT_EVENTS,
  DEMO_CUSTOMERS,
  DEMO_CUSTOMER_ACCOUNT,
  DEMO_DESIGNS,
  DEMO_PRODUCTION_EVENTS,
  DEMO_PRODUCTION_RUNS,
  DEMO_WORKFLOW_STAGES,
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
import type { CustomerAccount } from '@/features/customer-portal/types';
import type { Customer, CustomerInput } from '@/features/customers/types';
import type { Design } from '@/features/designs/types';
import type { JobStatus } from '@/features/jobs/types';
import {
  canTransition,
  isSettled,
  requiresReason,
  type ProductionEvent,
  type ProductionRun,
  type ProductionStatus,
  type ProductionTask,
  type WorkflowStage,
  type WorkflowStageInput,
} from '@/features/production/types';
import type { Enquiry } from '@/features/enquiries/types';
import type { Estimate } from '@/features/estimates/types';
import type { JobPricingDocument } from '@/features/jobs/pricing-types';
import type { Job } from '@/features/jobs/types';
import type { Location, LocationInput } from '@/features/locations/types';
import type { Product, ProductInput } from '@/features/products/types';
import type { JobPricing } from '@/lib/pricing';
import type { UserProfile } from '@/types/auth';
import { AppError, type Id } from '@/types/common';

/**
 * In-memory store behind demo mode.
 *
 * Edits made during a demo last until the page is reloaded, which is enough to
 * show that the screens work. There is deliberately no offline database and no
 * persistence: this exists to demonstrate the UI, not to be a second backend.
 */
let customers: Customer[] = [...DEMO_CUSTOMERS];
let designs: Design[] = [...DEMO_DESIGNS];
let workflowStages: WorkflowStage[] = [...DEMO_WORKFLOW_STAGES];
let productionRuns: ProductionRun[] = [...DEMO_PRODUCTION_RUNS];
let productionEvents: ProductionEvent[] = [...DEMO_PRODUCTION_EVENTS];
let customerAccounts: CustomerAccount[] = [DEMO_CUSTOMER_ACCOUNT];
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

/**
 * Same in-browser blob map, for any attachment kind.
 *
 * Demo mode never uploads anything, so a "stored file" is just an object URL
 * that lives as long as the tab does.
 */
export function rememberDemoFile(attachmentId: string, url: string): void {
  audioUrls.set(attachmentId, url);
}

export function demoFileUrl(attachmentId: string): string | undefined {
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
  designs = [...DEMO_DESIGNS];
  workflowStages = [...DEMO_WORKFLOW_STAGES];
  productionRuns = [...DEMO_PRODUCTION_RUNS];
  productionEvents = [...DEMO_PRODUCTION_EVENTS];
  customerAccounts = [DEMO_CUSTOMER_ACCOUNT];
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

export function demoDesigns(): Design[] {
  return [...designs].sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
}

export function demoDesign(id: Id): Design | null {
  return designs.find((design) => design.id === id) ?? null;
}

export function demoDesignsForJob(jobId: Id): Design[] {
  return designs.filter((design) => design.jobId === jobId).sort((a, b) => b.version - a.version);
}

export function addDemoDesign(design: Design): Design {
  designs = [design, ...designs];
  return design;
}

export function updateDemoDesign(id: Id, changes: Partial<Design>): void {
  designs = designs.map((design) => (design.id === id ? { ...design, ...changes } : design));
}

export function demoCustomerAccount(uid: Id): CustomerAccount | null {
  return customerAccounts.find((account) => account.id === uid) ?? null;
}

export function demoCustomerAccountForCustomer(customerId: Id): CustomerAccount | null {
  return customerAccounts.find((account) => account.customerId === customerId) ?? null;
}

export function upsertDemoCustomerAccount(account: CustomerAccount): void {
  customerAccounts = [
    account,
    ...customerAccounts.filter((existing) => existing.id !== account.id),
  ];
}

export function setDemoCustomerAccountActive(uid: Id, isActive: boolean, actorId: Id): void {
  customerAccounts = customerAccounts.map((account) =>
    account.id === uid
      ? { ...account, isActive, updatedAt: new Date(), updatedBy: actorId }
      : account,
  );
}

// ── Module 8: production ───────────────────────────────────────────────────

export function demoWorkflowStages(): WorkflowStage[] {
  return [...workflowStages].sort((a, b) => a.position - b.position);
}

export function addDemoStage(input: WorkflowStageInput, actorId: Id): WorkflowStage {
  const now = new Date();
  const stage: WorkflowStage = {
    ...input,
    id: nextId('demo-stage'),
    createdAt: now,
    createdBy: actorId,
    updatedAt: now,
    updatedBy: actorId,
  };
  workflowStages = [...workflowStages, stage];
  return stage;
}

export function updateDemoStage(id: Id, input: WorkflowStageInput, actorId: Id): void {
  workflowStages = workflowStages.map((stage) =>
    stage.id === id ? { ...stage, ...input, updatedAt: new Date(), updatedBy: actorId } : stage,
  );
}

export function demoProductionRuns(): ProductionRun[] {
  return [...productionRuns]
    .map((run) => {
      const job = demoJob(run.jobId);
      return {
        ...run,
        expectedDeliveryDate: job?.expectedDeliveryDate ?? null,
        priority: job?.priority,
        jobStatus: job?.status,
      };
    })
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
}

export function demoProductionEvents(runId: Id): ProductionEvent[] {
  return productionEvents
    .filter((event) => event.runId === runId)
    .sort((a, b) => b.at.getTime() - a.at.getTime());
}

function recordDemoProductionEvent(event: Omit<ProductionEvent, 'id'>): void {
  productionEvents = [{ ...event, id: nextId('demo-prod-event') }, ...productionEvents];
}

/**
 * Sends a demo job to production.
 *
 * The same shape as the real transaction: a run, one task per active stage,
 * the first ready and the rest waiting, and the job moved to in-progress.
 */
export function startDemoRun(jobId: Id, actor: { uid: Id; name: string }): ProductionRun {
  const job = demoJob(jobId);
  if (!job) throw new AppError('not-found', 'That job no longer exists.');
  if (productionRuns.some((run) => run.jobId === jobId)) {
    throw new AppError('conflict', 'This job is already in production.');
  }

  const stages = demoWorkflowStages().filter((stage) => stage.isActive);
  if (stages.length === 0) {
    throw new AppError('invalid-input', 'No production stages are set up yet.');
  }

  const now = new Date();
  const runId = nextId('demo-run');
  const approved = demoDesignsForJob(jobId).find((design) => design.status === 'approved');

  const tasks: ProductionTask[] = stages.map((stage, index) => ({
    id: nextId('demo-task'),
    runId,
    jobId,
    stageId: stage.id,
    stageName: stage.name,
    department: stage.department,
    position: index,
    status: index === 0 ? 'ready' : 'pending',
    assignedToId: null,
    assignedToName: null,
    startedAt: null,
    completedAt: null,
    createdAt: now,
    createdBy: actor.uid,
    updatedAt: now,
    updatedBy: actor.uid,
  }));

  const run: ProductionRun = {
    id: runId,
    jobId,
    jobNumber: job.jobNumber,
    jobTitle: job.title,
    customerId: job.customerId,
    customerName: job.customerName,
    status: 'in-progress',
    approvedDesignId: approved?.id ?? null,
    approvedDesignVersion: approved?.version ?? null,
    startedAt: now,
    startedById: actor.uid,
    startedByName: actor.name,
    completedAt: null,
    tasks,
    createdAt: now,
    createdBy: actor.uid,
    updatedAt: now,
    updatedBy: actor.uid,
  };

  productionRuns = [run, ...productionRuns];
  recordDemoProductionEvent({
    runId,
    taskId: null,
    jobId,
    action: 'run-started',
    at: now,
    byId: actor.uid,
    byName: actor.name,
  });
  updateDemoJob(jobId, { status: 'in-progress', updatedBy: actor.uid });
  return run;
}

function syncDemoJobStatus(jobId: Id, actorId: Id): void {
  const tasks = productionRuns.find((run) => run.jobId === jobId)?.tasks ?? [];
  if (tasks.length === 0) return;

  const job = demoJob(jobId);
  if (!job || job.status === 'delivered' || job.status === 'cancelled') return;

  const settled = tasks.filter((task) => isSettled(task.status)).length;
  const next: JobStatus =
    settled === tasks.length
      ? 'ready'
      : tasks.some((task) => task.status === 'on-hold')
        ? 'on-hold'
        : 'in-progress';

  if (next !== job.status) updateDemoJob(jobId, { status: next, updatedBy: actorId });
}

/**
 * Moves a demo stage along, unlocking the next one exactly as the database does.
 *
 * The transition table and the reason requirement are checked here too, so the
 * demo refuses the same moves the real system refuses - a demo that allows what
 * production forbids teaches the wrong thing.
 */
export function advanceDemoTask(
  task: ProductionTask,
  toStatus: ProductionStatus,
  reason: string | undefined,
  actor: { uid: Id; name: string },
): ProductionTask {
  const run = productionRuns.find((candidate) => candidate.id === task.runId);
  if (!run) throw new AppError('not-found', 'That stage is not available.');

  const current = run.tasks.find((candidate) => candidate.id === task.id);
  if (!current) throw new AppError('not-found', 'That stage is not available.');

  if (!canTransition(current.status, toStatus)) {
    throw new AppError(
      'conflict',
      `A stage that is ${current.status.replace(/-/g, ' ')} cannot become ${toStatus.replace(/-/g, ' ')}.`,
    );
  }

  const trimmed = reason?.trim();
  if (requiresReason(toStatus) && !trimmed) {
    throw new AppError(
      'invalid-input',
      toStatus === 'on-hold'
        ? 'Say why this stage is being put on hold.'
        : 'Say why this stage is being skipped.',
    );
  }

  if (toStatus === 'in-progress' && current.status === 'ready') {
    const blocked = run.tasks.some(
      (other) => other.position < current.position && !isSettled(other.status),
    );
    if (blocked) {
      throw new AppError('conflict', 'An earlier stage is still open. Finish that one first.');
    }
  }

  const now = new Date();
  const updated: ProductionTask = {
    ...current,
    status: toStatus,
    startedAt: toStatus === 'in-progress' ? (current.startedAt ?? now) : current.startedAt,
    completedAt: isSettled(toStatus) ? now : current.completedAt,
    ...(toStatus === 'on-hold' ? { holdReason: trimmed } : {}),
    ...(toStatus === 'skipped' ? { skipReason: trimmed } : {}),
    updatedAt: now,
    updatedBy: actor.uid,
  };

  let tasks = run.tasks.map((candidate) => (candidate.id === updated.id ? updated : candidate));

  recordDemoProductionEvent({
    runId: run.id,
    taskId: updated.id,
    jobId: run.jobId,
    action:
      toStatus === 'in-progress'
        ? current.status === 'on-hold'
          ? 'stage-resumed'
          : 'stage-started'
        : toStatus === 'on-hold'
          ? 'stage-held'
          : toStatus === 'completed'
            ? 'stage-completed'
            : 'stage-skipped',
    stageName: updated.stageName,
    fromStatus: current.status,
    toStatus,
    ...(trimmed ? { reason: trimmed } : {}),
    at: now,
    byId: actor.uid,
    byName: actor.name,
  });

  if (isSettled(toStatus)) {
    const next = [...tasks]
      .sort((a, b) => a.position - b.position)
      .find((candidate) => candidate.status === 'pending');
    if (next) {
      tasks = tasks.map((candidate) =>
        candidate.id === next.id ? { ...candidate, status: 'ready' as const } : candidate,
      );
      recordDemoProductionEvent({
        runId: run.id,
        taskId: next.id,
        jobId: run.jobId,
        action: 'stage-unlocked',
        stageName: next.stageName,
        fromStatus: 'pending',
        toStatus: 'ready',
        at: now,
        byId: actor.uid,
        byName: actor.name,
      });
    }
  }

  const allSettled = tasks.every((candidate) => isSettled(candidate.status));
  productionRuns = productionRuns.map((candidate) =>
    candidate.id === run.id
      ? {
          ...candidate,
          tasks,
          status: allSettled
            ? ('completed' as const)
            : tasks.some((entry) => entry.status === 'on-hold')
              ? ('on-hold' as const)
              : ('in-progress' as const),
          completedAt: allSettled ? now : candidate.completedAt,
          updatedAt: now,
          updatedBy: actor.uid,
        }
      : candidate,
  );

  if (allSettled) {
    recordDemoProductionEvent({
      runId: run.id,
      taskId: null,
      jobId: run.jobId,
      action: 'run-completed',
      at: now,
      byId: actor.uid,
      byName: actor.name,
    });
  }

  syncDemoJobStatus(run.jobId, actor.uid);
  return updated;
}

export function assignDemoTask(
  task: ProductionTask,
  assignee: { id: Id; name: string } | null,
  actor: { uid: Id; name: string },
): ProductionTask {
  // Same rule the database applies: work cannot be handed to somebody who no
  // longer works here.
  if (assignee) {
    const employee = employees.find((candidate) => candidate.id === assignee.id);
    if (!employee?.isActive) {
      throw new AppError(
        'invalid-input',
        'That employee is not active, so work cannot be assigned to them.',
      );
    }
  }

  const now = new Date();
  let updated: ProductionTask = { ...task };

  productionRuns = productionRuns.map((run) =>
    run.id !== task.runId
      ? run
      : {
          ...run,
          tasks: run.tasks.map((candidate) => {
            if (candidate.id !== task.id) return candidate;
            updated = {
              ...candidate,
              assignedToId: assignee?.id ?? null,
              assignedToName: assignee?.name ?? null,
              updatedAt: now,
              updatedBy: actor.uid,
            };
            return updated;
          }),
        },
  );

  // The history says what changed, not just that something did - a
  // reassignment has to record who the work was taken from.
  const note = !assignee
    ? `Unassigned from ${task.assignedToName ?? 'nobody'}`
    : !task.assignedToName
      ? `Assigned to ${assignee.name}`
      : task.assignedToId === assignee.id
        ? `Still assigned to ${assignee.name}`
        : `Reassigned from ${task.assignedToName} to ${assignee.name}`;

  recordDemoProductionEvent({
    runId: task.runId,
    taskId: task.id,
    jobId: task.jobId,
    action: 'stage-assigned',
    stageName: task.stageName,
    reason: note,
    at: now,
    byId: actor.uid,
    byName: actor.name,
  });

  return updated;
}
