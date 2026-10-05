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
  projectRefFrom, functionUrl, senderFor, looksLikeResendKey, looksLikeEmail, secretsFile, withFeedbackUrl,
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
