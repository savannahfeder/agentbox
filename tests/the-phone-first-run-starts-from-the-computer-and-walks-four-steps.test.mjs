// THE PHONE'S FIRST RUN STARTS FROM THE COMPUTER AND WALKS FOUR STEPS.
//
// Before TestFlight went to people outside the team, a new phone opened on a
// sign-in card that said "Use the account your computer is signed in with"
// to someone who might have no computer set up, offered to create an account
// the computer then knew nothing about, put a wall of text about where words
// go in front of an empty inbox, and only then said to connect a computer,
// pointing at a Settings › Phone switch that signing in on the computer
// already covers (main/team/index.mjs makes the phone's copy for whoever is
// signed in). Measured by drawing those screens in the phone preview.
//
// Now the first screen asks whether Agentbox is on your computer. Not yet
// sends you there to make your account. Yes walks four steps in order, each
// drawn with the same four bars: sign in, the computer, where your messages
// go, alerts. A step already done is skipped, and the inbox comes after.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { nextSetup, SETUP_STEPS } from '../mobile/src/lib/first-run';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const fresh = { signedIn: true, started: true, connect: false, noticeAnswered: false, alertsOn: false, alertsAsked: false, alertsHere: true };

describe('the order of the steps', () => {
  it('signs in first', () => {
    expect(nextSetup({ ...fresh, signedIn: false })).toBe('account');
  });
  it('waits on the computer before asking anything else', () => {
    expect(nextSetup({ ...fresh, connect: true })).toBe('computer');
  });
  it('asks nothing while the first read is still out, so a connected phone never flashes the waiting screen', () => {
    expect(nextSetup({ ...fresh, started: false })).toBeNull();
    expect(nextSetup({ ...fresh, started: false, connect: true })).toBeNull();
  });
  it('asks where your messages go once the computer is there', () => {
    expect(nextSetup(fresh)).toBe('messages');
  });
  it('takes a no on the messages as answered, so it moves on', () => {
    expect(nextSetup({ ...fresh, noticeAnswered: true })).toBe('alerts');
  });
  it('asks about alerts once, and not when they are on or the phone cannot have them', () => {
    expect(nextSetup({ ...fresh, noticeAnswered: true, alertsAsked: true })).toBeNull();
    expect(nextSetup({ ...fresh, noticeAnswered: true, alertsOn: true })).toBeNull();
    expect(nextSetup({ ...fresh, noticeAnswered: true, alertsHere: false })).toBeNull();
  });
  it('names the four bars in that order', () => {
    expect(SETUP_STEPS).toEqual(['account', 'computer', 'messages', 'alerts']);
  });
});

describe('the screens', () => {
  it('a signed-out phone opens on the question about the computer', () => {
    expect(read('mobile/src/app/index.tsx')).toMatch(/<Redirect href="\/welcome" \/>/);
    const welcome = read('mobile/src/app/welcome.tsx');
    expect(welcome).toMatch(/Is Agentbox on your computer\?/);
    expect(welcome).toMatch(/Start on your computer/);
    expect(welcome).toMatch(/agentbox\.ac\/download/);
  });

  it('the phone signs in to an account and never makes one', () => {
    const signIn = read('mobile/src/app/sign-in.tsx');
    expect(signIn).toMatch(/signInWithPassword/);
    expect(signIn).not.toMatch(/signUp\(/);
    expect(signIn).not.toMatch(/Create an account/);
    expect(signIn).toMatch(/make one in Agentbox on your computer/i);
  });

  it('waiting on the computer asks for its sign-in, not a Phone switch', () => {
    const index = read('mobile/src/app/index.tsx');
    expect(index).toMatch(/if \(c\.connect\)/);
    const waiting = read('mobile/src/ui/Onboarding.tsx');
    expect(waiting).toMatch(/Sign in on your computer/);
    expect(waiting).not.toMatch(/Settings › Phone/);
    expect(waiting).toMatch(/Use another account/);
  });

  it('every step wears the same four bars', () => {
    for (const f of ['mobile/src/app/sign-in.tsx', 'mobile/src/app/ai-notice.tsx', 'mobile/src/app/alerts.tsx', 'mobile/src/ui/Onboarding.tsx']) {
      expect(read(f)).toMatch(/<Bars /);
    }
  });

  it('nothing from the drafts is left: no made-up inbox to try, no pairing code', () => {
    const welcome = read('mobile/src/app/welcome.tsx');
    expect(welcome).not.toMatch(/made up|K7Q4MX|option/);
  });
});
