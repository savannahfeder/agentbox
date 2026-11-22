// A NEW INSTALL STARTS IN THE COMPUTER'S OWN LIGHT OR DARK.
//
// The owner, 2026-11-02: "make sure the default theme matches the user's
// operating system theme. If I'm in light mode, it should default to light
// mode. If I'm in dark mode, it should default to dark mode unless they change
// it in settings. When they first sign in, that determines which mode they're
// in." A fresh install was always seeded Dark, whatever the computer said.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeSavedLook, seedFirstRunLook, SKIN_KEY, DEFAULT_SKIN } from '../renderer/src/skins.ts';

const THEME_KEY = 'zero.theme';
const memory = (seed = {}) => { const m = new Map(Object.entries(seed)); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m }; };
const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');

describe('the first look', () => {
  // It follows the computer from then on, until a look is picked, since
  // w-fbe5e95dea (tests/a-new-install-follows-the-mac-until-a-look-is-picked).
  it('is the computer own light or dark, on either', () => {
    for (const machine of ['light', 'dark']) {
      const s = memory();
      normalizeSavedLook(s, machine);
      expect(s.m.get(THEME_KEY)).toBe('match');
      expect(seedFirstRunLook(memory(), THEME_KEY, machine)).toEqual({ theme: 'match', skin: 'none' });
    }
  });

  it('then stays what it was set to, whatever the computer does later', () => {
    const s = memory({ [THEME_KEY]: 'light', [SKIN_KEY]: 'none' });
    normalizeSavedLook(s, 'dark');
    expect(s.m.get(THEME_KEY)).toBe('light');
    expect(seedFirstRunLook(s, THEME_KEY, 'dark')).toBeNull();
  });

  it('reads the computer where the app starts', () => {
    expect(read('renderer/src/main.tsx')).toMatch(/normalizeSavedLook\(localStorage, machineTheme\(\)\)/);
    expect(read('renderer/src/App.tsx')).toMatch(/seedFirstRunLook\(localStorage, THEME_KEY, machineTheme\(\)\)/);
  });
});
