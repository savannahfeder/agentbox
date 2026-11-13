// BACK CLOSES THE PHONE'S VIEW MENU AND STAYS IN THE APP (QA batch 014, M-48,
// native Android).
//
// With View and filters open on the inbox, the system Back button sent the app
// to the home screen, 5 of 5 times, and the menu was still open on return. The
// menu is a view over the list, not a Modal, so nothing answered Back; the
// sheets that did close on Back are Modals with onRequestClose. React Native
// screens are not drawn here, so the test reads the source.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p: string) => fs.readFileSync(new URL(`../mobile/src/${p}`, import.meta.url), 'utf8');
const filters = read('ui/Filters.tsx');
const menu = filters.slice(filters.indexOf('export function ViewMenu('));
const inbox = read('app/index.tsx');

describe('View and filters on Android', () => {
  it('closes on Back, and Back is not passed on to leave the app', () => {
    expect(menu).toMatch(/BackHandler\.addEventListener\('hardwareBackPress', \(\) => \{ close\(\); return true; \}\)/);
  });

  it('lets Back leave the inbox again once the menu is gone', () => {
    expect(menu).toMatch(/return \(\) => sub\.remove\(\)/);
    // Mounted only while open, so its handler cannot outlive it.
    expect(inbox).toMatch(/\{menu && <ViewMenu /);
  });
});
