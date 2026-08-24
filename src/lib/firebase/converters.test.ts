import { Timestamp } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';

import { createConverter } from '@/lib/firebase/converters';
import type { Entity } from '@/types/common';

interface SampleDoc extends Entity {
  name: string;
  dueOn: Date;
  meta: { approvedAt: Date | null };
}

const converter = createConverter<SampleDoc>();

describe('firestore converters', () => {
  it('strips id and converts dates to timestamps on write', () => {
    const now = new Date('2026-08-24T10:00:00.000Z');
    const data = converter.toFirestore({
      id: 'abc',
      name: 'Vinyl banner',
      dueOn: now,
      meta: { approvedAt: now },
      createdAt: now,
      createdBy: 'user-1',
      updatedAt: now,
      updatedBy: 'user-1',
    });

    expect(data.id).toBeUndefined();
    expect(data.dueOn).toBeInstanceOf(Timestamp);
    expect((data.meta as { approvedAt: unknown }).approvedAt).toBeInstanceOf(Timestamp);
  });

  it('adds id and converts timestamps to dates on read', () => {
    const timestamp = Timestamp.fromDate(new Date('2026-08-24T10:00:00.000Z'));
    const snapshot = {
      id: 'doc-1',
      data: () => ({
        name: 'Flex board',
        dueOn: timestamp,
        meta: { approvedAt: timestamp },
        createdAt: timestamp,
        createdBy: 'user-1',
        updatedAt: timestamp,
        updatedBy: 'user-1',
      }),
    };

    const result = converter.fromFirestore(
      snapshot as unknown as Parameters<typeof converter.fromFirestore>[0],
    );

    expect(result.id).toBe('doc-1');
    expect(result.dueOn).toBeInstanceOf(Date);
    expect(result.meta.approvedAt).toBeInstanceOf(Date);
  });
});
