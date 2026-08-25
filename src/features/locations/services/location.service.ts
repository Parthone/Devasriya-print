import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

import { isDemoMode } from '@/config/demo';
import { addDemoLocation, demoLocations, updateDemoLocation } from '@/features/demo/demo-store';
import { parseLocation, type Location, type LocationInput } from '@/features/locations/types';
import { getDb } from '@/lib/firebase/client';
import { toAppError } from '@/lib/firebase/errors';
import { COLLECTIONS } from '@/services/base/collections';
import { FirestoreRepository, orderBy } from '@/services/base/repository';
import type { Id } from '@/types/common';

export const locationRepository = new FirestoreRepository<Location>(
  COLLECTIONS.locations,
  parseLocation,
);

/** Every pickup office. Readable by any signed-in, active staff member. */
export async function listLocations(): Promise<Location[]> {
  if (isDemoMode()) return demoLocations();

  const page = await locationRepository.list({
    constraints: [orderBy('name', 'asc')],
    pageSize: 100,
  });
  return page.items;
}

export async function createLocation(input: LocationInput, actorId: Id): Promise<Location> {
  if (isDemoMode()) return addDemoLocation(input, actorId);

  try {
    const id = locationRepository.newId();
    await setDoc(doc(getDb(), COLLECTIONS.locations, id), {
      ...input,
      contactUserId: null,
      createdAt: serverTimestamp(),
      createdBy: actorId,
      updatedAt: serverTimestamp(),
      updatedBy: actorId,
    });

    const now = new Date();
    return {
      ...input,
      id,
      contactUserId: null,
      createdAt: now,
      createdBy: actorId,
      updatedAt: now,
      updatedBy: actorId,
    };
  } catch (error) {
    throw toAppError(error);
  }
}

export async function updateLocation(id: Id, input: LocationInput, actorId: Id): Promise<void> {
  if (isDemoMode()) {
    updateDemoLocation(id, input, actorId);
    return;
  }

  try {
    await updateDoc(doc(getDb(), COLLECTIONS.locations, id), {
      ...input,
      phone: input.phone ?? null,
      contactName: input.contactName ?? null,
      contactMobile: input.contactMobile ?? null,
      updatedAt: serverTimestamp(),
      updatedBy: actorId,
    });
  } catch (error) {
    throw toAppError(error);
  }
}
