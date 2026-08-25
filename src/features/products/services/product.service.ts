import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

import { isDemoMode } from '@/config/demo';
import { addDemoProduct, demoProducts, updateDemoProduct } from '@/features/demo/demo-store';
import { parseProduct, type Product, type ProductInput } from '@/features/products/types';
import { getDb } from '@/lib/firebase/client';
import { toAppError } from '@/lib/firebase/errors';
import { COLLECTIONS } from '@/services/base/collections';
import { FirestoreRepository, orderBy } from '@/services/base/repository';
import type { Id } from '@/types/common';

export const productRepository = new FirestoreRepository<Product>(
  COLLECTIONS.products,
  parseProduct,
);

/** The rate card. Readable by any active staff member who prices work. */
export async function listProducts(): Promise<Product[]> {
  if (isDemoMode()) return demoProducts();

  const page = await productRepository.list({
    constraints: [orderBy('name', 'asc')],
    pageSize: 200,
  });
  return page.items;
}

export async function createProduct(input: ProductInput, actorId: Id): Promise<Product> {
  if (isDemoMode()) return addDemoProduct(input, actorId);

  try {
    const id = productRepository.newId();
    await setDoc(doc(getDb(), COLLECTIONS.products, id), {
      ...input,
      createdAt: serverTimestamp(),
      createdBy: actorId,
      updatedAt: serverTimestamp(),
      updatedBy: actorId,
    });

    const now = new Date();
    return {
      ...input,
      id,
      createdAt: now,
      createdBy: actorId,
      updatedAt: now,
      updatedBy: actorId,
    };
  } catch (error) {
    throw toAppError(error);
  }
}

/**
 * Edits a rate card entry.
 *
 * This changes what new pricing lines start from. Lines already saved on a job
 * keep the rate they were priced with.
 */
export async function updateProduct(id: Id, input: ProductInput, actorId: Id): Promise<void> {
  if (isDemoMode()) {
    updateDemoProduct(id, input, actorId);
    return;
  }

  try {
    await updateDoc(doc(getDb(), COLLECTIONS.products, id), {
      ...input,
      description: input.description ?? null,
      updatedAt: serverTimestamp(),
      updatedBy: actorId,
    });
  } catch (error) {
    throw toAppError(error);
  }
}

/** Products are deactivated, never deleted: old jobs still name them. */
export async function setProductActive(id: Id, isActive: boolean, actorId: Id): Promise<void> {
  if (isDemoMode()) {
    updateDemoProduct(id, { isActive }, actorId);
    return;
  }

  try {
    await updateDoc(doc(getDb(), COLLECTIONS.products, id), {
      isActive,
      updatedAt: serverTimestamp(),
      updatedBy: actorId,
    });
  } catch (error) {
    throw toAppError(error);
  }
}
