// On the Dark purple sky, the sidebar and the inbox card wore the default look's
// warm Ash ground (#1A1817, rgb 26,24,23 in the window) and its faint orange
// glow, which read as a dirty brown under the purple. Measured on a screenshot
// of the inbox on that sky: sidebar 23,22,21 and card 34,30,28. The purple sky
// now sets its own neutral near-black ground and panels; the orange sky keeps
// the Ash it was designed on.
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';

const css = fs.readFileSync(new URL('../renderer/src/home/home.css', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

const block = (selector: string) => {
  const at = css.indexOf(selector + ' {');
  if (at < 0) return null;
  return css.slice(at, css.indexOf('\n}', at));
};
const varOf = (body: string, name: string) => body.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1] ?? null;
const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const luminance = (hex: string) => { const [r, g, b] = rgb(hex); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const neutral = (hex: string) => { const c = rgb(hex); return Math.max(...c) - Math.min(...c) <= 3; };

describe('the dark purple sky', () => {
  const dusk = block('html:root[data-sky="dusk"]');

  it('is named on the page while it is worn', () => {
    expect(app).toMatch(/root\.dataset\.sky = sky\.id/);
    expect(app).toMatch(/delete root\.dataset\.sky;/);
  });

  it('sets a neutral ground and panels, not the warm Ash', () => {
    expect(dusk).not.toBeNull();
    for (const name of ['--bg', '--surface', '--bg-raised', '--bg-hover', '--bg-selected', '--line']) {
      const hex = varOf(dusk!, name);
      expect(hex, name).not.toBeNull();
      expect(neutral(hex!), `${name} ${hex}`).toBe(true);
    }
    expect(luminance(varOf(dusk!, '--bg')!)).toBeLessThan(luminance('#1a1817'));
  });

  it('stays a step off black so the inbox reads in daylight', () => {
    expect(luminance(varOf(dusk!, '--bg')!)).toBeGreaterThan(18);
  });

  it('paints its own ground with no orange glow in it', () => {
    const image = dusk!.match(/--skin-image:.*/)?.[0] ?? '';
    expect(image).toContain('<svg');
    expect(image).toContain(`fill='%23${varOf(dusk!, '--bg')!.slice(1)}'`);
    expect(image.toLowerCase()).not.toContain('ee6018');
  });

  it('leaves the orange sky and the light purple sky as they were', () => {
    expect(block('html:root[data-sky="ember"]')).toBeNull();
    expect(block('html:root[data-sky="dusk-light"]')).toBeNull();
  });
});
