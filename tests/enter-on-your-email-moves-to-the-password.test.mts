// ENTER ON YOUR EMAIL MOVES TO THE PASSWORD (w-1e52420829, 2026-11-12).
//
// Creating an account in the setup, a new user typed an email and pressed
// Enter. The screen answered "Use a password of at least 6 characters" in red
// and left the caret in the email field, so the password they typed next went
// into the email box. Measured by walking the first run by keyboard on a
// throwaway copy: the plan step never came.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { goesToPassword, partMissing } from '../renderer/src/team/sign-up-parts.ts';

const page = fs.readFileSync(new URL('../renderer/src/team/SignInPage.tsx', import.meta.url), 'utf8');
const gap = (email: string, password: string) => partMissing('login', { name: 'Sam Rivera', email, password });

describe('Enter in the email field', () => {
  it('goes to the password when the email is good and no password is typed yet', () => {
    expect(goesToPassword(gap('sam@example.com', ''), '', true)).toBe(true);
  });
  it('still names a short password: something was typed, and it is not enough', () => {
    expect(goesToPassword(gap('sam@example.com', '12345'), '12345', true)).toBe(false);
  });
  it('still names an email that is empty or not whole', () => {
    expect(goesToPassword(gap('', ''), '', true)).toBe(false);
    expect(goesToPassword(gap('sam', ''), '', true)).toBe(false);
  });
  it('is not what a press from the password field or the button is: that one is told', () => {
    expect(goesToPassword(gap('sam@example.com', ''), '', false)).toBe(false);
  });
  it('has nothing to do once both are ready', () => {
    expect(goesToPassword(gap('sam@example.com', '123456'), '123456', true)).toBe(false);
  });
});

describe('the setup account step', () => {
  it('puts the caret in the field it is waiting on, with or without the red line', () => {
    expect(page).toMatch(/if \(!goesToPassword\(gap, password, document\.activeElement === emailField\.current\)\) setMissing\(gap\);\s*if \(gap\) fieldOf\[gap\.field\]\.current\?\.focus\(\);/);
  });
});
