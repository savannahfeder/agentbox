// SWITCH THE FEEDBACK CARD ON, IN ONE COMMAND (w-1b574413db).
//
//   npm run setup:feedback
//
// Asks for two things: the Resend API key (hidden as you type) and the email
// feedback should reach. Everything else it works out:
//   - which Supabase project, from cloud/team.config.json;
//   - who the mail comes from, an address at your own domain;
//   - signing in to Supabase, in the browser, only if you are not already.
// Then it stores the three secrets on the server function, deploys it (no
// Docker needed), writes the function's address into this folder's
// zero.config.json, and sends one test message so you can see it arrive.
//
// THE KEY NEVER GOES ON A COMMAND LINE, where it would sit in shell history and
// in `ps`. It reaches the Supabase CLI through a file only you can read, which
// is deleted the moment the CLI is done with it. Nothing here prints it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  projectRefFrom, functionUrl, senderFor, looksLikeResendKey, looksLikeEmail, secretsFile, withFeedbackUrl,
} from './lib/feedback-setup.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const say = (s = '') => process.stdout.write(`${s}\n`);
const stop = (s) => { say(`\n✗ ${s}`); process.exit(1); };

// ONE reader for the whole run. A reader per question lost answers: the first
// one swallowed everything already typed or pasted ahead, then closed with it.
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
let muted = false;
// Hidden: the question prints, then nothing of what is typed or pasted.
rl._writeToOutput = (s) => { if (!muted) rl.output.write(s); };
const lines = rl[Symbol.asyncIterator]();
async function ask(question, { hidden = false } = {}) {
  process.stdout.write(question);
  muted = hidden;
  const { value, done } = await lines.next();
  muted = false;
  if (hidden) process.stdout.write('\n');
  if (done) stop('Stopped before it was finished.');
  return String(value).trim();
}

const supabase = (args, opts = {}) => spawnSync('supabase', args, { stdio: opts.quiet ? 'pipe' : 'inherit', encoding: 'utf8' });

say('Switching on the Feedback card.\n');

// 1. The project, from the team cloud's own config.
const configFile = path.join(repo, 'cloud', 'team.config.json');
if (!fs.existsSync(configFile)) stop(`No cloud/team.config.json in ${repo}. Run this from the folder your Agentbox runs from.`);
const ref = projectRefFrom(JSON.parse(fs.readFileSync(configFile, 'utf8')).url);
if (!ref) stop('cloud/team.config.json does not name a Supabase project.');
if (supabase(['--version'], { quiet: true }).status !== 0) stop('The Supabase command is not installed. Run: brew install supabase/tap/supabase');

// 2. The two things only you know.
let key = '';
while (!looksLikeResendKey(key)) {
  if (key) say('That does not look like a Resend key. It starts with re_.');
  key = await ask('Paste your Resend API key (it stays hidden), then press Enter: ', { hidden: true });
}
say(`Got the key (${key.slice(0, 5)}…).`);
let to = '';
while (!looksLikeEmail(to)) {
  if (to) say('That does not look like an email address.');
  to = await ask('Which email should feedback go to? ');
}
rl.close();
const from = senderFor(to);
say(`Feedback will arrive from ${from}.\n`);

// 3. Signed in to Supabase? If not, it opens the browser once.
if (supabase(['projects', 'list'], { quiet: true }).status !== 0) {
  say('Signing you in to Supabase. A browser window will open.');
  if (supabase(['login']).status !== 0) stop('Supabase sign-in did not finish. Run npm run setup:feedback again.');
}

// 4. The secrets, through a file only you can read.
const secrets = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-feedback-')), 'secrets.env');
fs.writeFileSync(secrets, secretsFile({ to, from, key }), { mode: 0o600 });
say('Saving the key and addresses on the server…');
const saved = supabase(['secrets', 'set', '--project-ref', ref, '--env-file', secrets]);
fs.rmSync(path.dirname(secrets), { recursive: true, force: true });
if (saved.status !== 0) stop('Supabase did not take the secrets. The message above says why.');

// 5. The function itself.
say('Putting the feedback function online…');
const deployed = supabase(['functions', 'deploy', 'feedback', '--project-ref', ref, '--workdir', path.join(repo, 'cloud'), '--use-api', '--no-verify-jwt']);
if (deployed.status !== 0) stop('The function did not deploy. The message above says why.');

// 6. Tell this copy of Agentbox where to send.
const url = functionUrl(ref);
const appConfig = path.join(repo, 'zero.config.json');
fs.writeFileSync(appConfig, withFeedbackUrl(fs.existsSync(appConfig) ? fs.readFileSync(appConfig, 'utf8') : null, url));
say('Told Agentbox where to send.');

// 7. One real message, so you can see it arrive.
say('Sending a test message…');
try {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'Test from npm run setup:feedback. If you can read this, the Feedback card works.', files: [], app: { version: 'setup', os: `${process.platform} ${os.release()}` } }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) stop(`The test did not send (${res.status} ${body.error ?? ''}). If it says "mail refused", check the key is from the Resend workspace that owns ${to.split('@')[1]}.`);
} catch (err) {
  stop(`The test did not send: ${err.message}`);
}

say(`\n✓ Done. Check ${to} for "Agentbox feedback: Test from npm run setup:feedback".`);
say('  Quit and reopen Agentbox so it picks up the new address.');
