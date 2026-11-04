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
// Now it opens on sign-in, since nearly everyone already has an account from
// the computer: email and password first, then Google. No Apple, which the
// computer cannot sign in with, so an Apple account would be stranded. Sign up,
// or a sign-in that fails, says accounts are made in Agentbox on the computer.
// Then four steps in order, each drawn with the same four bars: sign in, the
// computer, where your messages go, alerts. A step already done is skipped.
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
  it('a signed-out phone opens on sign-in, with no question first', () => {
    expect(read('mobile/src/app/index.tsx')).toMatch(/<Redirect href="\/sign-in" \/>/);
    expect(fs.existsSync(new URL('../mobile/src/app/welcome.tsx', import.meta.url))).toBe(false);
  });

  it('sign-in leads with email and password, then Google, and offers no Apple', () => {
    const signIn = read('mobile/src/app/sign-in.tsx');
    expect(signIn).toMatch(/signInWithPassword/);
    // The fields are always drawn, not behind a "Continue with email" button.
    expect(signIn).toMatch(/<Field label="Email"/);
    expect(signIn).not.toMatch(/Continue with email|byEmail/);
    // The email Sign in is the main button, and Google comes after it.
    expect(signIn.indexOf('kind="primary"')).toBeGreaterThan(-1);
    expect(signIn.indexOf('kind="primary"')).toBeLessThan(signIn.indexOf('Continue with Google'));
    expect(signIn).not.toMatch(/Apple/);
  });

  it('the phone never makes an account; sign up and a failed sign-in point to the computer', () => {
    const signIn = read('mobile/src/app/sign-in.tsx');
    expect(signIn).not.toMatch(/signUp\(/);
    expect(signIn).toMatch(/router\.push\('\/no-account'\)/);
    expect(signIn).toMatch(/Sign up/);
    expect(signIn).toMatch(/failed && /);
    const noAccount = read('mobile/src/app/no-account.tsx');
    expect(noAccount).toMatch(/Make your account\\non your computer/);
    expect(noAccount).toMatch(/agentbox\.ac\/download/);
  });

  it('waiting on the computer asks for its sign-in, not a Phone switch', () => {
    const index = read('mobile/src/app/index.tsx');
    expect(index).toMatch(/if \(c\.connect\)/);
    const waiting = read('mobile/src/ui/Onboarding.tsx');
    expect(waiting).toMatch(/Waiting for\\nyour computer/);
    expect(waiting).toMatch(/signed in to the same account/);
    // A check of the account, with where to look, not a switch to turn on.
    expect(waiting).toMatch(/In Settings › Phone, check it is signed in as/);
    expect(waiting).toMatch(/Use another account/);
  });

  // Two of three testers could not tell what "Not now" declined.
  it('a no to where your messages go says what it leaves you with', () => {
    expect(read('mobile/src/app/ai-notice.tsx')).toMatch(/label="Not now, I'll just read"/);
  });
  // And two of three, on the second look, could not tell what Continue agreed to.
  it('a yes says it allows', () => {
    expect(read('mobile/src/app/ai-notice.tsx')).toMatch(/label="Allow and continue"/);
  });

  it('every step wears the same four bars', () => {
    for (const f of ['mobile/src/app/sign-in.tsx', 'mobile/src/app/ai-notice.tsx', 'mobile/src/app/alerts.tsx', 'mobile/src/ui/Onboarding.tsx']) {
      expect(read(f)).toMatch(/<Bars /);
    }
  });

  // Walking it in the preview: once the computer joined, a waiting permission
  // card rose over the alerts step and covered both its buttons.
  it('a permission card waits until the first run is over', () => {
    const cards = read('mobile/src/ui/Approvals.tsx');
    for (const screen of ['/sign-in', '/no-account', '/ai-notice', '/alerts']) expect(cards).toMatch(new RegExp(`FIRST_RUN_SCREENS = new Set\\([^)]*'${screen}'`));
    expect(cards).toMatch(/if \(FIRST_RUN_SCREENS\.has\(pathname\)\) return null;/);
  });
});
