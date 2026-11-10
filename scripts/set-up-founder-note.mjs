#!/usr/bin/env node
// SWITCH ON THE FOUNDER'S THANK-YOU NOTE, IN ONE COMMAND (w-5efd743952).
//
//   node scripts/set-up-founder-note.mjs --name Sam --owners you@gmail.com [--address hello@agentbox.ac] [--preview]
//
// --name     the name the note is signed with
// --owners   your own sign-in addresses, comma separated: you and your
//            teammates never get the note, and a preview goes to the first
// --address  where it comes from and replies go (hello@agentbox.ac)
// --preview  sends the note to the first owner instead of waiting a day
//
// It stores the secrets on the function, puts the function online, applies
// its migration, gives the daily job the function's address and a fresh key,
// then asks the function who is due, sending nothing. Run again, it changes
// the wording's name or addresses and replaces the key.
//
// The Supabase sign-in comes from SUPABASE_ACCESS_TOKEN, or else the Supabase
// CLI's keychain entry on a Mac (`supabase login` once). Resend's key is the
// one the feedback function already uses; the domain in --address has to be
// verified in Resend before a note can leave.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { CLOUD_ADDRESS } from '../shared/cloud-address.mjs';
import { projectRefFrom } from './lib/feedback-setup.mjs';
import { applyMigration, cliToken } from './apply-migration.mjs';
import { DEFAULT_ADDRESS, noteUrl, senderLine, newKey, looksLikeEmail, ownersFrom, secretsFile, vaultSql } from './lib/founder-note-setup.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MIGRATION = path.join(repo, 'cloud/supabase/migrations/20261110000000_a_thank_you_note_from_the_founder.sql');
const CALL_MS = 60_000;
const say = (s = '') => process.stdout.write(`${s}\n`);
const stop = (s) => { say(`\n✗ ${s}`); process.exit(1); };

const { values: flags } = parseArgs({ options: {
  name: { type: 'string' }, owners: { type: 'string' }, address: { type: 'string', default: DEFAULT_ADDRESS }, preview: { type: 'boolean', default: false },
} });
const owners = ownersFrom(flags.owners);
if (!flags.name?.trim()) stop('Say what the note is signed with: --name Sam');
if (!owners.length || !owners.every(looksLikeEmail)) stop('Give your own sign-in addresses: --owners you@gmail.com');
if (!looksLikeEmail(flags.address)) stop(`${flags.address} is not an email address.`);

const ref = projectRefFrom(CLOUD_ADDRESS.supabaseUrl);
let token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token && process.platform === 'darwin') {
  try { token = cliToken(execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], { encoding: 'utf8' })); } catch {}
}
if (!token) stop('Not signed in to Supabase. Run supabase login, or set SUPABASE_ACCESS_TOKEN.');
const env = { ...process.env, SUPABASE_ACCESS_TOKEN: token };
const installed = spawnSync('supabase', ['--version'], { stdio: 'ignore' }).status === 0;
const supabase = (args) => (installed
  ? spawnSync('supabase', args, { stdio: 'inherit', env })
  : spawnSync('npx', ['--yes', 'supabase', ...args], { stdio: 'inherit', env }));

const key = newKey();
const url = noteUrl(ref);

say('1. Saving the settings on the function…');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'founder-note-'));
const file = path.join(dir, 'secrets.env');
fs.writeFileSync(file, secretsFile({ from: senderLine(flags.name, flags.address), name: flags.name.trim(), owners, key }), { mode: 0o600 });
const saved = supabase(['secrets', 'set', '--project-ref', ref, '--env-file', file]);
fs.rmSync(dir, { recursive: true, force: true });
if (saved.status !== 0) stop('The settings were not saved. The message above says why.');

say('2. Putting the function online…');
if (supabase(['functions', 'deploy', 'founder-note', '--project-ref', ref, '--workdir', path.join(repo, 'cloud'), '--use-api', '--no-verify-jwt']).status !== 0) {
  stop('The function did not deploy. The message above says why.');
}

say('3. Adding the table and the daily job…');
await applyMigration(MIGRATION, { ref, token });
const vault = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'founder-note-')), 'vault.sql');
fs.writeFileSync(vault, vaultSql({ url, key }), { mode: 0o600 });
try { await applyMigration(vault, { ref, token }); } finally { fs.rmSync(path.dirname(vault), { recursive: true, force: true }); }

const call = async (body) => {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-founder-note-key': key }, body: JSON.stringify(body), signal: AbortSignal.timeout(CALL_MS) });
  return res.json().catch(() => ({ ok: false, error: `the function said ${res.status}` }));
};
say('4. Asking who is due, sending nothing…');
const dry = await call({ dryRun: true });
if (!dry.ok) stop(`The function answered: ${dry.error}`);
say(`   ${dry.due} ${dry.due === 1 ? 'person is' : 'people are'} due today. The job sends at 17:00 UTC each day.`);

if (flags.preview) {
  say(`5. Sending a preview to ${owners[0]}…`);
  const sent = await call({ previewTo: owners[0] });
  if (!sent.ok) stop(`The preview did not send: ${sent.error}`);
  say('   Sent.');
}
say('\n✓ The thank-you note is on.');
