// THE PHONE CAN SKIP WAITING FOR THE COMPUTER (2026-11-15).
//
// A tester signed in on a fresh Android phone with an account whose computer
// was off. "Waiting for your computer" offered only Settings and Use another
// account, so there was no way into the app until the computer came on.
// Measured on the QA emulator (session m19). Now the wait screen has Not now,
// the choice is kept for that account, the rest of the first run carries on,
// and the inbox says no computer is connected yet.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { skipWait, waitNotice, waitSkipped } from '../mobile/src/lib/computer-wait';
import { nextSetup } from '../mobile/src/lib/first-run';

const read = (p: string) => fs.readFileSync(new URL(`../mobile/src/${p}`, import.meta.url), 'utf8');

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
}

describe('skipping the wait', () => {
  it('is not skipped until you say so', () => {
    expect(waitSkipped(memory(), 'a@b.c')).toBe(false);
  });
  it('is kept for the account that skipped it', () => {
    const s = memory();
    skipWait(s, 'a@b.c');
    expect(waitSkipped(s, 'a@b.c')).toBe(true);
  });
  it('does not carry over to another account', () => {
    const s = memory();
    skipWait(s, 'a@b.c');
    expect(waitSkipped(s, 'other@b.c')).toBe(false);
  });
  it('works for an account with no email', () => {
    const s = memory();
    expect(waitSkipped(s, null)).toBe(false);
    skipWait(s, null);
    expect(waitSkipped(s, null)).toBe(true);
  });
});

describe('the notice in the inbox', () => {
  it('says no computer is connected yet, and which account to sign in to', () => {
    expect(waitNotice({ email: 'a@b.c' })).toEqual({
      message: 'No computer connected yet.',
      next: 'Open Agentbox on your computer and sign in as a@b.c.',
    });
  });
  it('says the same account when it has no email', () => {
    expect(waitNotice({ email: null })?.next).toBe('Open Agentbox on your computer and sign in to this account.');
  });
  it('is gone once a computer has connected', () => {
    expect(waitNotice(null)).toBeNull();
  });
});

describe('the first run after skipping', () => {
  const fresh = { signedIn: true, started: true, connect: false, noticeAnswered: false, alertsOn: false, alertsAsked: false, alertsHere: true };
  it('moves on to where your messages go', () => {
    expect(nextSetup(fresh)).toBe('messages');
  });
});

describe('the screens', () => {
  const onboarding = read('ui/Onboarding.tsx');
  const wait = onboarding.slice(onboarding.indexOf('export function ComputerWait'), onboarding.indexOf('export const leaveSetup'));
  const inbox = read('app/index.tsx');
  it('the wait screen offers Not now', () => {
    expect(wait).toMatch(/label="Not now" onPress=\{skip\}/);
  });
  it('the inbox draws the wait screen only until it is skipped', () => {
    expect(inbox).toMatch(/if \(c\.connect && !skipped\) return <ComputerWait/);
  });
  it('the first run treats a skipped wait as done', () => {
    expect(inbox).toMatch(/connect: !!c\.connect && !skipped/);
  });
  it('the inbox shows the waiting state as its notice', () => {
    expect(inbox).toMatch(/waitNotice\(c\.connect\)/);
  });
});
