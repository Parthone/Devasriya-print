import { describe, expect, it } from 'vitest';

import type { Customer } from '@/features/customers/types';
import { buildRecentUpdates } from '@/features/dashboard/services/recent-updates';
import type { Enquiry } from '@/features/enquiries/types';
import type { Job } from '@/features/jobs/types';

const at = (iso: string) => new Date(iso);
const CREATED = at('2026-08-20T10:00:00.000Z');

function customer(overrides: Partial<Customer> & { id: string }): Customer {
  return {
    name: 'Ravi Kumar',
    nameLower: 'ravi kumar',
    type: 'individual',
    mobile: '9812300011',
    address: '12 Station Road',
    city: 'Jaipur',
    state: 'Rajasthan',
    pincode: '302001',
    preferredLanguage: 'hi',
    isArchived: false,
    portalUserId: null,
    createdAt: CREATED,
    createdBy: 'uid-owner',
    updatedAt: CREATED,
    updatedBy: 'uid-owner',
    ...overrides,
  };
}

function enquiry(overrides: Partial<Enquiry> & { id: string }): Enquiry {
  return {
    enquiryNumber: 'ENQ-2627-0001',
    customerId: 'c1',
    customerName: 'Ravi Kumar',
    customerMobile: '9812300011',
    enquiryDate: CREATED,
    source: 'walk-in',
    requirementText: 'Wedding cards',
    requirementAudio: null,
    assignedToId: null,
    assignedToName: null,
    nextFollowUpAt: null,
    followUps: [],
    status: 'new',
    convertedJobId: null,
    convertedAt: null,
    createdAt: CREATED,
    createdBy: 'uid-owner',
    updatedAt: CREATED,
    updatedBy: 'uid-owner',
    ...overrides,
  };
}

function job(overrides: Partial<Job> & { id: string }): Job {
  return {
    jobNumber: 'JOB-2627-0001',
    customerId: 'c1',
    customerName: 'Ravi Kumar',
    customerMobile: '9812300011',
    enquiryId: null,
    enquiryNumber: null,
    jobDate: CREATED,
    title: 'Wedding cards',
    requirementText: 'Gold foil',
    requirementAudio: null,
    priority: 'normal',
    expectedDeliveryDate: null,
    pickupLocationId: null,
    pickupLocationName: null,
    contactPersonId: null,
    contactPersonName: null,
    contactPersonMobile: null,
    assignedToId: null,
    assignedToName: null,
    status: 'open',
    createdAt: CREATED,
    createdBy: 'uid-owner',
    updatedAt: CREATED,
    updatedBy: 'uid-owner',
    ...overrides,
  };
}

describe('recent updates', () => {
  it('reads a freshly created record as created, not updated', () => {
    // createdAt and updatedAt are written together, milliseconds apart.
    const updates = buildRecentUpdates(
      [customer({ id: 'c1', updatedAt: at('2026-08-20T10:00:00.400Z') })],
      [],
      [],
    );

    expect(updates[0]?.kind).toBe('customer-created');
    expect(updates[0]?.at).toEqual(CREATED);
  });

  it('reads a later edit as an update', () => {
    const updates = buildRecentUpdates(
      [customer({ id: 'c1', updatedAt: at('2026-08-22T09:00:00.000Z') })],
      [],
      [],
    );

    expect(updates[0]?.kind).toBe('customer-updated');
    expect(updates[0]?.at).toEqual(at('2026-08-22T09:00:00.000Z'));
  });

  it('calls an enquiry converted only when conversion is the newest event', () => {
    const converted = buildRecentUpdates(
      [],
      [
        enquiry({
          id: 'e1',
          status: 'converted',
          convertedJobId: 'j1',
          convertedAt: at('2026-08-21T10:00:00.000Z'),
          updatedAt: at('2026-08-21T10:00:00.000Z'),
        }),
      ],
      [],
    );
    expect(converted[0]?.kind).toBe('enquiry-converted');

    const editedAfterwards = buildRecentUpdates(
      [],
      [
        enquiry({
          id: 'e1',
          status: 'converted',
          convertedJobId: 'j1',
          convertedAt: at('2026-08-21T10:00:00.000Z'),
          updatedAt: at('2026-08-23T15:00:00.000Z'),
        }),
      ],
      [],
    );
    expect(editedAfterwards[0]?.kind).toBe('enquiry-updated');
    expect(editedAfterwards[0]?.at).toEqual(at('2026-08-23T15:00:00.000Z'));
  });

  it('never labels an enquiry converted just because it has a job id', () => {
    const updates = buildRecentUpdates(
      [],
      [
        enquiry({
          id: 'e1',
          status: 'converted',
          convertedJobId: 'j1',
          convertedAt: at('2026-08-21T10:00:00.000Z'),
          updatedAt: at('2026-08-24T09:00:00.000Z'),
        }),
      ],
      [],
    );

    expect(updates[0]?.kind).not.toBe('enquiry-converted');
  });

  it('puts the newest entry first and caps the list', () => {
    const updates = buildRecentUpdates(
      [
        customer({
          id: 'c1',
          createdAt: at('2026-08-19T10:00:00.000Z'),
          updatedAt: at('2026-08-19T10:00:00.000Z'),
        }),
      ],
      [
        enquiry({
          id: 'e1',
          createdAt: at('2026-08-23T10:00:00.000Z'),
          updatedAt: at('2026-08-23T10:00:00.000Z'),
        }),
      ],
      [
        job({
          id: 'j1',
          createdAt: at('2026-08-21T10:00:00.000Z'),
          updatedAt: at('2026-08-21T10:00:00.000Z'),
        }),
      ],
      2,
    );

    expect(updates).toHaveLength(2);
    expect(updates[0]?.kind).toBe('enquiry-created');
    expect(updates[1]?.kind).toBe('job-created');
  });

  it('gives every entry somewhere to go and something to read', () => {
    const updates = buildRecentUpdates(
      [customer({ id: 'c1', businessName: 'Kumar Prints' })],
      [enquiry({ id: 'e1' })],
      [job({ id: 'j1' })],
    );

    for (const update of updates) {
      expect(update.title.length).toBeGreaterThan(0);
      expect(update.href).toMatch(/^\/(customers|enquiries|jobs)\//);
    }
  });

  it('returns nothing when there is nothing', () => {
    expect(buildRecentUpdates([], [], [])).toEqual([]);
  });
});
