// SWITCH THE FEEDBACK CARD ON, IN ONE COMMAND (w-1b574413db).
//
//   npm run setup:feedback
//
// Asks for three things: the Resend API key (hidden as you type), the email
// feedback should reach, and the domain the mail is sent from (Enter takes the
// suggestion). Run again, it asks only for the domain: the key and the email
// are already saved on the server (`--new-key` replaces them). Everything else
// it works out:
//   - which Supabase project, from cloud/team.config.json;
//   - signing in to Supabase, in the browser, only if you are not already.
// Then it stores the secrets on the server function, deploys it (no Docker
// needed), writes the function's address into this folder's zero.config.json,
// and sends one test message so you can see it arrive.
//
// THE SENDING DOMAIN IS ASKED FOR BECAUSE GUESSING IT FAILED. The first real
// run sent from the recipient's own domain and Resend refused it: the domains
// verified there were two subdomains, not the domain itself. A refusal that
// names the domain now asks again and retries, without starting over.
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
  projectRefFrom, functionUrl, senderAt, domainOf, looksLikeDomain, refusedForDomain,
  looksLikeResendKey, looksLikeEmail, secretsFile, withFeedbackUrl, savedSecrets,
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
async function askDomain(suggested) {
  for (;;) {
    const typed = await ask(`Which domain should the mail come from? It must be listed under Domains in Resend${suggested ? ` [${suggested}]` : ''}: `);
    const domain = typed || suggested || '';
    if (looksLikeDomain(domain)) return domain.toLowerCase();
    say('That does not look like a domain. It looks like updates.example.com.');
  }
}

const supabase = (args, opts = {}) => spawnSync('supabase', args, { stdio: opts.quiet ? 'pipe' : 'inherit', encoding: 'utf8' });

// The secrets, through a file only you can read, deleted straight after.
function setSecrets(ref, values) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-feedback-'));
  const file = path.join(dir, 'secrets.env');
  fs.writeFileSync(file, values, { mode: 0o600 });
  const out = supabase(['secrets', 'set', '--project-ref', ref, '--env-file', file]);
  fs.rmSync(dir, { recursive: true, force: true });
  return out.status === 0;
}

async function sendTest(url) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Test from npm run setup:feedback. If you can read this, the Feedback card works.', files: [], app: { version: 'setup', os: `${process.platform} ${os.release()}` } }),
    });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok && !!body.ok, status: res.status, error: body.error ?? '', detail: body.detail ?? '' };
  } catch (err) {
    return { ok: false, status: 0, error: err.message, detail: '' };
  }
}

say('Switching on the Feedback card.\n');

// 1. The project, from the team cloud's own config.
const configFile = path.join(repo, 'cloud', 'team.config.json');
if (!fs.existsSync(configFile)) stop(`No cloud/team.config.json in ${repo}. Run this from the folder your Agentbox runs from.`);
const ref = projectRefFrom(JSON.parse(fs.readFileSync(configFile, 'utf8')).url);
if (!ref) stop('cloud/team.config.json does not name a Supabase project.');
if (supabase(['--version'], { quiet: true }).status !== 0) stop('The Supabase command is not installed. Run: brew install supabase/tap/supabase');

// 2. Signed in to Supabase? If not, it opens the browser once.
if (supabase(['projects', 'list'], { quiet: true }).status !== 0) {
  say('Signing you in to Supabase. A browser window will open.');
  if (supabase(['login']).status !== 0) stop('Supabase sign-in did not finish. Run npm run setup:feedback again.');
}

// 3. What is already saved. A run after the first must not ask for the key
//    again ("Why do I have to add another key?"). `--new-key` replaces it.
const newKey = process.argv.includes('--new-key');
const listed = supabase(['secrets', 'list', '--project-ref', ref], { quiet: true });
const saved = listed.status === 0 ? savedSecrets(listed.stdout) : new Set();
const haveKey = !newKey && saved.has('RESEND_API_KEY') && saved.has('FEEDBACK_TO');

// 4. Only what is missing.
let to = '';
let domain;
if (haveKey) {
  say('Your Resend key and email are already saved, so I will not ask for them again.');
  domain = await askDomain(null);
  say(`Feedback will arrive from ${senderAt(domain)}.\n`);
  say('Saving the sender on the server…');
  if (!setSecrets(ref, `FEEDBACK_FROM="${senderAt(domain)}"\n`)) stop('Supabase did not take the sender. The message above says why.');
} else {
  let key = '';
  while (!looksLikeResendKey(key)) {
    if (key) say('That does not look like a Resend key. It starts with re_.');
    key = await ask('Paste your Resend API key (it stays hidden), then press Enter: ', { hidden: true });
  }
  say(`Got the key (${key.slice(0, 5)}…).`);
  while (!looksLikeEmail(to)) {
    if (to) say('That does not look like an email address.');
    to = await ask('Which email should feedback go to? ');
  }
  domain = await askDomain(domainOf(to));
  say(`Feedback will arrive from ${senderAt(domain)}.\n`);
  say('Saving the key and addresses on the server…');
  if (!setSecrets(ref, secretsFile({ to, from: senderAt(domain), key }))) stop('Supabase did not take the secrets. The message above says why.');
}

// 5. The function itself.
say('Putting the feedback function online…');
const deployed = supabase(['functions', 'deploy', 'feedback', '--project-ref', ref, '--workdir', path.join(repo, 'cloud'), '--use-api', '--no-verify-jwt']);
if (deployed.status !== 0) stop('The function did not deploy. The message above says why.');

// 6. Tell this copy of Agentbox where to send.
const url = functionUrl(ref);
const appConfig = path.join(repo, 'zero.config.json');
fs.writeFileSync(appConfig, withFeedbackUrl(fs.existsSync(appConfig) ? fs.readFileSync(appConfig, 'utf8') : null, url));
say('Told Agentbox where to send.');

// 7. One real message. A refusal about the domain asks for another one and
//    tries again; only the sender changes, so nothing is redeployed.
for (let tries = 1; ; tries += 1) {
  say('Sending a test message…');
  const sent = await sendTest(url);
  if (sent.ok) break;
  if (refusedForDomain(sent.detail) && tries < 4) {
    say(`Resend refused that domain: ${sent.detail}`);
    // A bare domain refused usually means a subdomain of it is the verified one.
    domain = await askDomain(domain.split('.').length === 2 ? `updates.${domain}` : null);
    if (!setSecrets(ref, `FEEDBACK_FROM="${senderAt(domain)}"\n`)) stop('Supabase did not take the new sender. The message above says why.');
    // A changed secret reaches the next fresh worker; give it a moment.
    await new Promise((r) => setTimeout(r, 4000));
    continue;
  }
  stop(`The test did not send (${sent.status} ${sent.error}${sent.detail ? `: ${sent.detail}` : ''}).`);
}
rl.close();

say(`\n✓ Done. Check ${to || 'your inbox'} for "Agentbox feedback: Test from npm run setup:feedback".`);
say('  Quit and reopen Agentbox so it picks up the new address.');
