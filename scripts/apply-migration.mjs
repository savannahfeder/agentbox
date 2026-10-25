#!/usr/bin/env node
// Applies migration files to the hosted account database, in the order given.
//
//   node scripts/apply-migration.mjs cloud/supabase/migrations/<file>.sql [...]
//
// The project comes from the team cloud's address (cloud/team.config.json or
// ~/.agentbox/team.config.json); the key is the Supabase CLI's own sign-in in
// the macOS keychain (`npx supabase login` once). Every migration here is
// written to be run twice without harm, so a file applied again is fine.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadCloudConfig } from '../main/team/session.mjs';

const CALL_MS = 60_000;

/** The project's ref, off its address: https://<ref>.supabase.co */
export function projectRef(url) {
  const m = /^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/.exec(String(url ?? ''));
  return m ? m[1] : null;
}

/** The Supabase CLI's token, as its keychain entry keeps it. */
export function cliToken(raw) {
  const text = String(raw ?? '').trim();
  return text.startsWith('go-keyring-base64:') ? Buffer.from(text.slice('go-keyring-base64:'.length), 'base64').toString('utf8') : text;
}

export async function applyMigration(file, { ref, token, fetchImpl = fetch }) {
  const res = await fetchImpl(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0' },
    body: JSON.stringify({ query: fs.readFileSync(file, 'utf8') }),
    signal: AbortSignal.timeout(CALL_MS),
  });
  const said = await res.text();
  if (!res.ok) throw new Error(`${path.basename(file)}: the database said ${res.status}: ${said.slice(0, 500)}`);
  return said;
}

async function main(files) {
  if (!files.length) { console.error('name the migration files to apply'); process.exit(2); }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const ref = projectRef(loadCloudConfig(root, { packaged: false, env: {} })?.url);
  if (!ref) { console.error('no team cloud address found (cloud/team.config.json or ~/.agentbox/team.config.json)'); process.exit(1); }
  let raw;
  try { raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], { encoding: 'utf8' }); } catch {
    console.error('no Supabase CLI sign-in in the keychain; run `npx supabase login` once'); process.exit(1);
  }
  const token = cliToken(raw);
  for (const file of files) {
    await applyMigration(file, { ref, token });
    console.log(`applied ${path.basename(file)}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main(process.argv.slice(2)).catch((err) => { console.error(err.message); process.exit(1); });
}
