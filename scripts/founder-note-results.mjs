#!/usr/bin/env node
// HOW THE TWO VERSIONS OF THE THANK-YOU NOTE ARE DOING (w-5efd743952).
//
//   node scripts/founder-note-results.mjs [replied.txt]
//
// Prints how many people got each version. Given a file of the addresses that
// replied (one per line, copied from the hello@ inbox), it counts the replies
// against each version too. Signs in the way scripts/apply-migration.mjs does.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { CLOUD_ADDRESS } from '../shared/cloud-address.mts';
import { projectRefFrom } from './lib/feedback-setup.mjs';
import { applyMigration, cliToken } from './apply-migration.mjs';
import { resultsSql } from './lib/founder-note-setup.mjs';

const replied = process.argv[2] ? fs.readFileSync(process.argv[2], 'utf8').split(/\s+/) : [];
let token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token && process.platform === 'darwin') {
  try { token = cliToken(execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], { encoding: 'utf8' })); } catch {}
}
if (!token) { console.error('Not signed in to Supabase. Run supabase login, or set SUPABASE_ACCESS_TOKEN.'); process.exit(1); }

const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'founder-note-')), 'results.sql');
fs.writeFileSync(file, resultsSql(replied), { mode: 0o600 });
let rows;
try { rows = JSON.parse(await applyMigration(file, { ref: projectRefFrom(CLOUD_ADDRESS.supabaseUrl), token })); } finally { fs.rmSync(path.dirname(file), { recursive: true, force: true }); }
if (!rows.length) console.log('Nobody has been sent the note yet.');
for (const r of rows) {
  const rate = replied.length && r.sent ? ` (${Math.round((100 * r.replied) / r.sent)}%)` : '';
  console.log(`${r.version ?? 'before the test'}: ${r.sent} sent${replied.length ? `, ${r.replied} replied${rate}` : ''}`);
}
