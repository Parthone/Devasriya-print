import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit as limitTo,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  type DocumentData,
  type DocumentSnapshot,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

import { getDb } from '@/lib/firebase/client';
import { createConverter } from '@/lib/firebase/converters';
import { toAppError } from '@/lib/firebase/errors';
import { AppError, type Entity, type Id, type PaginatedResult } from '@/types/common';

export interface ListOptions {
  constraints?: QueryConstraint[];
  pageSize?: number;
  /** Document id to continue after - taken from a previous page nextCursor. */
  cursor?: string;
}

const DEFAULT_PAGE_SIZE = 25;

/**
 * Generic Firestore data-access layer.
 *
 * The UI never imports the Firebase SDK; it calls a service, and services are
 * built on this class. Keeping all reads and writes behind one seam is what
 * makes a later move to Cloud Functions or a Cloud Run API a service-layer
 * change rather than an application rewrite.
 *
 * Audit fields (createdBy / updatedBy) are supplied by the caller - the auth
 * module wires the current user uid in when it lands.
 */
export class FirestoreRepository<T extends Entity> {
  private readonly converter;

  constructor(
    protected readonly collectionPath: string,
    validate?: (data: unknown, id: string) => T,
  ) {
    this.converter = createConverter<T>(validate);
  }

  protected collectionRef() {
    return collection(getDb(), this.collectionPath).withConverter(this.converter);
  }

  protected docRef(id: Id) {
    return doc(getDb(), this.collectionPath, id).withConverter(this.converter);
  }

  async findById(id: Id): Promise<T | null> {
    try {
      const snapshot: DocumentSnapshot<T> = await getDoc(this.docRef(id));
      return snapshot.exists() ? snapshot.data() : null;
    } catch (error) {
      throw toAppError(error);
    }
  }

  async getById(id: Id): Promise<T> {
    const found = await this.findById(id);
    if (!found) {
      throw new AppError('not-found', `No ${this.collectionPath} record with id "${id}".`);
    }
    return found;
  }

  async list(options: ListOptions = {}): Promise<PaginatedResult<T>> {
    const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
    try {
      const constraints: QueryConstraint[] = [...(options.constraints ?? [])];

      if (options.cursor) {
        const cursorSnapshot = await getDoc(this.docRef(options.cursor));
        if (cursorSnapshot.exists()) {
          constraints.push(startAfter(cursorSnapshot));
        }
      }

      // One extra document tells us whether a further page exists.
      constraints.push(limitTo(pageSize + 1));

      const snapshot = await getDocs(query(this.collectionRef(), ...constraints));
      const docs: QueryDocumentSnapshot<T>[] = snapshot.docs;
      const hasMore = docs.length > pageSize;
      const page = hasMore ? docs.slice(0, pageSize) : docs;
      const lastDoc = page.at(-1);

      return {
        items: page.map((document) => document.data()),
        hasMore,
        ...(hasMore && lastDoc ? { nextCursor: lastDoc.id } : {}),
      };
    } catch (error) {
      throw toAppError(error);
    }
  }

  /** Live subscription. Returns the unsubscribe function. */
  subscribe(
    options: ListOptions,
    onData: (items: T[]) => void,
    onError?: (error: AppError) => void,
  ): () => void {
    const constraints: QueryConstraint[] = [
      ...(options.constraints ?? []),
      limitTo(options.pageSize ?? DEFAULT_PAGE_SIZE),
    ];

    return onSnapshot(
      query(this.collectionRef(), ...constraints),
      (snapshot) => {
        onData(snapshot.docs.map((document) => document.data()));
      },
      (error) => {
        onError?.(toAppError(error));
      },
    );
  }

  async create(id: Id, data: Omit<T, keyof Entity>, actorId: Id): Promise<T> {
    try {
      const now = new Date();
      const record = {
        ...data,
        id,
        createdAt: now,
        createdBy: actorId,
        updatedAt: now,
        updatedBy: actorId,
      } as unknown as T;

      await setDoc(this.docRef(id), record);
      return record;
    } catch (error) {
      throw toAppError(error);
    }
  }

  async update(id: Id, changes: Partial<Omit<T, keyof Entity>>, actorId: Id): Promise<void> {
    try {
      await updateDoc(doc(getDb(), this.collectionPath, id), {
        ...(changes as DocumentData),
        updatedAt: serverTimestamp(),
        updatedBy: actorId,
      });
    } catch (error) {
      throw toAppError(error);
    }
  }

  /** Business records are soft-deleted so history and reports stay intact. */
  async softDelete(id: Id, actorId: Id): Promise<void> {
    try {
      await updateDoc(doc(getDb(), this.collectionPath, id), {
        isDeleted: true,
        deletedAt: serverTimestamp(),
        deletedBy: actorId,
        updatedAt: serverTimestamp(),
        updatedBy: actorId,
      });
    } catch (error) {
      throw toAppError(error);
    }
  }

  /** Permanent removal. Only for records with no business history. */
  async hardDelete(id: Id): Promise<void> {
    try {
      await deleteDoc(doc(getDb(), this.collectionPath, id));
    } catch (error) {
      throw toAppError(error);
    }
  }

  /** Generates an id up-front so the caller can reference it before writing. */
  newId(): Id {
    return doc(collection(getDb(), this.collectionPath)).id;
  }
}

export { orderBy, where };
