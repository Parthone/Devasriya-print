import { describe, expect, it } from 'vitest';

import { parseSupabaseEnv } from '@/config/env';

const COMPLETE = {
  VITE_SUPABASE_URL: 'https://abcdefgh.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'anon-key',
};

describe('parseSupabaseEnv', () => {
  it('accepts a complete configuration', () => {
    const result = parseSupabaseEnv(COMPLETE);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected a valid configuration');
    expect(result.env.url).toBe('https://abcdefgh.supabase.co');
    expect(result.env.anonKey).toBe('anon-key');
  });

  it('never throws on a missing configuration, and says what to do', () => {
    const result = parseSupabaseEnv({});

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected an invalid configuration');
    expect(result.issues).toHaveLength(2);
    expect(result.message).toContain('.env.local');
    expect(result.message).toContain('VITE_SUPABASE_URL is required');
  });

  it('rejects a url that is not a url', () => {
    const result = parseSupabaseEnv({ ...COMPLETE, VITE_SUPABASE_URL: 'not-a-url' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected an invalid configuration');
    expect(result.message).toContain('https://xxxx.supabase.co');
  });

  it('has no place for the service role key', () => {
    // The service role key bypasses every row level security policy. Anything
    // prefixed VITE_ is compiled into the browser bundle, so if this ever
    // starts parsing one, the key is one build away from being public.
    const parsed = parseSupabaseEnv({
      ...COMPLETE,
      VITE_SUPABASE_SERVICE_ROLE_KEY: 'must-never-be-read',
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('expected a valid configuration');
    expect(Object.values(parsed.env)).not.toContain('must-never-be-read');
    expect(Object.keys(parsed.env)).toEqual(['url', 'anonKey']);
  });
});
