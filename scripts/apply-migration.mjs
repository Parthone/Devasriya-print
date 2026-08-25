#!/usr/bin/env node
/**
 * Applies a migration file to the database over SUPABASE_DB_URL.
 *
 * `supabase db push` needs the Management API, which this project cannot use
 * yet, so this talks to Postgres directly. The connection string is read from
 * the environment and never appears on a command line, in output, or in an
 * error message - a superuser URL in a shell history or a CI log is a leak that
 * outlives the session.
 *
 *   node scripts/apply-migration.mjs supabase/migrations/2026..._name.sql
 *
 * The whole file runs in one transaction, and the version is recorded in
 * `supabase_migrations.schema_migrations` so the CLI stays in step.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

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

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error('SUPABASE_DB_URL is not set.');
  process.exit(1);
}

const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.error(`No such migration file: ${file ?? '<none>'}`);
  process.exit(1);
}

const version = path.basename(file).split('_')[0];
const name = path
  .basename(file)
  .replace(/^\d+_/, '')
  .replace(/\.sql$/, '');
const sql = fs.readFileSync(file, 'utf8');

/** Never let a connection string reach the output, however it is wrapped. */
function safe(error) {
  const text = error instanceof Error ? `${error.message}` : String(error);
  return text.replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, '<db-url>');
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  await client.query('begin');
  await client.query(sql);
  await client.query(
    `insert into supabase_migrations.schema_migrations (version, name, statements)
     values ($1, $2, $3)
     on conflict (version) do update set name = excluded.name, statements = excluded.statements`,
    [version, name, [sql]],
  );
  await client.query('commit');
  console.log(`Applied ${path.basename(file)}`);
} catch (error) {
  await client.query('rollback').catch(() => undefined);
  console.error(`Failed to apply ${path.basename(file)}:`);
  console.error('  ' + safe(error));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
