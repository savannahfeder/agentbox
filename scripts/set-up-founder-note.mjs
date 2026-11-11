#!/usr/bin/env node
// SWITCH ON THE FOUNDER'S THANK-YOU NOTE, IN ONE COMMAND (w-5efd743952).
//
//   node scripts/set-up-founder-note.mjs --name Sam --owners <your account id> [--address hello@agentbox.ac] [--preview] [--hold]
//
// --name     the name the note is signed with
// --owners   your own account ids (public.people), comma separated: you and
//            your teammates never get the note, and a preview goes to the first
// --address  where it comes from and replies go (hello@agentbox.ac)
// --preview  sends the first owner each version of the note
// --hold     everything but the daily job, which is stopped if it was on
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
import { CLOUD_ADDRESS } from '../shared/cloud-address.mts';
import { VERSIONS } from '../cloud/supabase/functions/_shared/founder-note.mjs';
import { projectRefFrom } from './lib/feedback-setup.mjs';
import { applyMigration, cliToken } from './apply-migration.mjs';
import { DEFAULT_ADDRESS, noteUrl, senderLine, newKey, looksLikeEmail, isPersonId, ownersFrom, secretsFile, vaultSql, heldMigration } from './lib/founder-note-setup.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MIGRATION = path.join(repo, 'cloud/supabase/migrations/20261110000000_a_thank_you_note_from_the_founder.sql');
const CALL_MS = 60_000;
const say = (s = '') => process.stdout.write(`${s}\n`);
const stop = (s) => { say(`\n✗ ${s}`); process.exit(1); };

const { values: flags } = parseArgs({ options: {
  name: { type: 'string' }, owners: { type: 'string' }, address: { type: 'string', default: DEFAULT_ADDRESS }, preview: { type: 'boolean', default: false }, hold: { type: 'boolean', default: false },
} });
const owners = ownersFrom(flags.owners);
if (!flags.name?.trim()) stop('Say what the note is signed with: --name Sam');
if (!owners.length || !owners.every(isPersonId)) stop('Give your own account ids: --owners <id from public.people>');
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

say(flags.hold ? '3. Adding the table, with the daily job held…' : '3. Adding the table and the daily job…');
const held = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'founder-note-')), 'held.sql');
if (flags.hold) fs.writeFileSync(held, heldMigration(fs.readFileSync(MIGRATION, 'utf8')));
try { await applyMigration(flags.hold ? held : MIGRATION, { ref, token }); } finally { fs.rmSync(path.dirname(held), { recursive: true, force: true }); }
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
say(`   ${dry.due} ${dry.due === 1 ? 'person is' : 'people are'} due today (${VERSIONS.map((v) => `${dry.versions?.[v] ?? 0} ${v}`).join(', ')}). ${flags.hold ? 'The daily job is held: run again without --hold to start it.' : 'The job sends at 17:00 UTC each day.'}`);

if (flags.preview) {
  for (const version of VERSIONS) {
    say(`5. Sending the "${version}" version to your own account…`);
    const sent = await call({ previewTo: owners[0], version });
    if (!sent.ok) stop(`The preview did not send: ${sent.error}`);
  }
  say('   Sent.');
}
say(flags.hold ? '\n✓ The thank-you note is ready, and held.' : '\n✓ The thank-you note is on.');
