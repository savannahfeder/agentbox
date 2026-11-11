// A NEW INSTALL FOLLOWS THE MAC UNTIL A LOOK IS PICKED (w-fbe5e95dea, 2026-11-10).
//
// The founder switched macOS to light during the first run, and Agentbox
// stayed dark. A new install saved "dark" the moment it opened, and the setup
// then pinned the dark orange sky, so neither followed the Mac again. A new
// install now saves "match" and no sky, which wears dark orange on a dark Mac
// and light green on a light one, until somebody picks a look of their own.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { normalizeSavedLook, seedFirstRunLook, SKIN_KEY } from '../renderer/src/skins.ts';
import { PLAIN, shownSkyId } from '../renderer/src/home/sky.ts';

const memory = (seed: Record<string, string> = {}) => { const m = new Map(Object.entries(seed)); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m }; };

describe('the first look', () => {
  it('is saved as following the Mac, on a dark Mac and a light one', () => {
    for (const machine of ['dark', 'light'] as const) {
      const s = memory();
      expect(seedFirstRunLook(s, 'zero.theme', machine)).toEqual({ theme: 'match', skin: 'none' });
      expect(s.m.get('zero.theme')).toBe('match');
      expect(s.m.get(SKIN_KEY)).toBe('none');
    }
  });
  it('is what the app saves when it first starts, before the setup runs', () => {
    for (const machine of ['dark', 'light'] as const) {
      const s = memory();
      normalizeSavedLook(s, machine);
      expect(s.m.get('zero.theme')).toBe('match');
      expect(s.m.get(SKIN_KEY)).toBe('none');
    }
  });
  it('leaves a look somebody already picked alone', () => {
    expect(seedFirstRunLook(memory({ 'zero.theme': 'light' }), 'zero.theme', 'dark')).toBeNull();
  });
});

describe('the sky that follows the Mac', () => {
  // Main's rule (w-1bf65f4322): with no sky saved, the window wears dark orange
  // in the dark and light green in the light. Match my system is that rule.
  it('is dark orange on a dark Mac and light green on a light one', () => {
    expect(shownSkyId(null, true)).toBe('ember');
    expect(shownSkyId(null, false)).toBe('sage');
  });
  it('leaves a picked sky as it is, and plain Light or Dark with no sky', () => {
    expect(shownSkyId('dusk', true)).toBe('dusk');
    expect(shownSkyId(PLAIN, true)).toBe(null);
  });
});

describe('the app', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  it('chooses Match my system by saving no sky, so the default follows the Mac', () => {
    expect(app).toMatch(/if \(id === MATCH_SKY\) \{ setHomeSetting\(SKY_THEME_KEY, null\); setLook\('match'\); return; \}/);
  });
  it('no longer pins a sky when the setup opens', () => {
    expect(app).not.toMatch(/setupStartsOn/);
  });
});
