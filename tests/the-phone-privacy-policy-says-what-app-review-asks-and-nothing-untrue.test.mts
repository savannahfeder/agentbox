// THE PHONE PRIVACY POLICY SAYS WHAT APP REVIEW ASKS, AND NOTHING UNTRUE.
//
// The app review board's third round (2026-11-08) read phone-legal/privacy.html
// against guideline 5.1.1(i). It was missing the promise that the companies
// receiving data protect it as the policy does, which the guideline asks a
// policy to confirm. It said nothing of the crash reports the phone sends, and
// it described signing in with Apple, which nothing offers since 8f06d530.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const policy = fs.readFileSync(new URL('../phone-legal/privacy.html', import.meta.url), 'utf8');

describe('the phone privacy policy', () => {
  it('confirms the companies that receive data protect it as the policy does', () => {
    expect(policy).toMatch(/protects it as this policy does or better/);
  });
  it('names the crash reports the phone sends, and the setting that stops them', () => {
    expect(policy).toMatch(/When the app crashes, it sends us a report/);
    expect(policy).toMatch(/Counts and crash reports/);
  });
  // Apple sign-in left the app in 8f06d530 and came back with the sign-in
  // screen's Apple and Google buttons; the policy follows the screen.
  it('describes sign-in with Apple and Google exactly when the iPhone offers them', () => {
    const screen = fs.readFileSync(new URL('../mobile/src/app/sign-in.tsx', import.meta.url), 'utf8');
    const says = /sign in with Apple/i.test(policy);
    expect(says).toBe(/appleSignIn\(/.test(screen));
    expect(/with Apple or Google/.test(policy)).toBe(/googleSignIn\(/.test(screen) && /appleSignIn\(/.test(screen));
  });
  it('still says how to delete the account and names the AI companies', () => {
    for (const words of ['Delete account', 'Anthropic', 'OpenAI', 'Supabase', 'Expo']) expect(policy).toContain(words);
  });
});
