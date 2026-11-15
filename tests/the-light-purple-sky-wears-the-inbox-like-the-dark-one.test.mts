// The light purple sky wears the Inbox the way the dark purple one does
// (w-bd2cd91875). Before, a light theme's Inbox had no sky at all, and the
// "Light purple sky" read pink-red on Home: its core was [240, 90, 160]
// against the dark sky's violet. Measured by drawing both in the app window.
// The green light sky, the default for anyone in light, stays off the Inbox.
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

  it('is violet, not pink', () => {
    for (const c of [lilac.art.palette.core, lilac.art.palette.halo]) {
      expect(hue(c)).toBeGreaterThan(240);
      expect(hue(c)).toBeLessThan(300);
    }
    expect(hue([240, 90, 160])).toBeGreaterThan(300); // the old pink core fails the same bound
  });

  it('draws on a pale lilac card the sky fades into', () => {
    expect(lilac.card).toBe(lilac.art.bg);
    expect(lilac.art.lightBg).toEqual([247, 245, 252]);
    expect(css).toMatch(/\[data-sky-frame\] \.app\.workspace-layout::before \{ background: var\(--sky-card, /);
    expect(app).toContain("root.style.setProperty('--sky-card', sky.card)");
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
