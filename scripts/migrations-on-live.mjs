#!/usr/bin/env node
// Which migrations the live cloud database is missing.
//
//   node scripts/run.mjs scripts/migrations-on-live.mjs
//
// Prints one missing file per line and exits 1, exits 0 when none is missing,
// and exits 2 with the reason when it cannot read the database. Signs in as
// scripts/read-feedback.mjs does.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CLOUD_ADDRESS } from '../shared/cloud-address.mts';
import { projectRef, cliToken, runSql } from './apply-migration.mjs';
import { LIVE_OBJECTS_SQL, missingOnLive } from './lib/migrations-on-live.mjs';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'cloud', 'supabase', 'migrations');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  .map((name) => ({ name, sql: fs.readFileSync(path.join(dir, name), 'utf8') }));

let token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token && process.platform === 'darwin') {
  try { token = cliToken(execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], { encoding: 'utf8' })); } catch {}
}
if (!token) { console.log('Not signed in to Supabase. Run npx supabase login once.'); process.exit(2); }

let live;
try {
  live = JSON.parse(await runSql(LIVE_OBJECTS_SQL, { ref: projectRef(CLOUD_ADDRESS.supabaseUrl), token, label: 'reading the live database' })).map((r) => r.n);
} catch (err) { console.log(err.message); process.exit(2); }

const missing = missingOnLive(files, live);
if (process.argv.includes('--why')) for (const m of missing) console.error(`${m.file}: ${m.missing.join(' ')}`);
for (const m of missing) console.log(m.file);
process.exit(missing.length ? 1 : 0);
