// SWITCHING FEEDBACK ON IS ONE COMMAND THAT ASKS FOR THE KEY (w-1b574413db,
// 2026-10-05).
//
// The first instructions for switching the Feedback card on were five steps
// with a key, an email and a project ref pasted into commands. Asked for
// instead: "make it easier, ie., the commands will ask me to type in the key
// rather than me having to paste things in like keys and project refs."
//
// So `npm run setup:feedback` asks for the Resend key (hidden) and the email
// it should go to, and works out the rest: the Supabase project from the team
// cloud's own config, the sender from the recipient's domain (already verified
// with Resend), the function's address from the project. The key never goes on
// a command line, where it would land in shell history and `ps`: it goes to
// the CLI through a file only this user can read, which is deleted after.
//
// What this pins are the pure parts of scripts/lib/feedback-setup.mjs. The
// script around them talks to Supabase and a terminal and is run by a person.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  projectRefFrom, functionUrl, senderFor, senderAt, domainOf, looksLikeDomain, refusedForDomain,
  looksLikeResendKey, looksLikeEmail, secretsFile, withFeedbackUrl, savedSecrets,
} from '../scripts/lib/feedback-setup.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

describe('it finds the project itself', () => {
  it('reads the project ref out of the team cloud address', () => {
    expect(projectRefFrom('https://abcdefghijklmnop.supabase.co')).toBe('abcdefghijklmnop');
    expect(projectRefFrom('https://abcdefghijklmnop.supabase.co/')).toBe('abcdefghijklmnop');
  });

  it('refuses an address that is not a Supabase project, or nothing', () => {
    expect(projectRefFrom('https://your-project-ref.example')).toBe(null);
    expect(projectRefFrom('not a url')).toBe(null);
    expect(projectRefFrom(undefined)).toBe(null);
  });

  it('names the function at that project', () => {
    expect(functionUrl('abcdefghijklmnop')).toBe('https://abcdefghijklmnop.supabase.co/functions/v1/feedback');
  });
});

describe('it works out who the mail comes from', () => {
  it('sends from the recipient’s own domain, which is the one verified with Resend', () => {
    expect(senderFor('someone@team.example')).toBe('Agentbox Feedback <feedback@team.example>');
  });
  it('has no sender for something that is not an address', () => {
    expect(senderFor('team.example')).toBe(null);
    expect(senderFor('')).toBe(null);
  });
});

// THE FIRST REAL RUN WAS REFUSED, 502 "mail refused" (2026-10-05). The sender
// was worked out as feedback@ the recipient's domain, but the domains verified
// with Resend were two subdomains of it, not the domain itself (her screenshot
// of the Add API Key dialog: team.<domain> and updates.<domain>). So the
// sending domain is asked for, defaulting to the recipient's, and a refusal
// that names the domain asks again rather than ending the run.
describe('it sends from a domain Resend has verified', () => {
  it('puts the sender at whichever domain it is given', () => {
    expect(senderAt('updates.team.example')).toBe('Agentbox Feedback <feedback@updates.team.example>');
  });
  it('offers the recipient’s domain as the starting guess', () => {
    expect(domainOf('someone@team.example')).toBe('team.example');
    expect(domainOf('nobody')).toBe(null);
  });
  it('takes a domain, a subdomain included, and refuses what is not one', () => {
    expect(looksLikeDomain('updates.team.example')).toBe(true);
    expect(looksLikeDomain('team.example')).toBe(true);
    expect(looksLikeDomain('someone@team.example')).toBe(false);
    expect(looksLikeDomain('team')).toBe(false);
    expect(looksLikeDomain('')).toBe(false);
  });
  it('knows a refusal about the domain from any other refusal', () => {
    expect(refusedForDomain('validation_error: The team.example domain is not verified. Please, add and verify your domain.')).toBe(true);
    expect(refusedForDomain('validation_error: API key is invalid')).toBe(false);
    expect(refusedForDomain('')).toBe(false);
    expect(refusedForDomain(undefined)).toBe(false);
  });
  it('the server function passes Resend’s own reason back, so a refusal says why', () => {
    const fn = read('cloud/supabase/functions/feedback/index.ts');
    expect(fn).toMatch(/error: 'mail refused', detail/);
  });
  it('the script asks for the domain, and asks again when Resend refuses it', () => {
    const script = read('scripts/set-up-feedback.mjs');
    expect(script).toContain('refusedForDomain(');
    expect(script).toMatch(/Which domain should the mail come from\?/);
  });
});

// A SECOND RUN DOES NOT ASK FOR THE KEY AGAIN (2026-10-05). After the domain
// fix the instructions said to paste the key again, and the answer was "Why do
// I have to add another key? Already went through the effort of giving you a
// prev one". The key from the first run was already saved on the server. So the
// setup reads which secrets are saved (names only; Supabase never shows the
// values back) and asks only for what is missing. `--new-key` replaces them.
describe('it does not ask again for what is already saved', () => {
  it('reads the saved names out of the list Supabase prints', () => {
    const table = `
         NAME           │ DIGEST
  ──────────────────────┼──────────
    FEEDBACK_FROM       │ 1a2b3c
    FEEDBACK_TO         │ 4d5e6f
    RESEND_API_KEY      │ 7a8b9c
    SUPABASE_URL        │ 0d1e2f`;
    expect([...savedSecrets(table)].sort()).toEqual(['FEEDBACK_FROM', 'FEEDBACK_TO', 'RESEND_API_KEY']);
  });
  it('reads them out of JSON too', () => {
    expect([...savedSecrets('[{"name":"RESEND_API_KEY","value":"abc"}]')]).toEqual(['RESEND_API_KEY']);
  });
  it('does not mistake a longer name for one of ours', () => {
    expect(savedSecrets('OLD_RESEND_API_KEY_BACKUP  │ 123').has('RESEND_API_KEY')).toBe(false);
  });
  it('finds nothing in nothing', () => {
    expect(savedSecrets('').size).toBe(0);
    expect(savedSecrets(undefined).size).toBe(0);
  });
  it('the script lists the secrets and asks for the key only when it is missing or --new-key is given', () => {
    const script = read('scripts/set-up-feedback.mjs');
    expect(script).toContain("'secrets', 'list'");
    expect(script).toMatch(/const haveKey = !newKey && saved\.has\('RESEND_API_KEY'\) && saved\.has\('FEEDBACK_TO'\)/);
    expect(script).toContain("'--new-key'");
  });
});

describe('it checks what was typed', () => {
  it('takes a Resend key and refuses what is not one', () => {
    expect(looksLikeResendKey('re_AbC123xyz_456789')).toBe(true);
    expect(looksLikeResendKey('  re_AbC123xyz_456789  ')).toBe(true);
    expect(looksLikeResendKey('re_')).toBe(false);
    expect(looksLikeResendKey('sk_live_AbC123xyz456789')).toBe(false);
    expect(looksLikeResendKey('')).toBe(false);
  });
  it('takes an email address and refuses what is not one', () => {
    expect(looksLikeEmail('someone@team.example')).toBe(true);
    expect(looksLikeEmail('someone@team')).toBe(false);
    expect(looksLikeEmail('someone')).toBe(false);
  });
});

describe('it hands the secrets over without a command line', () => {
  it('writes the three secrets as an env file, quoted so a sender with spaces survives', () => {
    const text = secretsFile({ to: 'someone@team.example', from: 'Agentbox Feedback <feedback@team.example>', key: 're_AbC123xyz_456789' });
    expect(text).toBe(
      'FEEDBACK_TO="someone@team.example"\n'
      + 'FEEDBACK_FROM="Agentbox Feedback <feedback@team.example>"\n'
      + 'RESEND_API_KEY="re_AbC123xyz_456789"\n',
    );
  });

  it('the script never puts the key in a command’s arguments', () => {
    const script = read('scripts/set-up-feedback.mjs');
    expect(script).toContain("'--env-file'");
    expect(script).not.toMatch(/RESEND_API_KEY=\$\{/);
    expect(script).toMatch(/mode: 0o600/);
  });
});

describe('it tells the app where to send', () => {
  it('adds the address to an existing config and keeps everything else in it', () => {
    const before = JSON.stringify({ storeRoot: '/somewhere', diagnostics: false }, null, 2);
    const after = JSON.parse(withFeedbackUrl(before, 'https://x.supabase.co/functions/v1/feedback'));
    expect(after).toEqual({ storeRoot: '/somewhere', diagnostics: false, feedbackUrl: 'https://x.supabase.co/functions/v1/feedback' });
  });
  it('starts a config when there is none', () => {
    expect(JSON.parse(withFeedbackUrl(null, 'https://x.supabase.co/functions/v1/feedback'))).toEqual({ feedbackUrl: 'https://x.supabase.co/functions/v1/feedback' });
  });
  it('replaces an old address rather than keeping two', () => {
    const after = JSON.parse(withFeedbackUrl('{"feedbackUrl":"https://old.example/f"}', 'https://new.example/f'));
    expect(after.feedbackUrl).toBe('https://new.example/f');
  });
  it('is one command in package.json', () => {
    expect(JSON.parse(read('package.json')).scripts['setup:feedback']).toBe('node scripts/set-up-feedback.mjs');
  });
});
