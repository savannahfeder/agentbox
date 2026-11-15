// THE SIDEBAR FOLDS UNTIL POINTED AT, UNLESS YOU KEEP IT OPEN.
//
// The app's sidebar is closed except on hover. A switch added on this branch
// kept it open unless a person turned folding on, so every screen came up with
// the words showing; the owner's words, 2026-11-01: "the sidebar is normally
// open in pics. that's not how our app works - sidebar is closed except on
// hover". Folding is the default again; the switch now keeps it open for whoever
// wants that.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SIDEBAR_SHRINKS_KEY, shrinksFrom, sidebarFolded } from '../renderer/src/sidebar-shrinks.ts';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');

describe('whether the sidebar folds when the pointer leaves', () => {
  it('does, as it comes, with nothing chosen', () => {
    expect(shrinksFrom(null)).toBe(true);
  });
  it('does for someone who left it on', () => {
    expect(shrinksFrom('1')).toBe(true);
  });
  it('does not for someone who chose to keep it open', () => {
    expect(shrinksFrom('0')).toBe(false);
  });
});

describe('whether the sidebar is folded to icons', () => {
  it('is, with the pointer away, as it comes', () => {
    expect(sidebarFolded({ phone: false, shrinks: shrinksFrom(null), pointedAt: false })).toBe(true);
  });
  it('opens under the pointer', () => {
    expect(sidebarFolded({ phone: false, shrinks: true, pointedAt: true })).toBe(false);
  });
  it('stays open for someone who keeps it open', () => {
    expect(sidebarFolded({ phone: false, shrinks: false, pointedAt: false })).toBe(false);
  });
  it('stays as a phone has it, narrow always', () => {
    expect(sidebarFolded({ phone: true, shrinks: false, pointedAt: false })).toBe(true);
  });
});

describe('the wiring', () => {
  it('the app asks this rule', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toMatch(/const sideFolded = sidebarFolded\(/);
    expect(app).toMatch(/gt-rail-open/);
  });
  it('a person chooses it in Settings, and it is kept on this computer', () => {
    expect(read('renderer/src/components/Settings.tsx')).toMatch(/useSidebarShrinks\(\)/);
    expect(SIDEBAR_SHRINKS_KEY).toBeTruthy();
  });
});
