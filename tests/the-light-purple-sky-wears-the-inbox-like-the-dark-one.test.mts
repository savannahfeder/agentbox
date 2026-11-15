// The light purple sky wears the Inbox the way the dark purple one does
// (w-bd2cd91875). Before, a light theme's Inbox had no sky at all, and the
// "Light purple sky" read pink-red on Home: its core was [240, 90, 160]
// against the dark sky's violet. A pale lilac redo still read "pink and fake":
// its soft glow and dots faded toward white went pastel. Measured by drawing
// each in the app window. The green light sky stays off the Inbox.
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { skyTheme, wearsInboxSky } from '../renderer/src/home/sky.ts';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../renderer/src/home/home.css', import.meta.url), 'utf8');
const hue = ([r, g, b]: number[]) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};

describe('the light purple sky', () => {
  const lilac = skyTheme('dusk-light')!;

  it('wears the Inbox, Team and Files', () => {
    expect(wearsInboxSky(lilac)).toBe(true);
    expect(app).toMatch(/const skyOnInbox = wearsInboxSky\(sky\) && !homeShown/);
    expect(app).toMatch(/const skyOnPlace = wearsInboxSky\(sky\) && !onPhone\(\)/);
  });

  it('is a deep purple, not pink', () => {
    for (const c of [lilac.art.palette.core, lilac.art.palette.halo, lilac.art.palette.hot]) {
      expect(hue(c)).toBeGreaterThan(250);
      expect(hue(c)).toBeLessThan(300);
    }
    expect(hue([240, 90, 160])).toBeGreaterThan(300); // the first light purple's core fails the same bound
    expect(lilac.art.lightDepth).toBeLessThanOrEqual(130);
  });

  it('has no soft glow or grey specks, and its faint dots stay deep', () => {
    expect(lilac.art.glow ?? []).toEqual([]);
    expect(lilac.art.grain).toBe(0);
    expect(lilac.art.ink).toBe(true);
  });

  it('fills Home above its line, which the inbox header keeps tight', () => {
    // Home's sky was only a thin line across the page; dots now spread above it, a little below.
    const home = lilac.home!;
    expect(home.palette).toEqual(lilac.art.palette);
    expect(home.haloW!).toBeGreaterThanOrEqual(lilac.art.haloW! * 2.5);
    expect(home.below!).toBeGreaterThan(0);
    expect(home.below!).toBeLessThan(0.5);
    expect(lilac.art.below).toBeUndefined();
    expect(app).toContain('<SkyBackdrop art={sky.home ?? sky.art}');
  });

  it('sits on the white card', () => {
    expect(lilac.art.bg).toBe('#ffffff');
    expect(css).not.toContain('--sky-card');
  });
});

describe('the other skies', () => {
  it('the green light sky keeps the Inbox plain', () => {
    expect(wearsInboxSky(skyTheme('sage'))).toBe(false);
  });
  it('every dark sky still wears it', () => {
    for (const id of ['dusk', 'ember', 'aurora']) expect(wearsInboxSky(skyTheme(id))).toBe(true);
  });
  it('no sky, no Inbox sky', () => {
    expect(wearsInboxSky(null)).toBe(false);
  });
});
