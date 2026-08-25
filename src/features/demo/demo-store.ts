import {
  DEMO_AUDIT_EVENTS,
  DEMO_CUSTOMERS,
  DEMO_EMPLOYEES,
  DEMO_OWNER_UID,
} from '@/features/demo/demo-data';
import type { AuditEvent } from '@/features/audit/types';
import type { Customer, CustomerInput } from '@/features/customers/types';
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

function nextId(prefix: string): Id {
  sequence += 1;
  return `${prefix}-${String(sequence)}`;
}

/** Resets everything to the seed data. Used by tests. */
export function resetDemoStore(): void {
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
