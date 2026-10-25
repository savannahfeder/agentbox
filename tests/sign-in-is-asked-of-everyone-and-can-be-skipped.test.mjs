// "Every flow should now require an account sign-in. Maybe people could skip
// it" (2026-10-25), then the approved pick: "Skip for now" in the top corner,
// no shortcut "because people might accidentally activate it", and a Sign in
// row in the sidebar for anyone not signed in.
//
// Before this the sign-in page stood only over a build with Multiplayer on;
// with it off (the default once installed) nobody was ever asked, though the
// build could sign in. Measured from the rule the window reads
// (renderer/src/sign-in-ask.ts) and the team service's state.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { signInAsk, SIGN_IN_SKIPPED } from '../renderer/src/sign-in-ask.ts';
import { createTeamService, teamForWindow } from '../main/team/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const team = (over = {}) => ({ configured: false, canSignIn: true, started: true, signedIn: false, ...over });
const ask = (t, over = {}) => signInAsk({ team: t, fixtures: false, skipped: false, canSkip: true, ...over });

describe('who is asked', () => {
  it('everyone whose build can sign in, Multiplayer on or off', () => {
    expect(ask(team()).page).toBe(true);
    expect(ask(team({ configured: true, canSignIn: true })).page).toBe(true);
  });

  it('nobody on a build with no account to sign in to', () => {
    expect(ask(null)).toEqual({ page: false, walkWaits: false, sidebar: false });
    expect(ask(team({ canSignIn: false }))).toEqual({ page: false, walkWaits: false, sidebar: false });
  });

  it('nobody already signed in', () => {
    expect(ask(team({ signedIn: true }))).toEqual({ page: false, walkWaits: false, sidebar: false });
  });

  it('not before the saved sign-in has been looked for, though the walk already waits', () => {
    expect(ask(team({ started: false }))).toMatchObject({ page: false, walkWaits: true });
  });

  it('never in the screenshot fixtures', () => {
    expect(ask(team(), { fixtures: true })).toEqual({ page: false, walkWaits: false, sidebar: false });
  });
});

describe('skipping', () => {
  it('puts the page away and lets the walk run, and the sidebar still offers sign-in', () => {
    expect(ask(team(), { skipped: true })).toEqual({ page: false, walkWaits: false, sidebar: true });
  });

  it('is not offered on the phone with the computer shut, which needs the account', () => {
    expect(ask(team({ configured: true }), { skipped: true, canSkip: false }).page).toBe(true);
  });

  it('the sidebar row is there whenever the page is not', () => {
    expect(ask(team()).sidebar).toBe(false);
    expect(ask(team(), { skipped: true }).sidebar).toBe(true);
  });
});

describe('the team service says the build can sign in', () => {
  it('from its session, and the window keeps it with Multiplayer off', () => {
    const mac = createTeamService({ session: { configured: true }, store: {}, disk: {}, accountRoot: '/x', stateFile: '/x/s.json' });
    expect(mac.state().canSignIn).toBe(true);
    expect(teamForWindow(mac.state(), false)).toMatchObject({ configured: false, canSignIn: true });
    const none = createTeamService({ session: { configured: false }, store: {}, disk: {}, accountRoot: '/x', stateFile: '/x/s.json' });
    expect(none.state().canSignIn).toBe(false);
  });
});

describe('what is drawn', () => {
  const page = read('renderer/src/team/SignInPage.tsx');
  const app = read('renderer/src/App.tsx');
  const nav = read('renderer/src/components/WorkspaceNavigation.tsx');

  it('"Skip for now" sits in the corner as a plain button with no key', () => {
    expect(page).toMatch(/className="si-skip-corner" onClick=\{onSkip\}>Skip for now<\/button>/);
    expect(page).not.toMatch(/<kbd/);
    // Escape only ever closes the closable kinds (cloud, phone), never skips.
    expect(page).not.toMatch(/key === 'Escape'[^\n]*onSkip/);
  });

  it('a skip is remembered on this computer, and signing in forgets it', () => {
    expect(SIGN_IN_SKIPPED).toMatch(/sign-in-skipped/);
    expect(app).toMatch(/localStorage\.setItem\(SIGN_IN_SKIPPED, '1'\)/);
    expect(app).toMatch(/if \(snap\?\.team\?\.signedIn\) \{[^}]*localStorage\.removeItem\(SIGN_IN_SKIPPED\)/);
  });

  it('the sidebar has a Sign in row above Feedback, and it brings the page back', () => {
    expect(nav.indexOf('<span>Sign in</span>')).toBeGreaterThan(-1);
    expect(nav.indexOf('<span>Sign in</span>')).toBeLessThan(nav.indexOf('<span>Feedback</span>'));
    expect(app).toMatch(/onSignIn=\{signInAsked\.sidebar \? askToSignIn : undefined\}/);
  });
});
