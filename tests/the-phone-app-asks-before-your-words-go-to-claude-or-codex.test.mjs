// THE PHONE APP ASKS BEFORE YOUR WORDS GO TO CLAUDE OR CODEX.
//
// App Review (guideline 5.1.2(i)) wants an app to say which AI provider
// personal data goes to, and to get an explicit yes first. What you write on
// the phone reaches your computer, which hands it to Claude Code (Anthropic)
// or Codex (OpenAI) on your own account; the app said nothing of that
// (2026-10-23, docs/mobile/PLAN.md "What App Review will look for"). Now a
// screen says it before your first message, and only a yes on it lets a
// reply, a picked option or a new thread go; Settings turns it off again.
// Closing, putting off, stopping and answering a permission card send no
// words to an agent, so they never wait for it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { needsNotice, readNotice, NOTICE_KEY } from '../mobile/src/lib/ai-notice';

const read = (p) => fs.readFileSync(new URL(`../mobile/src/${p}`, import.meta.url), 'utf8');

describe('what waits for a yes', () => {
  it('a reply, a picked option and a new thread', () => {
    for (const kind of ['reply', 'pick', 'new']) expect(needsNotice(kind)).toBe(true);
  });
  it('never closing, putting off, stopping or answering a permission card', () => {
    for (const kind of ['close', 'later', 'stop', 'approve', 'run-now', 'send-now', 'reopen']) expect(needsNotice(kind)).toBe(false);
  });
});

describe('the answer kept on the phone', () => {
  it('reads a yes with its moment, a no, and nothing', () => {
    expect(readNotice(JSON.stringify({ agreed: 1792700000000 }))).toEqual({ agreed: 1792700000000 });
    expect(readNotice(JSON.stringify({ declined: 1792700000000 }))).toEqual({ declined: 1792700000000 });
    expect(readNotice(null)).toBeNull();
    expect(readNotice('not json')).toBeNull();
    expect(readNotice(JSON.stringify({ agreed: 'yes' }))).toBeNull();
  });
  it('is kept in the phone\'s keychain with the sign-in', () => {
    expect(NOTICE_KEY).toBe('agentbox-ai-notice');
    expect(read('platform/persist.ts')).toMatch(/const KEYS = \[[^\]]*NOTICE_KEY\]/);
  });
});

describe('the screens', () => {
  it('the notice names both companies and asks for an explicit yes', () => {
    const notice = read('app/ai-notice.tsx');
    expect(notice).toMatch(/Anthropic/);
    expect(notice).toMatch(/OpenAI/);
    expect(notice).toMatch(/title="Continue"|>Continue</);
    expect(notice).toMatch(/Not now/);
  });
  it('a send that needs it opens the notice instead of going', () => {
    const cloud = read('state/cloud.tsx');
    expect(cloud).toMatch(/needsNotice\(press\.kind\) && !agreed/);
    expect(cloud).toMatch(/router\.push\('\/ai-notice'\)/);
  });
  it('Settings turns it off, deletes the account and links the privacy policy and terms', () => {
    const pages = read('ui/SettingsPages.tsx');
    expect(pages).toMatch(/Delete account/);
    expect(pages).toMatch(/deleteAccount\(/);
    expect(pages).toMatch(/Privacy policy/);
    expect(pages).toMatch(/Terms/);
    expect(pages).toMatch(/withdraw\(\)|withdrawNotice\(\)/);
  });
});
