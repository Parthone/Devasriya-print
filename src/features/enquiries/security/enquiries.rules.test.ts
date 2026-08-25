import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

import { USER_ROLES, type UserRole } from '@/types/auth';

/**
 * Security rules for enquiries, jobs, pickup offices and number counters.
 *
 * The matrix these mirror: every role except accounts may view enquiries; only
 * owner, admin and sales may create or edit them. Every role may view jobs;
 * owner, admin and sales create them; production may edit them; only owner and
 * admin may assign them. Nothing may be deleted.
 */
let testEnv: RulesTestEnvironment;

const NOW = new Date('2026-08-24T10:00:00.000Z');
const ENQUIRY_ID = 'enquiry-1';
const CONVERTED_ID = 'enquiry-2';
const JOB_ID = 'job-1';

const UID: Record<UserRole, string> = {
  owner: 'uid-owner',
  admin: 'uid-admin',
  sales: 'uid-sales',
  designer: 'uid-designer',
  production: 'uid-production',
  accounts: 'uid-accounts',
  viewer: 'uid-viewer',
};

function staffProfile(role: UserRole) {
  return {
    name: `${role} user`,
    email: `${role}@devasriya.test`,
    mobile: '9876500001',
    designation: 'manager',
    department: 'management',
    role,
    isActive: true,
    createdAt: NOW,
    createdBy: 'uid-owner',
    updatedAt: NOW,
    updatedBy: 'uid-owner',
  };
}

function enquiryDoc(actor: string, overrides: Record<string, unknown> = {}) {
  return {
    enquiryNumber: 'ENQ-2627-0001',
    customerId: 'customer-1',
    customerName: 'Ravi Kumar',
    customerMobile: '9812300011',
    enquiryDate: NOW,
    source: 'walk-in',
    requirementText: 'Wedding cards, 250 pieces',
    requirementAudio: null,
    assignedToId: null,
    assignedToName: null,
    nextFollowUpAt: null,
    followUps: [],
    status: 'new',
    convertedJobId: null,
    convertedAt: null,
    createdAt: NOW,
    createdBy: actor,
    updatedAt: NOW,
    updatedBy: actor,
    ...overrides,
  };
}

function jobDoc(actor: string, overrides: Record<string, unknown> = {}) {
  return {
    jobNumber: 'JOB-2627-0001',
    customerId: 'customer-1',
    customerName: 'Ravi Kumar',
    customerMobile: '9812300011',
    enquiryId: null,
    enquiryNumber: null,
    jobDate: NOW,
    title: 'Wedding cards',
    requirementText: 'Wedding cards, 250 pieces',
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
    createdAt: NOW,
    createdBy: actor,
    updatedAt: NOW,
    updatedBy: actor,
    ...overrides,
  };
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-devasriya-module4-rules',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const role of USER_ROLES) {
      await setDoc(doc(db, 'users', UID[role]), staffProfile(role));
    }
    await setDoc(doc(db, 'enquiries', ENQUIRY_ID), enquiryDoc(UID.owner));
    await setDoc(
      doc(db, 'enquiries', CONVERTED_ID),
      enquiryDoc(UID.owner, {
        enquiryNumber: 'ENQ-2627-0002',
        status: 'converted',
        convertedJobId: JOB_ID,
        convertedAt: NOW,
      }),
    );
    await setDoc(doc(db, 'jobs', JOB_ID), jobDoc(UID.owner));
    await setDoc(doc(db, 'counters', 'enquiries-2627'), { value: 5 });
    await setDoc(doc(db, 'counters', 'jobs-2627'), { value: 3 });
  });
});

describe('reading enquiries', () => {
  const canView: UserRole[] = ['owner', 'admin', 'sales', 'designer', 'production', 'viewer'];

  it.each(canView)('lets %s read and list enquiries', async (role) => {
    const db = testEnv.authenticatedContext(UID[role]).firestore();
    await assertSucceeds(getDoc(doc(db, 'enquiries', ENQUIRY_ID)));
    await assertSucceeds(getDocs(collection(db, 'enquiries')));
  });

  it('denies accounts, which has no enquiries:view', async () => {
    const db = testEnv.authenticatedContext(UID.accounts).firestore();
    await assertFails(getDoc(doc(db, 'enquiries', ENQUIRY_ID)));
    await assertFails(getDocs(collection(db, 'enquiries')));
  });

  it('denies signed-out and deactivated users', async () => {
    await assertFails(
      getDocs(collection(testEnv.unauthenticatedContext().firestore(), 'enquiries')),
    );

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', UID.sales), {
        ...staffProfile('sales'),
        isActive: false,
      });
    });
    const db = testEnv.authenticatedContext(UID.sales).firestore();
    await assertFails(getDocs(collection(db, 'enquiries')));
  });
});

describe('writing enquiries', () => {
  const canWrite: UserRole[] = ['owner', 'admin', 'sales'];
  const cannotWrite: UserRole[] = ['designer', 'production', 'accounts', 'viewer'];

  it.each(canWrite)('lets %s create an enquiry', async (role) => {
    const db = testEnv.authenticatedContext(UID[role]).firestore();
    await assertSucceeds(setDoc(doc(db, 'enquiries', `new-${role}`), enquiryDoc(UID[role])));
  });

  it.each(cannotWrite)('stops %s creating an enquiry', async (role) => {
    const db = testEnv.authenticatedContext(UID[role]).firestore();
    await assertFails(setDoc(doc(db, 'enquiries', `new-${role}`), enquiryDoc(UID[role])));
  });

  it('rejects an enquiry with a bad number, unknown status or extra fields', async () => {
    const db = testEnv.authenticatedContext(UID.sales).firestore();
    await assertFails(
      setDoc(doc(db, 'enquiries', 'bad-1'), enquiryDoc(UID.sales, { enquiryNumber: 'ENQ-1' })),
    );
    await assertFails(
      setDoc(doc(db, 'enquiries', 'bad-2'), enquiryDoc(UID.sales, { status: 'invented' })),
    );
    await assertFails(
      setDoc(doc(db, 'enquiries', 'bad-3'), enquiryDoc(UID.sales, { quotedAmount: 5000 })),
    );
  });

  it('refuses an enquiry that is born converted', async () => {
    const db = testEnv.authenticatedContext(UID.sales).firestore();
    await assertFails(
      setDoc(
        doc(db, 'enquiries', 'bad-4'),
        enquiryDoc(UID.sales, { status: 'converted', convertedJobId: 'job-x' }),
      ),
    );
  });

  it('lets an editor update the requirement and follow-ups', async () => {
    const db = testEnv.authenticatedContext(UID.sales).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'enquiries', ENQUIRY_ID), {
        requirementText: 'Wedding cards, 300 pieces',
        status: 'follow-up',
        updatedBy: UID.sales,
      }),
    );
  });

  it('keeps the enquiry number and creation audit immutable', async () => {
    const db = testEnv.authenticatedContext(UID.sales).firestore();
    await assertFails(
      updateDoc(doc(db, 'enquiries', ENQUIRY_ID), {
        enquiryNumber: 'ENQ-2627-9999',
        updatedBy: UID.sales,
      }),
    );
    await assertFails(
      updateDoc(doc(db, 'enquiries', ENQUIRY_ID), { createdBy: UID.sales, updatedBy: UID.sales }),
    );
  });

  it('requires the edit to be attributed to the person making it', async () => {
    const db = testEnv.authenticatedContext(UID.sales).firestore();
    await assertFails(
      updateDoc(doc(db, 'enquiries', ENQUIRY_ID), { notes: 'x', updatedBy: UID.owner }),
    );
  });

  it('never allows an enquiry to be deleted', async () => {
    for (const role of USER_ROLES) {
      const db = testEnv.authenticatedContext(UID[role]).firestore();
      await assertFails(deleteDoc(doc(db, 'enquiries', ENQUIRY_ID)));
    }
  });
});

describe('conversion rules', () => {
  it('lets somebody who may create jobs mark an enquiry converted', async () => {
    const db = testEnv.authenticatedContext(UID.sales).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'enquiries', ENQUIRY_ID), {
        status: 'converted',
        convertedJobId: 'job-new',
        convertedAt: NOW,
        updatedBy: UID.sales,
      }),
    );
  });

  it('refuses conversion by somebody who cannot create jobs', async () => {
    const db = testEnv.authenticatedContext(UID.production).firestore();
    await assertFails(
      updateDoc(doc(db, 'enquiries', ENQUIRY_ID), {
        status: 'converted',
        convertedJobId: 'job-new',
        updatedBy: UID.production,
      }),
    );
  });

  it('refuses a second conversion of the same enquiry', async () => {
    const db = testEnv.authenticatedContext(UID.sales).firestore();
    await assertFails(
      updateDoc(doc(db, 'enquiries', CONVERTED_ID), {
        convertedJobId: 'job-other',
        updatedBy: UID.sales,
      }),
    );
  });

  it('refuses to move a converted enquiry back to any other status', async () => {
    const db = testEnv.authenticatedContext(UID.sales).firestore();
    await assertFails(
      updateDoc(doc(db, 'enquiries', CONVERTED_ID), { status: 'lost', updatedBy: UID.sales }),
    );
    await assertFails(
      updateDoc(doc(db, 'enquiries', CONVERTED_ID), {
        convertedJobId: null,
        status: 'new',
        updatedBy: UID.sales,
      }),
    );
  });

  it('still allows follow-ups on a converted enquiry', async () => {
    const db = testEnv.authenticatedContext(UID.sales).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'enquiries', CONVERTED_ID), {
        followUps: [{ at: NOW, byId: UID.sales, byName: 'Sales', note: 'Customer called' }],
        updatedBy: UID.sales,
      }),
    );
  });
});

describe('jobs', () => {
  const canCreate: UserRole[] = ['owner', 'admin', 'sales'];
  const canEdit: UserRole[] = ['owner', 'admin', 'sales', 'production'];
  const cannotEdit: UserRole[] = ['designer', 'accounts', 'viewer'];

  it.each(USER_ROLES)('lets %s read jobs', async (role) => {
    const db = testEnv.authenticatedContext(UID[role]).firestore();
    await assertSucceeds(getDoc(doc(db, 'jobs', JOB_ID)));
    await assertSucceeds(getDocs(collection(db, 'jobs')));
  });

  it.each(canCreate)('lets %s create a job', async (role) => {
    const db = testEnv.authenticatedContext(UID[role]).firestore();
    await assertSucceeds(setDoc(doc(db, 'jobs', `new-${role}`), jobDoc(UID[role])));
  });

  it.each(['designer', 'production', 'accounts', 'viewer'] as UserRole[])(
    'stops %s creating a job',
    async (role) => {
      const db = testEnv.authenticatedContext(UID[role]).firestore();
      await assertFails(setDoc(doc(db, 'jobs', `new-${role}`), jobDoc(UID[role])));
    },
  );

  it('refuses a job that arrives already assigned', async () => {
    const db = testEnv.authenticatedContext(UID.sales).firestore();
    await assertFails(
      setDoc(
        doc(db, 'jobs', 'new-assigned'),
        jobDoc(UID.sales, { assignedToId: UID.designer, assignedToName: 'Designer' }),
      ),
    );
  });

  it.each(canEdit)('lets %s edit a job', async (role) => {
    const db = testEnv.authenticatedContext(UID[role]).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'jobs', JOB_ID), { status: 'in-progress', updatedBy: UID[role] }),
    );
  });

  it.each(cannotEdit)('stops %s editing a job', async (role) => {
    const db = testEnv.authenticatedContext(UID[role]).firestore();
    await assertFails(
      updateDoc(doc(db, 'jobs', JOB_ID), { status: 'in-progress', updatedBy: UID[role] }),
    );
  });

  it('keeps the job number, enquiry link and creation audit immutable', async () => {
    const db = testEnv.authenticatedContext(UID.sales).firestore();
    await assertFails(
      updateDoc(doc(db, 'jobs', JOB_ID), { jobNumber: 'JOB-2627-9999', updatedBy: UID.sales }),
    );
    await assertFails(
      updateDoc(doc(db, 'jobs', JOB_ID), { enquiryId: 'enquiry-x', updatedBy: UID.sales }),
    );
    await assertFails(
      updateDoc(doc(db, 'jobs', JOB_ID), { createdAt: new Date(), updatedBy: UID.sales }),
    );
  });

  it('never allows a job to be deleted', async () => {
    for (const role of USER_ROLES) {
      const db = testEnv.authenticatedContext(UID[role]).firestore();
      await assertFails(deleteDoc(doc(db, 'jobs', JOB_ID)));
    }
  });
});

describe('job assignment', () => {
  it('lets only owner and admin change who a job is assigned to', async () => {
    for (const role of ['owner', 'admin'] as UserRole[]) {
      const db = testEnv.authenticatedContext(UID[role]).firestore();
      await assertSucceeds(
        updateDoc(doc(db, 'jobs', JOB_ID), {
          assignedToId: UID.designer,
          assignedToName: 'Designer',
          updatedBy: UID[role],
        }),
      );
    }

    for (const role of ['sales', 'production'] as UserRole[]) {
      const db = testEnv.authenticatedContext(UID[role]).firestore();
      await assertFails(
        updateDoc(doc(db, 'jobs', JOB_ID), {
          assignedToId: UID[role],
          assignedToName: 'Someone',
          updatedBy: UID[role],
        }),
      );
    }
  });
});

describe('number counters', () => {
  it('lets somebody who may create enquiries step the counter up by one', async () => {
    const db = testEnv.authenticatedContext(UID.sales).firestore();
    await assertSucceeds(updateDoc(doc(db, 'counters', 'enquiries-2627'), { value: 6 }));
  });

  it('refuses any jump other than plus one', async () => {
    const db = testEnv.authenticatedContext(UID.sales).firestore();
    await assertFails(updateDoc(doc(db, 'counters', 'enquiries-2627'), { value: 7 }));
    await assertFails(updateDoc(doc(db, 'counters', 'enquiries-2627'), { value: 100 }));
  });

  it('refuses to reset or lower a counter', async () => {
    const db = testEnv.authenticatedContext(UID.owner).firestore();
    await assertFails(updateDoc(doc(db, 'counters', 'enquiries-2627'), { value: 1 }));
    await assertFails(updateDoc(doc(db, 'counters', 'enquiries-2627'), { value: 0 }));
    await assertFails(setDoc(doc(db, 'counters', 'enquiries-2627'), { value: 1 }));
  });

  it('refuses extra fields on a counter', async () => {
    const db = testEnv.authenticatedContext(UID.owner).firestore();
    await assertFails(
      updateDoc(doc(db, 'counters', 'enquiries-2627'), { value: 6, tampered: true }),
    );
  });

  it('matches the counter to the permission it belongs to', async () => {
    const production = testEnv.authenticatedContext(UID.production).firestore();
    await assertFails(updateDoc(doc(production, 'counters', 'jobs-2627'), { value: 4 }));
    await assertFails(updateDoc(doc(production, 'counters', 'enquiries-2627'), { value: 6 }));

    const sales = testEnv.authenticatedContext(UID.sales).firestore();
    await assertSucceeds(updateDoc(doc(sales, 'counters', 'jobs-2627'), { value: 4 }));
  });

  it('refuses counters with an invented name', async () => {
    const db = testEnv.authenticatedContext(UID.owner).firestore();
    await assertFails(setDoc(doc(db, 'counters', 'invoices-2627'), { value: 1 }));
    await assertFails(setDoc(doc(db, 'counters', 'enquiries-99999'), { value: 1 }));
  });

  it('never lets a client list or delete counters', async () => {
    const db = testEnv.authenticatedContext(UID.owner).firestore();
    await assertFails(getDocs(collection(db, 'counters')));
    await assertFails(deleteDoc(doc(db, 'counters', 'enquiries-2627')));
  });
});

describe('pickup offices', () => {
  function officeDoc(actor: string, overrides: Record<string, unknown> = {}) {
    return {
      name: 'Main Press',
      address: '14 Station Road, Jaipur',
      contactUserId: null,
      contactName: 'Anita',
      contactMobile: '9000000002',
      isActive: true,
      createdAt: NOW,
      createdBy: actor,
      updatedAt: NOW,
      updatedBy: actor,
      ...overrides,
    };
  }

  it.each(USER_ROLES)('lets %s read the offices, because anyone may need one', async (role) => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'locations', 'loc-1'), officeDoc(UID.owner));
    });

    const db = testEnv.authenticatedContext(UID[role]).firestore();
    await assertSucceeds(getDocs(collection(db, 'locations')));
  });

  it('lets only the owner create an office', async () => {
    const owner = testEnv.authenticatedContext(UID.owner).firestore();
    await assertSucceeds(setDoc(doc(owner, 'locations', 'loc-owner'), officeDoc(UID.owner)));

    const others: UserRole[] = ['admin', 'sales', 'production', 'accounts', 'designer', 'viewer'];
    for (const role of others) {
      const db = testEnv.authenticatedContext(UID[role]).firestore();
      await assertFails(setDoc(doc(db, 'locations', `loc-${role}`), officeDoc(UID[role])));
    }
  });

  it('lets only the owner edit an office', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'locations', 'loc-1'), officeDoc(UID.owner));
    });

    const owner = testEnv.authenticatedContext(UID.owner).firestore();
    await assertSucceeds(
      updateDoc(doc(owner, 'locations', 'loc-1'), { isActive: false, updatedBy: UID.owner }),
    );

    const admin = testEnv.authenticatedContext(UID.admin).firestore();
    await assertFails(
      updateDoc(doc(admin, 'locations', 'loc-1'), { isActive: false, updatedBy: UID.admin }),
    );
  });

  it('never allows an office to be deleted', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'locations', 'loc-1'), officeDoc(UID.owner));
    });
    const db = testEnv.authenticatedContext(UID.owner).firestore();
    await assertFails(deleteDoc(doc(db, 'locations', 'loc-1')));
  });
});
