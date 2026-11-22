// MATCH MY SYSTEM SHOWS BOTH SKIES IT SWITCHES BETWEEN (w-fbe5e95dea, 2026-11-10).
//
// The founder on the setup's look step: "this doesn't make sense. 'match my
// system' and it shows same one below". On a dark Mac its strip drew the dark
// orange sky and said "What you're using now", right above a row called Dark
// orange sky with the same strip. Match my system now draws the pair it
// switches between, dark orange and light green, and says so. It is always
// offered, first when nothing was picked, and the setup ticks it whenever no
// sky was picked (main's rule since w-1bf65f4322: no sky saved wears orange in
// the dark and green in the light).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { lookChoices, setupLook } from '../renderer/src/setup-split.ts';
import { MATCH_SKY } from '../renderer/src/home/sky.ts';

const split = fs.readFileSync(new URL('../renderer/src/components/SetupSplit.tsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../renderer/src/components/setup-split.css', import.meta.url), 'utf8');

describe('the look the setup ticks', () => {
  it('is Match my system when no sky was picked', () => {
    expect(setupLook({ skies: true, picked: false, worn: 'ember', light: false })).toBe(MATCH_SKY);
    expect(setupLook({ skies: true, picked: false, worn: 'sage', light: true })).toBe(MATCH_SKY);
  });
  it('is the sky somebody picked, even one of the pair', () => {
    expect(setupLook({ skies: true, picked: true, worn: 'ember', light: false })).toBe('ember');
    expect(setupLook({ skies: true, picked: true, worn: 'dusk', light: false })).toBe('dusk');
  });
  it('is plain Light or Dark once one of those was picked, or where there are no skies', () => {
    expect(setupLook({ skies: true, picked: false, worn: null, light: true })).toBe('light');
    expect(setupLook({ skies: false, picked: false, worn: null, light: false })).toBe('dark');
  });
});

describe('the looks offered', () => {
  it('put Match my system first when it is the look on', () => {
    expect(lookChoices(MATCH_SKY, true)).toEqual([MATCH_SKY, 'ember', 'dusk', 'aurora', 'sage', 'dusk-light', 'light', 'dark']);
  });
  it('still offer Match my system when a sky was picked, once and only once', () => {
    const out = lookChoices('dusk', true);
    expect(out[0]).toBe('dusk');
    expect(out.filter((l) => l === MATCH_SKY)).toHaveLength(1);
    expect(new Set(out).size).toBe(out.length);
  });
});

describe('the Match my system row', () => {
  it('draws the two skies it switches between, not the one on now', () => {
    expect(split).toMatch(/if \(look === MATCH_SKY\) return <span className="ss-strip ss-strip-pair"><SkyArt id="ember" \/><SkyArt id="sage" \/><\/span>;/);
    expect(css).toMatch(/\.setup-split \.ss-strip-pair \.ss-sky \+ \.ss-sky \{[^}]*clip-path: polygon/);
  });
  it('says what it does, and no row says it is the one in use', () => {
    expect(split).toMatch(/sub=\{id === MATCH_SKY \? 'Orange in dark mode, green in light' : undefined\}/);
    expect(split).not.toMatch(/What you’re using now/);
  });
});
