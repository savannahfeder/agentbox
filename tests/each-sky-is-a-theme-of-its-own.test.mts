// Each sky is a theme of its own (Home, Alpha features), picked beside Light,
// Dark and Match system in Settings and in Command-K, with no separate Sky
// setting. Only the light skies the founder approved are offered, and the dark
// card is a step off black so the Inbox stays easy to read.
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { SKY_THEMES, skyTheme } from '../renderer/src/home/sky.ts';

const settings = fs.readFileSync(new URL('../renderer/src/components/Settings.tsx', import.meta.url), 'utf8');
const luminance = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255); };

describe('the sky themes', () => {
  it('are the three dark skies and the two approved light ones', () => {
    expect(SKY_THEMES.map((k) => k.id)).toEqual(['dusk', 'ember', 'aurora', 'sage', 'dusk-light']);
    expect(SKY_THEMES.filter((k) => k.dark).map((k) => k.id)).toEqual(['dusk', 'ember', 'aurora']);
  });
  it('offer none of the light skies that were not approved', () => {
    for (const id of ['morning', 'slate', 'ember-light']) expect(skyTheme(id)).toBeNull();
    expect(skyTheme(null)).toBeNull();
  });
  it('keep the dark card off black', () => {
    for (const k of SKY_THEMES.filter((t) => t.dark)) expect(luminance(k.art.bg)).toBeGreaterThan(20);
  });
  it('sit in the Theme row, with no Sky group of their own', () => {
    expect(settings).toContain('SKY_THEMES.map((k) => <SkyTile');
    expect(settings).not.toContain('<Group id="sky"');
  });
});
