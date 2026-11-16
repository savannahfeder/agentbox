// SIGN OUT ON THE PHONE ASKS FIRST.
//
// In phone session m19 (2026-11-15) one tap on Sign out signed the tester out
// at once: drafts, the kept inbox and the alerts address all went, with no
// chance to take it back. Now the button opens a sheet, and only its Sign out
// signs out. React Native screens are not drawn here, so the source is read.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const home = fs.readFileSync(new URL('../mobile/src/ui/SettingsHome.tsx', import.meta.url), 'utf8');

describe('Sign out', () => {
  it('the button only opens the sheet', () => {
    expect(home).toMatch(/title="Sign out" onPress=\{\(\) => setAskingOut\(true\)\}/);
  });
  it('the sheet signs out, or leaves you signed in', () => {
    const sheet = home.slice(home.indexOf('<Sheet open={askingOut}'), home.indexOf('</Sheet>'));
    expect(sheet).toMatch(/label="Sign out" onPress=\{\(\) => \{ setAskingOut\(false\); c\.signOut\(\); router\.replace\('\/sign-in'\); \}\}/);
    expect(sheet).toMatch(/label="Stay signed in" onPress=\{\(\) => setAskingOut\(false\)\}/);
  });
  it('signs out nowhere else on the page', () => {
    expect(home.match(/c\.signOut\(\)/g)).toHaveLength(1);
  });
});
