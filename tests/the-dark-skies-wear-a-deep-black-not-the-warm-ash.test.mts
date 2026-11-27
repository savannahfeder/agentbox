// On the dark skies the sidebar and the Inbox card wore the default look's warm
// Ash ground (#1a1817 frame, #282625 card), which read as a dirty brown under
// the sky. Out of nineteen colourings shown side by side, the founder picked a
// deep near-black (frame #0b0b0c, card #131315) and asked for it on every dark
// sky. Her worry was whether it would be harder to read: measured, every text
// ink gains contrast on the new card, but the hairlines first drawn with it fell
// from 1.56 to 1.14 and nearly vanished, so they are held at today's strength.
// On 2026-11-27 she found #131315 too deep to read on and pointed at Notion's
// dark page (#191919, measured from her screenshot). The card was lifted to
// that grey. On that card she still saw
// brown: the page was Notion's exact pixel, but the text greys, the command bar
// and the new thread menus were the warm Ember ones. They are neutral here too.
// Then the #0b0b0c frame round the grey card looked too black and out of
// place, so it is now #131313, one step under the card.
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { SKY_THEMES } from '../renderer/src/home/sky.ts';

const css = fs.readFileSync(new URL('../renderer/src/home/home.css', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

const SELECTOR = 'html:root[data-skin="ember-grid"][data-sky-dark]';
const block = (() => {
  const at = css.indexOf(SELECTOR + ' {');
  return at < 0 ? '' : css.slice(at, css.indexOf('\n}', at));
})();
const varOf = (name: string) => block.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1] ?? null;
const rel = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a: string, b: string) => { const [x, y] = [rel(a), rel(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const neutral = (hex: string) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); return Math.max(...c) - Math.min(...c) <= 3; };

const TODAY_CARD = '#282625';
const ASH_INKS = ['#efebe7', '#c4bdb8', '#a09994', '#7f7975'];
const INK_NAMES = ['--text', '--text-dim', '--text-faint', '--agent-ink'];
const darkSkyRule = (sel: string) => {
  const at = css.indexOf(`${SELECTOR} ${sel}`);
  return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
};

describe('the dark skies', () => {
  it('are named on the page while one is worn', () => {
    expect(app).toMatch(/if \(sky\?\.dark\) root\.dataset\.skyDark = ''; else delete root\.dataset\.skyDark;/);
  });

  it('wear a frame one step under a Notion grey card: frame #131313, card #191919', () => {
    expect(varOf('--bg')).toBe('#131313');
    expect(varOf('--surface')).toBe('#191919');
    for (const name of ['--bg', '--surface', '--bg-raised', '--bg-hover', '--bg-selected', '--line', '--line-strong']) {
      expect(varOf(name), name).not.toBeNull();
      expect(neutral(varOf(name)!), `${name} is neutral`).toBe(true);
    }
  });

  it('keep every text ink at least as readable as on today’s card', () => {
    INK_NAMES.forEach((name, i) => {
      expect(varOf(name), name).not.toBeNull();
      expect(contrast(varOf(name)!, varOf('--surface')!), name).toBeGreaterThanOrEqual(contrast(ASH_INKS[i], TODAY_CARD));
    });
  });

  it('write in neutral greys, not the warm Ember ones', () => {
    for (const name of [...INK_NAMES, '--skin-tick']) {
      expect(varOf(name), name).not.toBeNull();
      expect(neutral(varOf(name)!), `${name} is neutral`).toBe(true);
    }
  });

  it('open the command bar and the new thread menus on neutral grey', () => {
    for (const sel of ['.modal.palette', '.tc-menu']) {
      const colours = darkSkyRule(sel).match(/#[0-9a-fA-F]{6}/g) ?? [];
      expect(colours.length, sel).toBeGreaterThan(0);
      for (const c of colours) expect(neutral(c), `${sel} ${c}`).toBe(true);
    }
  });

  it('draw every surface on the card a step lighter than the card, and code a step darker', () => {
    const lum = (name: string) => rel(varOf(name)!);
    for (const name of ['--bg-raised', '--bg-hover', '--bg-selected', '--pop']) expect(lum(name), name).toBeGreaterThan(lum('--surface'));
    expect(lum('--code-ground')).toBeLessThan(lum('--surface'));
    for (const name of ['--skin-pane', '--skin-solid', '--doc-page', '--doc-page-held', '--work-fill']) expect(varOf(name), name).toBe(varOf('--surface'));
  });

  it('keep the frame close to the card, darker but never a black edge round it', () => {
    expect(rel(varOf('--bg')!)).toBeLessThan(rel(varOf('--surface')!));
    expect(contrast(varOf('--bg')!, varOf('--surface')!)).toBeLessThan(1.1);
  });

  it('keep the hairlines as visible as today’s', () => {
    expect(contrast(varOf('--line')!, varOf('--surface')!)).toBeGreaterThanOrEqual(1.5);
  });

  it('paint the dots of the sky on the card colour, and leave the light skies white', () => {
    for (const k of SKY_THEMES.filter((t) => t.dark)) expect(k.art.bg).toBe(varOf('--surface'));
    for (const k of SKY_THEMES.filter((t) => !t.dark)) expect(k.art.bg).toBe('#ffffff');
  });

  it('paint the ground with no orange glow', () => {
    const image = block.match(/--skin-image:.*/)?.[0] ?? '';
    expect(image).toContain("fill='%23131313'");
    expect(image.toLowerCase()).not.toContain('ee6018');
  });
});
