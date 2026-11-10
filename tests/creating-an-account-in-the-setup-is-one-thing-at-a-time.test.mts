// CREATING AN ACCOUNT IN THE SETUP IS ONE THING AT A TIME (w-fbe5e95dea, 2026-11-10).
//
// The founder on the setup's account step: "def feels a bit cluttered.
// Oftentimes these onboarding flows will be very fluid. They'll give you the
// choice of continuing with Google at the beginning or not, and maybe the
// first thing is that they ask you for your name." It showed Google, a
// divider, three fields, a button, the terms and a switch at once. Now the
// first screen is Google or email, and each field after it is its own screen,
// with Back going one screen back.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { nextSignUpPart, SIGN_UP_PARTS } from '../renderer/src/team/sign-up-parts.ts';

const page = fs.readFileSync(new URL('../renderer/src/team/SignInPage.tsx', import.meta.url), 'utf8');
const split = fs.readFileSync(new URL('../renderer/src/components/SetupSplit.tsx', import.meta.url), 'utf8');

describe('the parts of a sign-up', () => {
  it('go Google or email, then name, then email, then password', () => {
    expect(SIGN_UP_PARTS).toEqual(['start', 'name', 'email', 'password']);
    expect(nextSignUpPart('start', 1)).toBe('name');
    expect(nextSignUpPart('name', 1)).toBe('email');
    expect(nextSignUpPart('email', 1)).toBe('password');
  });
  it('go back one at a time, and out of the step from the first', () => {
    expect(nextSignUpPart('password', -1)).toBe('email');
    expect(nextSignUpPart('name', -1)).toBe('start');
    expect(nextSignUpPart('start', -1)).toBe(null);
    expect(nextSignUpPart('password', 1)).toBe(null);
  });
});

describe('the setup account step', () => {
  it('draws one field at a time', () => {
    expect(page).toMatch(/if \(inSetup && mode === 'sign-up'\) \{/);
    expect(page).toMatch(/part === 'start'[\s\S]{0,400}Continue with email/);
  });
  it('lets the sign-in page own Back and Enter on this step', () => {
    expect(split).toMatch(/<SignInPage purpose="team" startOn="sign-up" inSetup onSignedIn=\{next\} onBack=\{back \?\? undefined\} primaryRef=\{accountPrimary\} \/>/);
    expect(split).toMatch(/\{back && step !== 'account' && <button type="button" className="ss-back"/);
  });
  it('gives a step that draws no button of its own no stale Enter', () => {
    expect(split).toMatch(/primary\.current = step === 'account' \? \(\) => accountPrimary\.current\?\.\(\) : \(\) => \{\};/);
  });
});
