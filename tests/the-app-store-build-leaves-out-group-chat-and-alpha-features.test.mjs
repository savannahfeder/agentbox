// THE APP STORE BUILD LEAVES OUT GROUP CHAT AND ALPHA FEATURES.
//
// App Review guideline 1.2: an app where people message each other must let
// them report a message, block a person and filter what is posted. The phone's
// group chat (Groups, under Rooms) has none of these yet. Guideline 2.2 turns
// away unfinished features in a store app, and the phone's Settings had an
// "Alpha features" page saying "Early features you can try before they are
// finished". Guideline 2.5.19 forbids features review cannot see, so neither
// may wait in the store build behind a switch on the computer. Claude and
// Codex, reading the app as an App Store reviewer on 2026-11-08, both rated
// these likely rejections. The `store` build profile sets
// EXPO_PUBLIC_STORE_BUILD, and a build made with it never draws either.
// TestFlight builds from the `production` profile keep both.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const eas = JSON.parse(read('mobile/eas.json'));

describe('the store build profile', () => {
  it('is the production build with the store switch set', () => {
    expect(eas.build.store.extends).toBe('production');
    expect(eas.build.store.env.EXPO_PUBLIC_STORE_BUILD).toBe('1');
  });
  it('the production profile that TestFlight builds use does not set it', () => {
    expect(eas.build.production.env?.EXPO_PUBLIC_STORE_BUILD).toBeUndefined();
  });
  it('submits to the same App Store Connect app', () => {
    expect(eas.submit.store.extends).toBe('production');
    expect(eas.submit.production.ios.ascAppId).toBe('6826402748');
  });
});

describe('a store build', () => {
  it('reads the switch the way Metro writes it into the bundle', () => {
    expect(read('mobile/src/lib/store-build.ts')).toMatch(/export const STORE_BUILD = process\.env\.EXPO_PUBLIC_STORE_BUILD === '1';/);
  });
  // A reviewer on the board (2026-11-08) found AI teammates, also an Alpha
  // feature, would still appear once a computer switched them on.
  it('never shows AI teammates either, whatever the computer says', () => {
    expect(read('mobile/src/state/cloud.tsx')).toMatch(/const team = useMemo\(\(\) => \(STORE_BUILD \? null : /);
  });
  it('never turns group chat on, whatever the computer says', () => {
    expect(read('mobile/src/state/groups.tsx')).toMatch(/setOn\(!STORE_BUILD && groupsOn\(rows\)\)/);
  });
  // The app review board (2026-11-08) still reached it through Search, which
  // lists every page, so the page is left out of the list itself.
  it('has no Alpha features page anywhere: Settings, Search, or its own address', () => {
    const pages = read('mobile/src/ui/SettingsPages.tsx');
    expect(pages).toMatch(/export const SETTINGS_PAGES = STORE_BUILD \? ALL_PAGES\.filter\(\(p\) => !NOT_IN_STORE\.has\(p\.id\)\) : ALL_PAGES;/);
    // The Team page too: shared projects come with multiplayer (round three, 2026-11-08).
    expect(pages).toMatch(/const NOT_IN_STORE = new Set\(\['alpha', 'team'\]\);/);
    for (const reader of ['mobile/src/app/search.tsx', 'mobile/src/app/settings/[page].tsx', 'mobile/src/app/settings/index.tsx', 'mobile/src/ui/SettingsHome.tsx']) {
      const text = read(reader);
      expect(text, reader).toMatch(/SETTINGS_PAGES/);
      expect(text, reader).not.toMatch(/ALL_PAGES/);
    }
  });
});
