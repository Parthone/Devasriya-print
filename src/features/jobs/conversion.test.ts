import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  addDemoEnquiry,
  demoEnquiry,
  demoJob,
  resetDemoStore,
  updateDemoEnquiry,
} from '@/features/demo/demo-store';
import type { Enquiry } from '@/features/enquiries/types';
import { convertEnquiryToJob } from '@/features/jobs/services/conversion.service';
import { createJob } from '@/features/jobs/services/job.service';
import { EMPTY_PICKUP } from '@/features/locations/types';
import type { AudioAttachment } from '@/types/attachments';
import { AppError } from '@/types/common';

/**
 * Conversion behaviour, exercised through the in-memory demo backend.
 *
 * The same code path runs against PostgreSQL in a transaction; the integration
 * suite covers that side, including two people converting at once.
 */
const NOW = new Date('2026-08-24T10:00:00.000Z');
const ACTOR = { uid: 'uid-sales', name: 'Anita Verma' };

const AUDIO: AudioAttachment = {
  id: 'attachment-1',
  storagePath: 'e1/attachment-1.webm',
  mimeType: 'audio/webm;codecs=opus',
  durationSeconds: 42,
  sizeBytes: 12345,
  recordedAt: NOW,
  uploadedById: 'uid-sales',
  source: 'staff',
};

function seedEnquiry(overrides: Partial<Enquiry> = {}): Enquiry {
  return addDemoEnquiry({
    enquiryNumber: 'ENQ-2627-0009',
    customerId: 'c1',
    customerName: 'Ravi Kumar',
    customerMobile: '9812300011',
    enquiryDate: NOW,
    source: 'walk-in',
    requirementText: 'Wedding cards, 250 pieces, gold foil',
    requirementAudio: AUDIO,
    assignedToId: null,
    assignedToName: null,
    nextFollowUpAt: null,
    followUps: [],
    status: 'follow-up',
    convertedJobId: null,
    convertedAt: null,
    createdAt: NOW,
    createdBy: 'uid-owner',
    updatedAt: NOW,
    updatedBy: 'uid-owner',
    ...overrides,
  });
}

const PICKUP = {
  pickupLocationId: 'loc-1',
  pickupLocationName: 'Main Press, Station Road',
  contactPersonId: null,
  contactPersonName: 'Anita Verma',
  contactPersonMobile: '9000000002',
};

beforeEach(() => {
  vi.stubEnv('VITE_DEMO_MODE', 'true');
  resetDemoStore();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('converting an enquiry to a job', () => {
  it('copies the customer, requirement and pickup snapshots', async () => {
    const enquiry = seedEnquiry();

    const job = await convertEnquiryToJob({
      enquiry,
      title: 'Wedding cards for Ravi',
      jobDate: NOW,
      priority: 'urgent',
      expectedDeliveryDate: new Date('2026-09-05'),
      pickup: PICKUP,
      actor: ACTOR,
    });

    expect(job.jobNumber).toMatch(/^JOB-\d{4}-\d{4}$/);
    expect(job.customerId).toBe('c1');
    expect(job.customerName).toBe('Ravi Kumar');
    expect(job.customerMobile).toBe('9812300011');
    expect(job.requirementText).toBe(enquiry.requirementText);
    expect(job.enquiryId).toBe(enquiry.id);
    expect(job.enquiryNumber).toBe('ENQ-2627-0009');
    expect(job.priority).toBe('urgent');
    expect(job.status).toBe('open');
    expect(job.pickupLocationName).toBe('Main Press, Station Road');
    expect(job.contactPersonName).toBe('Anita Verma');
    expect(job.contactPersonMobile).toBe('9000000002');
    expect(job.assignedToId).toBeNull();
  });

  it('copies the recording to a job owned path, keeping its details', async () => {
    const enquiry = seedEnquiry();

    const job = await convertEnquiryToJob({
      enquiry,
      title: 'Wedding cards',
      jobDate: NOW,
      priority: 'normal',
      expectedDeliveryDate: null,
      actor: ACTOR,
    });

    const copy = job.requirementAudio;
    expect(copy).not.toBeNull();
    // A copy of its own, so playing it only needs jobs:view.
    expect(copy?.id).not.toBe(AUDIO.id);
    expect(copy?.storagePath).not.toBe(AUDIO.storagePath);
    // The copy sits under the new job's id, in the job bucket. Enquiry audio
    // and job audio are separate buckets, which is what stops sight of a job
    // granting sight of the enquiry it came from.
    expect(copy?.storagePath.startsWith(`${job.id}/`)).toBe(true);
    // Same recording: format, length, size, when it was made and by whom.
    expect(copy?.mimeType).toBe(AUDIO.mimeType);
    expect(copy?.durationSeconds).toBe(AUDIO.durationSeconds);
    expect(copy?.sizeBytes).toBe(AUDIO.sizeBytes);
    expect(copy?.recordedAt).toEqual(AUDIO.recordedAt);
    expect(copy?.uploadedById).toBe(AUDIO.uploadedById);
    expect(copy?.source).toBe(AUDIO.source);
  });

  it('leaves the enquiry recording untouched', async () => {
    const enquiry = seedEnquiry();

    await convertEnquiryToJob({
      enquiry,
      title: 'Wedding cards',
      jobDate: NOW,
      priority: 'normal',
      expectedDeliveryDate: null,
      actor: ACTOR,
    });

    expect(demoEnquiry(enquiry.id)?.requirementAudio).toEqual(AUDIO);
  });

  it('keeps the job recording when the enquiry recording is replaced later', async () => {
    const enquiry = seedEnquiry();

    const job = await convertEnquiryToJob({
      enquiry,
      title: 'Wedding cards',
      jobDate: NOW,
      priority: 'normal',
      expectedDeliveryDate: null,
      actor: ACTOR,
    });
    const jobAudio = job.requirementAudio;

    // The enquiry gets a new recording afterwards.
    const replacement: AudioAttachment = {
      ...AUDIO,
      id: 'attachment-2',
      storagePath: 'e1/attachment-2.webm',
      durationSeconds: 90,
    };
    updateDemoEnquiry(enquiry.id, { requirementAudio: replacement });

    expect(demoEnquiry(enquiry.id)?.requirementAudio?.id).toBe('attachment-2');
    // The job still points at its own copy, unchanged.
    expect(demoJob(job.id)?.requirementAudio).toEqual(jobAudio);
    expect(demoJob(job.id)?.requirementAudio?.durationSeconds).toBe(42);
  });

  it('marks the enquiry converted and links it to the job', async () => {
    const enquiry = seedEnquiry();

    const job = await convertEnquiryToJob({
      enquiry,
      title: 'Wedding cards',
      jobDate: NOW,
      priority: 'normal',
      expectedDeliveryDate: null,
      actor: ACTOR,
    });

    const updated = demoEnquiry(enquiry.id);
    expect(updated?.status).toBe('converted');
    expect(updated?.convertedJobId).toBe(job.id);
    expect(updated?.convertedAt).toBeInstanceOf(Date);
  });

  it('refuses to convert the same enquiry twice', async () => {
    const enquiry = seedEnquiry();

    await convertEnquiryToJob({
      enquiry,
      title: 'First job',
      jobDate: NOW,
      priority: 'normal',
      expectedDeliveryDate: null,
      actor: ACTOR,
    });

    // Re-read: the caller now holds a converted enquiry.
    const converted = demoEnquiry(enquiry.id);
    expect(converted).not.toBeNull();
    await expect(
      convertEnquiryToJob({
        enquiry: converted!,
        title: 'Second job',
        jobDate: NOW,
        priority: 'normal',
        expectedDeliveryDate: null,
        actor: ACTOR,
      }),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('refuses a stale copy of an enquiry that was converted meanwhile', async () => {
    const enquiry = seedEnquiry();

    await convertEnquiryToJob({
      enquiry,
      title: 'First job',
      jobDate: NOW,
      priority: 'normal',
      expectedDeliveryDate: null,
      actor: ACTOR,
    });

    // `enquiry` is the copy taken before conversion - it still looks unconverted.
    await expect(
      convertEnquiryToJob({
        enquiry,
        title: 'Duplicate job',
        jobDate: NOW,
        priority: 'normal',
        expectedDeliveryDate: null,
        actor: ACTOR,
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});

describe('direct jobs', () => {
  it('creates a job with no enquiry behind it', async () => {
    const job = await createJob({
      id: 'ignored-in-demo',
      input: {
        customerId: 'c4',
        jobDate: NOW,
        title: 'Festival box labels',
        requirementText: 'Repeat order, same artwork',
        priority: 'normal',
        expectedDeliveryDate: null,
        status: 'open',
        ...EMPTY_PICKUP,
      },
      customer: { id: 'c4', name: 'Gupta Sweets', mobile: '9414300044' },
      audio: null,
      actor: ACTOR,
    });

    expect(job.enquiryId).toBeNull();
    expect(job.enquiryNumber).toBeNull();
    expect(job.jobNumber).toMatch(/^JOB-\d{4}-\d{4}$/);
    expect(job.customerName).toBe('Gupta Sweets');
  });
});
