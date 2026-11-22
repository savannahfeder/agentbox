// AN EMPTY PASSWORD FIELD LOOKS EMPTY (w-3814e4435c, 2026-11-16).
//
// The setup's "Your email and a password." screen put eight bullets in the
// empty Password field as its placeholder. A tester on a fresh install took
// them for a typed password, tried several times, and sat on a dimmed Create
// account button. Measured on the built renderer: the empty field and one
// holding a nine-character password were nearly the same picture. The label
// above the field already says Password, so the field carries no placeholder.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../renderer/src/team/SignInPage.tsx', import.meta.url), 'utf8');

describe('the password fields on the sign-in page', () => {
  it('draw no bullets when nothing is typed', () => {
    expect(page).not.toMatch(/[•●∙·*]{3,}/);
  });
  it('give the setup’s password field no placeholder, under its Password label', () => {
    expect(page).toMatch(/passwordField\('new-password', 'Password'\)\}\s*<\/>\}/);
    expect(page).not.toMatch(/placeholder=\{placeholder\}/);
  });
  it('still name the email field by example, which is not a password', () => {
    expect(page).toMatch(/placeholder="you@company\.com"/);
  });
});
