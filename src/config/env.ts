import { z } from 'zod';

/**
 * Runtime environment parsing.
 *
 * Nothing here throws at import time - a missing `.env.local` must produce a
 * clear, actionable error at the point Supabase is first used, not a blank
 * screen during module evaluation (and not a failing test suite).
 */
const supabaseEnvSchema = z.object({
  VITE_SUPABASE_URL: z
    .string({ required_error: 'VITE_SUPABASE_URL is required' })
    .min(1, 'VITE_SUPABASE_URL is required')
    .url('VITE_SUPABASE_URL must be a URL like https://xxxx.supabase.co'),
  VITE_SUPABASE_ANON_KEY: z
    .string({ required_error: 'VITE_SUPABASE_ANON_KEY is required' })
    .min(1, 'VITE_SUPABASE_ANON_KEY is required'),
});

export type RawEnv = Record<string, string | boolean | undefined>;

/**
 * The two variables this application reads, named one at a time.
 *
 * Deliberately not `import.meta.env` itself: referencing the whole object makes
 * Vite inline every VITE_ variable it can find into the bundle, including ones
 * that have nothing to do with this build. Naming them keeps the bundle honest
 * about what it actually depends on.
 */
function currentEnv(): RawEnv {
  return {
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  };
}

export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

export type EnvParseResult =
  { ok: true; env: SupabaseEnv } | { ok: false; issues: string[]; message: string };

/**
 * Parses and validates the Supabase environment variables. Never throws.
 *
 * Only the publishable anon key belongs here. The service-role key bypasses
 * every row level security policy in the database, so it exists solely inside
 * Edge Functions and local admin scripts - putting it in a `VITE_` variable
 * would bake it into the browser bundle for anyone to read.
 */
export function parseSupabaseEnv(source: RawEnv = currentEnv()): EnvParseResult {
  const parsed = supabaseEnvSchema.safeParse(source);

  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => issue.message);
    return {
      ok: false,
      issues,
      message: [
        'Supabase configuration is missing or incomplete.',
        'Copy `.env.example` to `.env.local` and fill in the values from the Supabase dashboard',
        '(Project Settings > API).',
        ...issues.map((issue) => `  - ${issue}`),
      ].join('\n'),
    };
  }

  return {
    ok: true,
    env: { url: parsed.data.VITE_SUPABASE_URL, anonKey: parsed.data.VITE_SUPABASE_ANON_KEY },
  };
}

export const IS_DEV = import.meta.env.DEV;
export const IS_PROD = import.meta.env.PROD;
