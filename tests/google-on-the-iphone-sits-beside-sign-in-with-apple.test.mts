// GOOGLE ON THE IPHONE SITS BESIDE SIGN IN WITH APPLE (2026-11-09).
//
// Google came off the iPhone for App Review 4.8 on 2026-11-08: an app that
// signs in with Google must also offer a sign-in that keeps the email private,
// and Sign in with Apple had been taken out on 2026-11-04 (8f06d530). Most
// accounts were made with Google on the computer, so on App Store build 20 the
// person found no way in with it ("where is google auth sign in??"). An emailed
// sign-in link was tried in its place and dropped, because the account
// database may have no email service of its own to send it.
//
// The iPhone now offers Continue with Apple and Continue with Google under
// email and password. Apple shares the account's email unless the person hides
// it, and the database joins a shared email to the account the computer made.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (rel) => fs.readFileSync(new URL(`../mobile/${rel}`, import.meta.url), 'utf8');
const signIn = read('src/app/sign-in.tsx');
const platform = read('src/platform/sign-in.ts');
const config = read('app.config.ts');

describe('the sign-in screen', () => {
  it('offers Google on every phone, not only Android', () => {
    expect(signIn).not.toMatch(/Platform\.OS === 'android'/);
    expect(signIn).toMatch(/label=\{busy === 'google' \? 'Signing in…' : 'Continue with Google'\}/);
  });
  it('offers Apple wherever the phone has it, above Google', () => {
    const apple = signIn.indexOf("'Continue with Apple'");
    expect(apple).toBeGreaterThan(-1);
    expect(apple).toBeLessThan(signIn.indexOf("'Continue with Google'"));
    expect(signIn).toMatch(/appleAvailable\(\)/);
    expect(signIn).toMatch(/run\('apple', \(\) => appleSignIn\(c\.cloud!\)\)/);
  });
  it('keeps email and password first, and Forgot password?', () => {
    expect(signIn.indexOf("busy === 'email'")).toBeLessThan(signIn.indexOf("'Continue with Apple'"));
    expect(signIn).toMatch(/Forgot password\?/);
  });
  it('treats Apple’s own Cancel as no error', () => {
    expect(signIn).toMatch(/ERR_REQUEST_CANCELED/);
  });
});

describe('Sign in with Apple', () => {
  it('sends Apple’s token with the unhashed nonce Apple was asked with', () => {
    expect(platform).toMatch(/nonce: hashed/);
    expect(platform).toMatch(/signInWithIdToken\('apple', got\.identityToken, nonce\)/);
  });
  it('asks for the email, so the database can join it to the computer’s account', () => {
    expect(platform).toMatch(/AppleAuthenticationScope\.EMAIL/);
  });
  it('has its capability in the iPhone build', () => {
    expect(config).toMatch(/usesAppleSignIn: true/);
    expect(config).toMatch(/'expo-apple-authentication'/);
  });
});
