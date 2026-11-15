// AN ACCOUNT NO COMPUTER HAS JOINED REACHES DELETE ACCOUNT FROM THE PHONE.
//
// App Review guideline 5.1.1(v) wants account deletion inside the app. It is in
// Settings › General, but an account no computer had sent anything saw only
// "Waiting for your computer", whose one button signs out: no way to Settings,
// so no way to delete it. Claude and Codex, reading the app as an App Store
// reviewer on 2026-11-08, both found it. The waiting screen now opens Settings,
// whose General page (Delete account, the privacy policy) is drawn with no
// computer.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../mobile/src/${p}`, import.meta.url), 'utf8');
const onboarding = read('ui/Onboarding.tsx');
const waiting = onboarding.slice(onboarding.indexOf('export function ComputerWait'), onboarding.indexOf('export const leaveSetup'));

describe('waiting for your computer', () => {
  it('opens Settings', () => {
    expect(waiting).toMatch(/label="Settings" onPress=\{\(\) => router\.push\('\/settings'\)\}/);
  });
  it('still offers another account', () => {
    expect(waiting).toMatch(/Use another account/);
  });
});

describe('Settings with no computer', () => {
  const pages = read('ui/SettingsPages.tsx');
  it('draws General, which deletes the account and links the privacy policy', () => {
    expect(pages).toMatch(/\{ id: 'general', label: 'General', group: 'Personal', Body: General, shown: \(\) => true \}/);
    const general = pages.slice(pages.indexOf('function General()'), pages.indexOf('function Swatch'));
    expect(general).toMatch(/Delete account/);
    expect(general).toMatch(/Privacy policy/);
  });
  it('draws Delete account before anything that needs the computer\'s settings', () => {
    const general = pages.slice(pages.indexOf('function General()'), pages.indexOf('function Swatch'));
    expect(general.indexOf('Delete account')).toBeLessThan(general.indexOf('{w ? ('));
  });
});
