/**
 * Demo mode.
 *
 * A temporary, build-time switch used only for the public UI demo hosted on
 * GitHub Pages, where there is no Supabase project to talk to. It replaces the
 * sign-in step with a local demo session and serves small fixed datasets
 * instead of database reads.
 *
 * It is deliberately a thin seam:
 *   - no production authentication or data-access code is removed or weakened
 *   - security rules are untouched
 *   - with VITE_DEMO_MODE unset or "false" the application behaves exactly as
 *     it did before
 *
 * Read through `isDemoMode()` rather than the env var, so tests can toggle it.
 */
export function isDemoMode(): boolean {
  return import.meta.env.VITE_DEMO_MODE === 'true';
}

/** Shown on the sign-in screen and in the app shell while demo mode is on. */
export const DEMO_LABEL = 'Demo Mode';

export const DEMO_DESCRIPTION =
  'Explore the software with sample data. Nothing you change here is saved.';
