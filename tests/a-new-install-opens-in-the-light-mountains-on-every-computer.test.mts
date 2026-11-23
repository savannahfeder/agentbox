// A NEW INSTALL OPENS IN THE LIGHT MOUNTAINS, ON EVERY COMPUTER (w-9687db6270, 2026-11-22).
//
// The founder, on setup opening dark on a dark Mac: "I wanted this to actually
// open and go through the flow in light mode with our new theme for everyone
// until they get to the theme selection page, where they can change it." Until
// then a new install followed the computer's own light or dark (the owner,
// 2026-11-02), so a dark Mac saw the dark orange sky from the first page.
// Match my system is still a look to pick there
// (tests/match-my-system-shows-both-skies-it-switches-between).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeSavedLook, seedFirstRunLook, SKIN_KEY } from '../renderer/src/skins.ts';
import { shownSkyId, skyTheme, PLAIN } from '../renderer/src/home/sky.ts';
import { setupLook } from '../renderer/src/setup-split.ts';

const THEME_KEY = 'zero.theme';
const memory = (seed: Record<string, string> = {}) => { const m = new Map(Object.entries(seed)); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m }; };
const read = (f: string) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');

describe('the first look', () => {
  it('is light on a dark computer and on a light one', () => {
    for (const machine of ['light', 'dark'] as const) {
      const s = memory();
      normalizeSavedLook(s, machine);
      expect(s.m.get(THEME_KEY)).toBe('light');
      expect(s.m.get(SKIN_KEY)).toBe('none');
      expect(seedFirstRunLook(memory(), THEME_KEY, machine)).toEqual({ theme: 'light', skin: 'none' });
    }
  });
  it('wears the mountains, since no sky was picked', () => {
    expect(skyTheme(shownSkyId(null, false))?.name).toBe('Light orange mountains');
  });
  it('is written before the first paint, with the setup behind it', () => {
    expect(read('renderer/src/main.tsx')).toMatch(/normalizeSavedLook\(localStorage, machineTheme\(\)\)/);
    expect(read('renderer/src/App.tsx')).toMatch(/seedFirstRunLook\(localStorage, THEME_KEY, machineTheme\(\)\)/);
  });
});

describe('the setup\'s look page', () => {
  it('ticks the light mountains, which is what is on', () => {
    expect(setupLook({ skies: true, picked: false, worn: 'mountains', light: true, follows: false })).toBe('mountains');
  });
  it('ticks Match my system for somebody who picked to follow the computer', () => {
    expect(setupLook({ skies: true, picked: false, worn: 'ember', light: false, follows: true })).toBe('match');
  });
  it('is told whether the window follows the computer', () => {
    expect(read('renderer/src/App.tsx')).toMatch(/follows: theme === 'match'/);
  });
});

describe('a look somebody already had', () => {
  it('stays what it was set to, whatever the computer does later', () => {
    for (const seed of [{ [THEME_KEY]: 'light', [SKIN_KEY]: 'none' }, { [THEME_KEY]: 'match', [SKIN_KEY]: 'none' }, { [THEME_KEY]: 'dark', [SKIN_KEY]: 'ember-grid' }]) {
      const s = memory(seed);
      normalizeSavedLook(s, 'dark');
      expect(s.m.get(THEME_KEY)).toBe(seed[THEME_KEY as keyof typeof seed]);
      expect(seedFirstRunLook(memory(seed), THEME_KEY, 'dark')).toBeNull();
    }
    expect(shownSkyId(PLAIN, false)).toBeNull();
  });
});
