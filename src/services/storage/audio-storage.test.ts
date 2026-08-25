import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDemoStore } from '@/features/demo/demo-store';
import { extensionForMimeType, validateRecording } from '@/lib/audio/recording';
import type { LocalRecording } from '@/lib/audio/use-audio-recorder';
import {
  buildAudioPath,
  copyRequirementAudio,
  deleteSupersededAudio,
  discardAudio,
  resolveAudioUrl,
  uploadRequirementAudio,
} from '@/services/storage/audio-storage.service';
import { MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS, type AudioAttachment } from '@/types/attachments';

const storage = vi.hoisted(() => ({
  uploadBytes: vi.fn(),
  getBytes: vi.fn(),
  getDownloadURL: vi.fn(),
  deleteObject: vi.fn(),
}));

vi.mock('firebase/storage', () => ({
  ref: vi.fn((_storage: unknown, path: string) => ({ fullPath: path })),
  uploadBytes: storage.uploadBytes,
  getBytes: storage.getBytes,
  getDownloadURL: storage.getDownloadURL,
  deleteObject: storage.deleteObject,
}));

vi.mock('@/lib/firebase/client', () => ({
  getFirebaseStorage: vi.fn(() => ({})),
  getFirebaseApp: vi.fn(),
  getFirebaseAuth: vi.fn(),
  getDb: vi.fn(),
  resetFirebaseForTests: vi.fn(),
}));

function recording(overrides: Partial<LocalRecording> = {}): LocalRecording {
  return {
    blob: new Blob(['audio'], { type: 'audio/webm' }),
    url: 'blob:demo-url',
    mimeType: 'audio/webm;codecs=opus',
    durationSeconds: 12,
    sizeBytes: 2048,
    recordedAt: new Date('2026-08-24T10:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetDemoStore();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('recording limits', () => {
  it('accepts a recording inside the limits', () => {
    expect(validateRecording(1024, 30)).toBeNull();
  });

  it('rejects one that is too long or too large', () => {
    expect(validateRecording(1024, MAX_AUDIO_SECONDS + 1)).toBe('too-long');
    expect(validateRecording(MAX_AUDIO_BYTES + 1, 10)).toBe('too-large');
  });

  it('maps mime types to file extensions', () => {
    expect(extensionForMimeType('audio/webm;codecs=opus')).toBe('webm');
    expect(extensionForMimeType('audio/mp4')).toBe('m4a');
    expect(extensionForMimeType('audio/ogg;codecs=opus')).toBe('ogg');
  });
});

describe('storage paths', () => {
  it('puts the attachment id in the path, under the owning record', () => {
    expect(buildAudioPath('enquiries', 'e1', 'att-1', 'audio/webm')).toBe(
      'enquiries/e1/requirement/att-1.webm',
    );
    expect(buildAudioPath('jobs', 'j1', 'att-2', 'audio/mp4')).toBe(
      'jobs/j1/requirement/att-2.m4a',
    );
  });
});

describe('uploading with Firebase', () => {
  it('writes to an immutable path and returns metadata without a download URL', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'false');
    storage.uploadBytes.mockResolvedValue(undefined);

    const attachment = await uploadRequirementAudio({
      owner: 'enquiries',
      ownerId: 'e1',
      recording: recording(),
      uploadedById: 'uid-sales',
    });

    expect(storage.uploadBytes).toHaveBeenCalledTimes(1);
    expect(attachment.storagePath).toBe(`enquiries/e1/requirement/${attachment.id}.webm`);
    expect(attachment.durationSeconds).toBe(12);
    expect(attachment.source).toBe('staff');
    expect(attachment).not.toHaveProperty('downloadUrl');
    expect(JSON.stringify(attachment)).not.toContain('http');
  });

  it('never reuses a path, so a replacement cannot overwrite the old recording', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'false');
    storage.uploadBytes.mockResolvedValue(undefined);

    const first = await uploadRequirementAudio({
      owner: 'enquiries',
      ownerId: 'e1',
      recording: recording(),
      uploadedById: 'uid-sales',
    });
    const second = await uploadRequirementAudio({
      owner: 'enquiries',
      ownerId: 'e1',
      recording: recording(),
      uploadedById: 'uid-sales',
    });

    expect(second.id).not.toBe(first.id);
    expect(second.storagePath).not.toBe(first.storagePath);
  });

  it('resolves the playable URL on demand rather than storing it', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'false');
    storage.getDownloadURL.mockResolvedValue('https://example.test/signed');

    const attachment: AudioAttachment = {
      id: 'att-1',
      storagePath: 'enquiries/e1/requirement/att-1.webm',
      mimeType: 'audio/webm',
      durationSeconds: 10,
      sizeBytes: 100,
      recordedAt: new Date(),
      uploadedById: 'uid-sales',
      source: 'staff',
    };

    expect(await resolveAudioUrl(attachment)).toBe('https://example.test/signed');
    expect(storage.getDownloadURL).toHaveBeenCalledTimes(1);
  });

  it('keeps a superseded file that something else still references', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'false');
    const attachment: AudioAttachment = {
      id: 'att-old',
      storagePath: 'enquiries/e1/requirement/att-old.webm',
      mimeType: 'audio/webm',
      durationSeconds: 10,
      sizeBytes: 100,
      recordedAt: new Date(),
      uploadedById: 'uid-sales',
      source: 'staff',
    };

    await deleteSupersededAudio(attachment, true);
    expect(storage.deleteObject).not.toHaveBeenCalled();

    await deleteSupersededAudio(attachment, false);
    expect(storage.deleteObject).toHaveBeenCalledTimes(1);
  });
});

describe('demo mode', () => {
  it('keeps the recording in the browser and never calls Storage', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true');

    const attachment = await uploadRequirementAudio({
      owner: 'enquiries',
      ownerId: 'demo-e1',
      recording: recording({ url: 'blob:local-take' }),
      uploadedById: 'demo-owner',
    });

    expect(storage.uploadBytes).not.toHaveBeenCalled();
    expect(await resolveAudioUrl(attachment)).toBe('blob:local-take');
    expect(storage.getDownloadURL).not.toHaveBeenCalled();

    await deleteSupersededAudio(attachment, false);
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });
});

describe('copying a recording to another record', () => {
  const source: AudioAttachment = {
    id: 'att-source',
    storagePath: 'enquiries/e1/requirement/att-source.webm',
    mimeType: 'audio/webm;codecs=opus',
    durationSeconds: 42,
    sizeBytes: 4096,
    recordedAt: new Date('2026-08-24T10:00:00.000Z'),
    uploadedById: 'uid-sales',
    source: 'staff',
  };

  it('writes the same bytes to a new job owned path', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'false');
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    storage.getBytes.mockResolvedValue(bytes);
    storage.uploadBytes.mockResolvedValue(undefined);

    const copy = await copyRequirementAudio(source, 'jobs', 'job-1');

    expect(storage.getBytes).toHaveBeenCalledTimes(1);
    expect(storage.uploadBytes).toHaveBeenCalledWith(expect.anything(), bytes, {
      contentType: source.mimeType,
    });
    expect(copy.storagePath).toBe(`jobs/job-1/requirement/${copy.id}.webm`);
    expect(copy.id).not.toBe(source.id);
  });

  it('keeps format, length, size, time and recorder on the copy', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'false');
    storage.getBytes.mockResolvedValue(new Uint8Array([1]).buffer);
    storage.uploadBytes.mockResolvedValue(undefined);

    const copy = await copyRequirementAudio(source, 'jobs', 'job-1');

    expect(copy.mimeType).toBe(source.mimeType);
    expect(copy.durationSeconds).toBe(source.durationSeconds);
    expect(copy.sizeBytes).toBe(source.sizeBytes);
    expect(copy.recordedAt).toEqual(source.recordedAt);
    expect(copy.uploadedById).toBe(source.uploadedById);
    expect(copy.source).toBe(source.source);
  });

  it('never deletes or overwrites the original', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'false');
    storage.getBytes.mockResolvedValue(new Uint8Array([1]).buffer);
    storage.uploadBytes.mockResolvedValue(undefined);

    await copyRequirementAudio(source, 'jobs', 'job-1');

    expect(storage.deleteObject).not.toHaveBeenCalled();
    const writtenPath = storage.uploadBytes.mock.calls[0]?.[0] as { fullPath: string };
    expect(writtenPath.fullPath).not.toBe(source.storagePath);
  });

  it('reports a failed copy instead of returning a broken attachment', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'false');
    storage.getBytes.mockRejectedValue(new Error('network'));

    await expect(copyRequirementAudio(source, 'jobs', 'job-1')).rejects.toBeInstanceOf(Error);
    expect(storage.uploadBytes).not.toHaveBeenCalled();
  });

  it('discards an unwanted copy without failing the caller', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'false');
    storage.deleteObject.mockRejectedValue(new Error('already gone'));

    await expect(discardAudio(source)).resolves.toBeUndefined();
    expect(storage.deleteObject).toHaveBeenCalledTimes(1);
  });

  it('copies locally in demo mode without contacting Storage', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true');

    const original = await uploadRequirementAudio({
      owner: 'enquiries',
      ownerId: 'demo-e1',
      recording: recording({ url: 'blob:local-take' }),
      uploadedById: 'demo-owner',
    });
    const copy = await copyRequirementAudio(original, 'jobs', 'demo-j1');

    expect(storage.getBytes).not.toHaveBeenCalled();
    expect(storage.uploadBytes).not.toHaveBeenCalled();
    expect(copy.storagePath.startsWith('jobs/')).toBe(true);
    expect(await resolveAudioUrl(copy)).toBe('blob:local-take');
  });
});
