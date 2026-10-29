// THE PHONE APP'S SETTINGS OPENS ON A LIST OF THE DESKTOP'S PAGES.
//
// Settings on the phone showed two rows, sign out and alerts, against the
// desktop's fourteen pages ("Settings also only shows two things rather than
// the full coherent settings", 2026-10-21). Five layouts were drawn; the one
// chosen on 2026-10-22 is a list of pages you tap into, in the desktop's order
// and groups (renderer/src/settings-search.ts). The page about the Mac's own
// keys stays off the phone, and so does Cloud, whose plans carry prices the App
// Store build may not show (docs/mobile/PLAN.md, 3.1). Appearance was off too
// until 2026-10-29, when "lots of stuff I can't do on mobile, like update the
// appearance" put it on, for the phone's own look
// (the-phone-app-changes-its-look-and-reaches-more-of-your-settings).
// The screens are React Native, which these tests do not draw, so they read
// the sources.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { SETTINGS_PAGES as DESKTOP } from '../renderer/src/settings-search';

const pages = fs.readFileSync(new URL('../mobile/src/ui/SettingsPages.tsx', import.meta.url), 'utf8');
const phone = [...pages.matchAll(/\{ id: '([\w-]+)', label: '([^']+)', group: '(\w+)'/g)].map(([, id, label, group]) => ({ id, label, group }));
const OFF_THE_PHONE = ['shortcuts', 'cloud', 'rooms'];

describe('the pages', () => {
  it('are the desktop\'s, in its order, under its groups, with its names', () => {
    expect(phone.length).toBeGreaterThan(0);
    expect(phone).toEqual(DESKTOP.filter((p) => !OFF_THE_PHONE.includes(p.id)).map(({ id, label, group }) => ({ id, label, group })));
  });

  it('leave out the Mac\'s own keys, and the plans with prices', () => {
    for (const id of OFF_THE_PHONE) expect(phone.map((p) => p.id)).not.toContain(id);
    expect(pages).not.toMatch(/\$\d/);
  });
});

describe('the layout chosen', () => {
  it('opens on the list, and each page is its own screen', () => {
    const dir = new URL('../mobile/src/app/settings/', import.meta.url);
    // feedback.tsx is opened from General's Feedback row and is not one of the desktop's pages.
    expect(fs.readdirSync(dir).sort()).toEqual(['[page].tsx', '_layout.tsx', 'feedback.tsx', 'index.tsx', 'project']);
    expect(fs.readFileSync(new URL('index.tsx', dir), 'utf8')).toMatch(/<PageList \/>/);
    expect(fs.readFileSync(new URL('../mobile/src/ui/SettingsHome.tsx', import.meta.url), 'utf8')).toMatch(/router\.push\(`\/settings\/\$\{p\.id\}`\)/);
  });
});
