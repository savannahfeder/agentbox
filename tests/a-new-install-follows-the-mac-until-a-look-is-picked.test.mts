// A NEW INSTALL FOLLOWS THE MAC UNTIL A LOOK IS PICKED (w-fbe5e95dea, 2026-11-10).
//
// The founder switched macOS to light during the first run, and Agentbox
// stayed dark. A new install saved "dark" the moment it opened, and the setup
// then pinned the dark orange sky, so neither followed the Mac again. A new
// install now saves "match" with a sky that pairs dark orange on a dark Mac
// with light green on a light one, until somebody picks a look of their own.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { normalizeSavedLook, seedFirstRunLook, SKIN_KEY } from '../renderer/src/skins.ts';
import { MATCH_SKY, wornSky } from '../renderer/src/home/sky.ts';
import { setupStartsOn } from '../renderer/src/setup-split.ts';

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
  it('is dark orange on a dark Mac and light green on a light one', () => {
    expect(wornSky(MATCH_SKY, true)?.id).toBe('ember');
    expect(wornSky(MATCH_SKY, false)?.id).toBe('sage');
  });
  it('leaves a picked sky as it is, worn only in its own light or dark', () => {
    expect(wornSky('dusk', true)?.id).toBe('dusk');
    expect(wornSky('dusk', false)).toBeNull();
    expect(wornSky(null, true)).toBeNull();
  });
  it('is what the setup starts in when nobody has picked one', () => {
    expect(setupStartsOn({ sky: null, dark: true })).toBe(MATCH_SKY);
    expect(setupStartsOn({ sky: null, dark: false })).toBe(MATCH_SKY);
    expect(setupStartsOn({ sky: 'dusk', dark: true })).toBe(null);
  });
});

describe('the app', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  it('wears the sky through wornSky, so a Mac that flips takes the sky with it', () => {
    expect(app).toMatch(/const sky = homeOn \? wornSky\(homeSet\.skyTheme, darkWindow\) : null;/);
  });
  it('chooses the pair as Match my system', () => {
    expect(app).toMatch(/if \(id === MATCH_SKY\) \{ setLook\('match'\); setHomeSetting\(SKY_THEME_KEY, MATCH_SKY\); return; \}/);
  });
});
