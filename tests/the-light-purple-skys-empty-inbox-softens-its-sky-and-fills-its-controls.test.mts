// THE LIGHT PURPLE SKY'S EMPTY INBOX SOFTENS ITS SKY AND FILLS ITS CONTROLS (w-4636402bdb, 2026-11-16).
//
// "This theme doesn't do well with this page": on the light purple sky the
// streak's deep plum dots ran through the placeholder, the chip outlines, Send
// and every suggestion, photographed in the built renderer at 1440x900. A
// frosted card under the box shipped first and was turned down in the real app
// ("that UI looks pretty bad"). What stands is the softer sky the owner also
// picked: on this page the sky is drawn lighter, lighter still behind the
// words, with every dot kept, and the chips, Send and suggestions are filled
// white. "Make sure that doesn't affect other design themes": no other sky
// carries the softening, and nothing else is filled.
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { SKY_THEMES, inkStrength, wearsInboxSky } from '../renderer/src/home/sky.ts';

const css = fs.readFileSync(new URL('../renderer/src/home/home.css', import.meta.url), 'utf8');
const purple = ':root[data-sky-frame="dusk-light"] .app:has(> .inbox-sky-zero) .th-start';
const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));
const words = { x: 400, y: 300, w: 720, h: 300 };

describe('the empty Inbox on the light purple sky', () => {
  const soft = SKY_THEMES.find((s) => s.id === 'dusk-light')?.art.emptySoft;

  it('draws the sky lighter on this page', () => {
    expect(soft).toBeGreaterThan(0.3);
    expect(soft).toBeLessThan(0.6);
    expect(inkStrength(1500, 900, words, soft)).toBe(soft);
  });

  it('draws it lighter still behind the words, but never to nothing', () => {
    const inside = inkStrength(700, 450, words, soft);
    expect(inside).toBeGreaterThan(0);
    expect(inside).toBeLessThan(soft! * 0.5);
  });

  it('comes back gradually at the words’ edge, not as a cut', () => {
    const a = inkStrength(1120 + 10, 450, words, soft), b = inkStrength(1120 + 60, 450, words, soft), c = inkStrength(1120 + 110, 450, words, soft);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });

  it('fills the chips, Send and the suggestions white', () => {
    expect(rules.find((r) => r.selector === `${purple} .tc-chip`)?.body).toContain('background: #fff;');
    expect(rules.find((r) => r.selector === `${purple} .tc-send > button`)?.body).toContain('background: #fff;');
    expect(rules.find((r) => r.selector === `${purple} .tc-ideas`)?.body).toMatch(/background: rgba\(255, 255, 255, \.\d+\);/);
  });

  it('lays no card under the box', () => {
    expect(rules.some((r) => r.selector.includes('.inbox-sky-zero') && /backdrop-filter/.test(r.body))).toBe(false);
  });
});

describe('every other sky', () => {
  it('is drawn at full strength, as before', () => {
    expect(SKY_THEMES.filter((s) => s.art.emptySoft).map((s) => s.id)).toEqual(['dusk-light']);
    expect(inkStrength(700, 450, words, undefined)).toBe(1);
    expect(inkStrength(700, 450, null, 0.45)).toBe(1);
  });

  it('lays nothing over the empty Inbox sky', () => {
    const over = rules.filter((r) => r.selector.includes('.inbox-sky-zero') && /(background|backdrop-filter|text-shadow)/.test(r.body));
    expect(over.length).toBeGreaterThan(0);
    for (const r of over) for (const s of r.selector.split(/,(?![^(]*\))/)) expect(s.trim().startsWith(':root[data-sky-frame="dusk-light"]')).toBe(true);
  });

  it('is the only light sky that reaches the empty Inbox', () => {
    expect(SKY_THEMES.filter((s) => !s.dark && wearsInboxSky(s)).map((s) => s.id)).toEqual(['dusk-light']);
  });
});
