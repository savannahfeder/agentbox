// THE IPHONE SIGN-IN OFFERS NO GOOGLE, SO APP REVIEW NEEDS NO SECOND SIGN-IN.
//
// App Review guideline 4.8: an app that signs people in with Google must also
// offer a sign-in that hides the person's email. Sign in with Apple was that
// option until it was taken out (8f06d530, the computer cannot sign in with
// it), which left Google alone beside email and password. Claude and Codex,
// each reading the app as an App Store reviewer on 2026-11-08, rated it a
// likely rejection. An app that signs in only with its own accounts is exempt,
// so the iPhone offers email and password, and Google stays on Android. A
// Google account sets a password once with Forgot password?.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const signIn = fs.readFileSync(new URL('../mobile/src/app/sign-in.tsx', import.meta.url), 'utf8');
const googleAt = signIn.indexOf('Continue with Google');

describe('the sign-in page', () => {
  it('draws Google only on Android', () => {
    expect(signIn).toMatch(/const GOOGLE = Platform\.OS === 'android';/);
    const before = signIn.slice(0, googleAt);
    expect(before.slice(before.lastIndexOf('{GOOGLE'))).toMatch(/^\{GOOGLE \? </);
  });
  it('draws the "or" between them only with Google', () => {
    const gate = signIn.slice(signIn.indexOf('{GOOGLE'), googleAt);
    expect(gate).toMatch(/<Label>or<\/Label>/);
  });
  it('still signs in with email and password everywhere, and keeps Forgot password?', () => {
    expect(signIn.slice(0, signIn.indexOf('{GOOGLE'))).toMatch(/kind="primary" label=\{busy === 'email'/);
    expect(signIn).toMatch(/Forgot password\?/);
  });
});
