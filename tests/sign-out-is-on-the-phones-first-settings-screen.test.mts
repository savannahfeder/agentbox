// SIGN OUT IS ON THE PHONE'S FIRST SETTINGS SCREEN (2026-11-08).
//
// On App Store build 20 the person took several minutes to find Sign out: it
// was a small button on the "Signed in as" row inside Settings › General, and
// the first Settings screen showed only the email beside General. Now the
// account and its Sign out are the first plate Settings opens on, and General
// keeps only Delete account. React Native screens are not drawn here, so the
// sources are read.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (rel) => fs.readFileSync(new URL(`../mobile/src/${rel}`, import.meta.url), 'utf8');

describe('the first Settings screen', () => {
  const home = read('ui/SettingsHome.tsx');
  it('draws the account with Sign out before the pages', () => {
    const account = home.indexOf('title="Sign out"');
    expect(account).toBeGreaterThan(-1);
    expect(account).toBeLessThan(home.indexOf('GROUPS.map'));
  });
  it('signs out and goes to sign-in', () => {
    expect(home).toMatch(/c\.signOut\(\);\s*router\.replace\('\/sign-in'\)/);
  });
  it('no longer puts the email beside General, which only repeated it', () => {
    expect(home).not.toMatch(/id === 'general'\) return email/);
  });
});

describe('General', () => {
  it('has Delete account and no second Sign out', () => {
    const pages = read('ui/SettingsPages.tsx');
    expect(pages).toMatch(/label="Delete account"/);
    expect(pages).not.toMatch(/title="Sign out"/);
  });
});
