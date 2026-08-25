import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/**
 * Loads backend credentials for the integration suite.
 *
 * Reads `.env.integration` from the repository root if it exists, and never
 * overwrites a variable that is already set - so an environment variable, a CI
 * secret or a shell export always wins over the file.
 *
 * This file exists on purpose rather than reusing `.env.local`: Vite only
 * exposes `VITE_`-prefixed variables to the browser, so the service role key
 * cannot reach a bundle from here, and keeping it in a separate git-ignored
 * file makes it obvious what it is. It holds the key that bypasses every row
 * level security policy in the database, which is why it is named as loudly as
 * it is and why it must never be committed.
 */
const CREDENTIALS_FILE = '.env.integration';

function parse(contents: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const raw of contents.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (key) values[key] = value;
  }
  return values;
}

export function loadIntegrationEnv(cwd: string = process.cwd()): void {
  const file = path.join(cwd, CREDENTIALS_FILE);
  if (!fs.existsSync(file)) return;

  for (const [key, value] of Object.entries(parse(fs.readFileSync(file, 'utf8')))) {
    process.env[key] ??= value;
  }
}
