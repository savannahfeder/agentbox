// THE SETUP ASKS A NEW PERSON TO CREATE AN ACCOUNT, AND TO AGREE TO THE TERMS
// (w-fbe5e95dea, 2026-11-10).
//
// The founder on the setup's account step: it opened on Sign in for somebody
// who has never had an account ("Logically, you would show Create account"),
// it named no terms of service at all ("an absolutely critical issue"), and it
// looked nothing like the steps around it: uppercase tabs, a full-width orange
// button, a Back far below. The terms line was drawn only on the cloud's own
// card. Now the setup opens on Create account, every sign-up and every Google
// button on a team card names the Terms and the Privacy policy, and inside the
// setup the card wears the setup's own parts.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const page = read('renderer/src/team/SignInPage.tsx');
const split = read('renderer/src/components/SetupSplit.tsx');
const css = read('renderer/src/components/setup-split.css');

describe("the setup's account step", () => {
  it('opens on Create account', () => {
    expect(split).toMatch(/<SignInPage purpose="team" startOn="sign-up" inSetup onSignedIn=\{next\}/);
  });
  it('trades the tabs for one line that switches', () => {
    expect(page).toMatch(/\(mode === 'sign-in' \|\| mode === 'sign-up'\) && !inSetup && \(/);
    expect(page).toContain('Have an account?');
    expect(page).toContain('New here?');
  });
  it('is not an orange slab, and has no uppercase labels', () => {
    expect(css).toMatch(/\.setup-split \.ss-signin \.si-primary \{[^}]*background: var\(--ss-ground\)/);
    expect(css).toMatch(/\.setup-split \.ss-signin \.si-form label > span:first-child \{[^}]*text-transform: none/);
  });
});

describe('the terms', () => {
  it('are named on every sign-up', () => {
    expect(page).toMatch(/\{mode === 'sign-up' && \(\s*<p className="si-terms">By creating an account or continuing with Google, you agree to <TermsLinks \/>\.<\/p>/);
  });
  it('and under Google on a team sign-in, which can make an account too', () => {
    expect(page).toMatch(/\{!cloud && mode === 'sign-in' && \(\s*<p className="si-terms">By continuing, you agree to <TermsLinks \/>\.<\/p>/);
  });
});

describe("the setup's Back", () => {
  // "The back button on the sign-in page looks a little clunky": it sat 64px
  // under the step, which under the account form was a long way from anything.
  it('sits above the heading, small, with its arrow', () => {
    expect(css).toMatch(/\.setup-split \.ss-back \{ display: inline-flex; margin: 0 0 18px -6px;/);
    expect(split.indexOf('className="ss-back"')).toBeLessThan(split.indexOf('<h1 className="ss-h">'));
    expect(split).toMatch(/className="ss-back" onClick=\{back\}><svg/);
  });
});

describe("the account step's heading", () => {
  it('is two lines like every other step, not the sign-in page own', () => {
    expect(page).toContain("<h1 className=\"ss-h\"><b>{mode === 'sign-up' ? 'Create your account.' : 'Sign in.'}</b>");
  });
});
