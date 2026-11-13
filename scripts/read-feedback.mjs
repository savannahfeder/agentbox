#!/usr/bin/env node
// READ WHAT PEOPLE SENT WITH THE FEEDBACK CARD.
//
//   npm run feedback                      the newest 20
//   npm run feedback -- --since 2026-11-01 --limit 100
//   npm run feedback -- --files <dir>     also saves their attachments there
//   npm run feedback -- --json            the rows as JSON
//
// Reads public.feedback (kept by functions/feedback since w-52761c8004; older
// feedback is only in the inbox it was mailed to). Signs in the way
// scripts/apply-migration.mjs does: SUPABASE_ACCESS_TOKEN, or on a Mac the
// Supabase CLI's keychain entry.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { CLOUD_ADDRESS } from '../shared/cloud-address.mts';
import { projectRefFrom } from './lib/feedback-setup.mjs';
import { cliToken, runSql } from './apply-migration.mjs';
import { readArgs, listSql, fileSql, describeFeedback, savedName } from './lib/feedback-reading.mjs';

let args;
try { args = readArgs(process.argv.slice(2)); } catch (err) { console.error(err.message); process.exit(2); }

let token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token && process.platform === 'darwin') {
  try { token = cliToken(execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], { encoding: 'utf8' })); } catch {}
}
if (!token) { console.error('Not signed in to Supabase. Run supabase login, or set SUPABASE_ACCESS_TOKEN.'); process.exit(1); }
const db = { ref: projectRefFrom(CLOUD_ADDRESS.supabaseUrl), token };

let rows;
try {
  rows = JSON.parse(await runSql(listSql(args), { ...db, label: 'reading feedback' }));
} catch (err) {
  console.error(/feedback.*does not exist/.test(err.message)
    ? 'The feedback table is not in the database yet. Apply cloud/supabase/migrations/20261112000000_feedback_is_kept_where_an_agent_can_read_it.sql.'
    : err.message);
  process.exit(1);
}

if (args.json) console.log(JSON.stringify(rows, null, 2));
else if (!rows.length) console.log('No feedback kept yet.');
else console.log(rows.map(describeFeedback).join('\n\n----\n\n'));

if (args.files) {
  fs.mkdirSync(args.files, { recursive: true });
  for (const row of rows) {
    for (const f of row.files ?? []) {
      const [file] = JSON.parse(await runSql(fileSql(Number(row.id), Number(f.position)), { ...db, label: 'reading a file' }));
      if (!file) continue;
      const to = path.join(args.files, savedName(row.id, f.position, file.name));
      fs.writeFileSync(to, Buffer.from(file.data, 'base64'));
      console.error(`saved ${to}`);
    }
  }
}
