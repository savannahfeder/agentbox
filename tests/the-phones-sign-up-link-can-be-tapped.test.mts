// THE PHONE'S SIGN UP LINK CAN BE TAPPED (QA M-34 and M-45, 2026-11-06 to 11-10).
//
// On Android, Sign in's "Sign up" and "Make your account on your computer" were
// links nested inside another line of text. The UI tree gave both no bounds
// ([0,0][0,0]), so nothing could tap them, while "Forgot password?", a line of
// its own, worked. After a wrong password the error and the second link sat at
// the foot of the scrolling part, under the fixed buttons: their bounds came
// back clipped (bottom above top) and a tap on the link landed on the buttons.
//
// Each link is now its own element, and the error and the link to make an
// account sit with the Sign in button, outside the scrolling part.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const signIn = fs.readFileSync(new URL('../mobile/src/app/sign-in.tsx', import.meta.url), 'utf8');
const foot = signIn.slice(signIn.indexOf('foot={'), signIn.indexOf('</>}>'));
const scrolled = signIn.slice(signIn.indexOf('</>}>'));

describe('Sign in on the phone', () => {
  it('never nests a link inside another line of text', () => {
    // A <T> that opens, holds no closing tag, and then opens a <T onPress>.
    expect(signIn).not.toMatch(/<T\b[^>]*>(?:(?!<\/T>)[\s\S])*<T\b[^>]*onPress/);
  });

  it('offers Sign up as its own link, which opens the page about making an account', () => {
    expect(foot).toMatch(/<T onPress=\{toNoAccount\}[^>]*accessibilityRole="link"[^>]*>\{failed \? 'Make your account on your computer' : 'Sign up'\}<\/T>/);
  });

  it('keeps the error and the link to make an account with the Sign in button, not under it in the scroll', () => {
    expect(foot).toMatch(/accessibilityRole="alert"/);
    expect(foot.indexOf("'Sign in'")).toBeLessThan(foot.indexOf('accessibilityRole="alert"'));
    expect(scrolled).not.toMatch(/accessibilityRole="alert"/);
    expect(scrolled).not.toMatch(/toNoAccount/);
  });

  it('still keeps Forgot password? in the scroll, under the password', () => {
    expect(scrolled).toMatch(/Forgot password\?/);
  });
});
