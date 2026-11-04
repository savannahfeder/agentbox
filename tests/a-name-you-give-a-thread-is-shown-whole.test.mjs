// A NAME YOU GIVE A THREAD IS SHOWN WHOLE (w-8b637c7802).
//
// A tester renamed a thread "Weekly product summary, for the team" and its
// heading and row read "Weekly product summary": the rule that makes a few
// words out of a message cut the name they had typed at its comma. Measured
// through shownTitle with the fields a rename writes.
import { describe, it, expect } from 'vitest';
import { shownTitle } from '../shared/thread-title.mjs';

const renamed = (label, extra = {}) => ({ title: 'Sumarise what chnaged this week', label, wrote: { title: { ts: 10, source: 'founder' }, label: { ts: 20, source: 'founder' } }, ...extra });

describe('a name you typed', () => {
  it('keeps everything after a comma, the case the tester hit', () => {
    expect(shownTitle(renamed('Sign up emails in Gmail, SPF and DKIM'))).toBe('Sign up emails in Gmail, SPF and DKIM');
  });
  it('keeps a long one whole', () => {
    expect(shownTitle(renamed('Weekly product summary for the whole team, every Friday'))).toBe('Weekly product summary for the whole team, every Friday');
  });
  it('keeps a colon and what follows', () => {
    expect(shownTitle(renamed('Infra: rotate the staging keys'))).toBe('Infra: rotate the staging keys');
  });
  it('is trimmed of space and nothing else', () => {
    expect(shownTitle(renamed('  Android 12 camera crash  '))).toBe('Android 12 camera crash');
  });
});

describe('what still gets the few-words rule', () => {
  it('a name the app gave it', () => {
    const named = { title: 'x', label: 'Fix the login bug, then add tests for it', wrote: { label: { ts: 20, source: 'agent' } } };
    expect(shownTitle(named)).not.toBe('Fix the login bug, then add tests for it');
  });
  it('your message, when you never renamed it', () => {
    expect(shownTitle({ title: 'Look at why sign up emails go to spam, and fix it' })).not.toContain('and fix it');
  });
});
