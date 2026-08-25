import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { parseSupabaseEnv } from '@/config/env';
import { AppError } from '@/types/common';

/**
 * The Supabase client, created once and lazily.
 *
 * Lazily, because a missing `.env.local` must fail at the point somebody
 * actually asks for data - with a message that says what to do - rather than
 * blowing up during module evaluation and leaving a blank screen. Demo mode
 * never reaches this file at all.
 */
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;

  const config = parseSupabaseEnv();
  if (!config.ok) {
    throw new AppError('invalid-input', config.message);
  }

  client = createClient(config.env.url, config.env.anonKey, {
    auth: {
      // A shop-floor application should survive a refresh and a browser
      // restart. Supabase stores a refresh token, not the password, and
      // rotates the access token in the background.
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'devasriya-print.auth',
    },
    db: { schema: 'public' },
    global: { headers: { 'x-application-name': 'devasriya-print' } },
  });

  return client;
}

/** Test seam. Never called by application code. */
export function resetSupabaseForTests(): void {
  client = null;
}
