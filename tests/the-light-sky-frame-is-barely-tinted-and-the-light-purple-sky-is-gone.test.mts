// THE LIGHT SKY'S FRAME IS BARELY TINTED, AND THE LIGHT PURPLE SKY IS GONE (w-1619359dd3, 2026-11-22).
//
// "The background in light mode is a bit of a weird color. It's almost
// green": the window around the white card on the light green sky, which is
// what Light wears by default, was #e3e8e5, OKLCH chroma 0.0067 at hue 160.
// Plain Light's own frame is 0.0026. The light purple sky's frame was 0.0041,
// and the owner asked for that theme to go: "the light purple one isn't a
// good color so I would just get rid of that theme". Chroma measured in OKLab
// from the hex values; the old green was read off their screenshot's pixels.
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { SKY_THEMES, skyTheme, shownSkyId, wearsInboxSky } from '../renderer/src/home/sky.ts';
import { lookChoices } from '../renderer/src/setup-split.ts';

const css = (f: string) => fs.readFileSync(new URL(`../renderer/src/${f}`, import.meta.url), 'utf8');

const lin = (c: number) => (c /= 255, c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function oklch(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16)));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(a, bb) };
}
// Plain Light's frame (styles.css --bg) is 0.0026; the old green and purple frames fail it.
const BARELY = 0.003;

describe('the light sky frame', () => {
  const light = SKY_THEMES.filter((s) => !s.dark);

  it('is the green sky only', () => {
    expect(light.map((s) => s.id)).toEqual(['sage']);
  });

  it('is tinted no more than plain Light', () => {
    for (const s of light) expect(oklch(s.frame!).C).toBeLessThanOrEqual(BARELY);
  });

  it('would have caught the frames that were reported', () => {
    expect(oklch('#e3e8e5').C).toBeGreaterThan(BARELY);
    expect(oklch('#eae9ec').C).toBeGreaterThan(BARELY);
    expect(oklch('#f8f8fa').C).toBeLessThanOrEqual(BARELY);
  });

  it('stays a step below the white card so the card stands off it', () => {
    for (const s of light) expect(oklch(s.frame!).L).toBeLessThan(oklch('#fefefe').L - 0.01);
  });

  it('is what the walkthrough panel falls back to, not the old green', () => {
    expect(css('components/setup-split.css')).not.toContain('#e3e8e5');
  });
});

describe('the light purple sky', () => {
  it('is no longer offered', () => {
    expect(skyTheme('dusk-light')).toBeNull();
    expect(SKY_THEMES.some((s) => s.name === 'Light purple sky')).toBe(false);
    expect(lookChoices('match', true)).not.toContain('dusk-light');
  });

  it('lands anyone still wearing it on the green sky in light, and the orange in dark', () => {
    expect(shownSkyId('dusk-light', false)).toBe('sage');
    expect(shownSkyId('dusk-light', true)).toBe('ember');
  });

  it('leaves no styles behind', () => {
    expect(css('home/home.css')).not.toContain('dusk-light');
  });

  it('takes nothing from the dark purple sky', () => {
    expect(skyTheme('dusk')?.name).toBe('Dark purple sky');
    expect(SKY_THEMES.filter((s) => s.dark).map((s) => s.id)).toEqual(['dusk', 'ember', 'aurora']);
  });

  // It was the one light sky drawn on the Inbox; the rest keep what they had.
  it('leaves every dark sky on the Inbox and the green one off it', () => {
    for (const id of ['dusk', 'ember', 'aurora']) expect(wearsInboxSky(skyTheme(id))).toBe(true);
    expect(wearsInboxSky(skyTheme('sage'))).toBe(false);
  });
});
