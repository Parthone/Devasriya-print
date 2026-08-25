#!/usr/bin/env node
/**
 * Preflight for `npm run test:integration`.
 *
 * The integration suites skip themselves when there is no project to talk to,
 * which is what keeps `npm run verify` runnable anywhere. That is exactly the
 * behaviour you do not want from the command whose whole job is to test the
 * backend: a run that silently executes nothing looks identical to a run that
 * passed. So this refuses to start rather than let that happen.
 *
 * Values are never printed - only whether each one is present.
 */
import fs from 'node:fs';
import process from 'node:process';

// Same source the harness uses, so the preflight and the tests never disagree
// about whether credentials are present.
if (fs.existsSync('.env.integration')) {
  for (const line of fs.readFileSync('.env.integration', 'utf8').split(String.fromCharCode(10))) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const at = trimmed.indexOf('=');
    const key = trimmed.slice(0, at).trim();
    const value = trimmed
      .slice(at + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (key && value) process.env[key] ??= value;
  }
}

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const optional = ['SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY'];

const missing = required.filter((name) => !process.env[name]);
const hasAnonKey = optional.some((name) => process.env[name]);

if (missing.length > 0 || !hasAnonKey) {
  const lines = [
    '',
    '  The integration suite needs a real Supabase project.',
    '',
    ...missing.map((name) => `    missing: ${name}`),
    ...(hasAnonKey ? [] : ['    missing: SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY)']),
    '',
    '  Either copy .env.integration.example to .env.integration and fill it in,',
    '  or export the variables in this shell.',
    '',
    '  Local stack:   npm run db:start && npm run db:reset, then `supabase status`.',
    '  Live project:  Project Settings > API in the Supabase dashboard.',
    '',
    '  The service role key bypasses every security policy: keep it in your',
    '  shell, never in a VITE_ variable and never in the repository.',
    '',
  ];
  console.error(lines.join('\n'));
  process.exit(1);
}

console.log('Backend credentials present. Running the integration suite.\n');
