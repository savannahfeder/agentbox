// THE PHONE'S SIGN-IN SCREENS SAY WHAT IS WRONG AND LET GO OF OLD ERRORS
// (QA M-38, M-40, M-44, native Android, 2026-11-07 to 11-10).
//
// Forgot password with the email left empty: Email me a link was drawn
// disabled and a tap did nothing at all (2 of 2). With "notanemail" the cloud's
// own words came back: "Unable to validate email address: invalid format".
// And on Sign in, "Invalid login credentials" stayed on screen after the email
// and password were corrected, and after the password was cleared (2 of 2).
// Measured from the testers' UI-tree dumps and by reading the two screens.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { BAD_EMAIL, NO_EMAIL, plainAuthError, resetEmailProblem } from '../mobile/src/lib/sign-in-words';

const reset = fs.readFileSync(new URL('../mobile/src/app/reset-password.tsx', import.meta.url), 'utf8');
const signIn = fs.readFileSync(new URL('../mobile/src/app/sign-in.tsx', import.meta.url), 'utf8');

describe('asking for a reset link', () => {
  it('with no email, asks for one', () => {
    expect(resetEmailProblem('')).toBe(NO_EMAIL);
    expect(resetEmailProblem('   ')).toBe(NO_EMAIL);
  });

  it('with something that is not an address, says so in plain words before asking the cloud', () => {
    expect(resetEmailProblem('notanemail')).toBe(BAD_EMAIL);
    expect(resetEmailProblem('me@example')).toBe(BAD_EMAIL);
  });

  it('with an address, lets it through, spaces round it and all', () => {
    expect(resetEmailProblem('me@example.com')).toBeNull();
    expect(resetEmailProblem('  me@example.com ')).toBeNull();
  });

  it('keeps the button pressable with the field empty, so the tap can answer', () => {
    expect(reset).not.toMatch(/disabled=\{!email\.trim\(\)/);
    expect(reset).toMatch(/resetEmailProblem\(email\)/);
  });
});

describe("the cloud's refusal", () => {
  it('reads as the plain sentence for a malformed address', () => {
    expect(plainAuthError('Unable to validate email address: invalid format')).toBe(BAD_EMAIL);
  });

  it('is left as it is when there is no plainer one', () => {
    expect(plainAuthError('For security purposes, you can only request this after 30 seconds.')).toMatch(/30 seconds/);
  });
});

describe('an error on Sign in', () => {
  it('goes as soon as the email or the password is edited', () => {
    expect(signIn).toMatch(/onChangeText=\{edited\(setEmail\)\}/);
    expect(signIn).toMatch(/onChangeText=\{edited\(setPassword\)\}/);
    expect(signIn).toMatch(/const edited = [^\n]*setError\(null\)/);
  });

  it('and so does it on the reset screen', () => {
    expect(reset).toMatch(/const typeEmail = [^\n]*setError\(null\)/);
    expect(reset).toMatch(/onChangeText=\{typeEmail\}/);
  });
});
