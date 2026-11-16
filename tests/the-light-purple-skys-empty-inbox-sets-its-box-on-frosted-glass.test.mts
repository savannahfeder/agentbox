// THE LIGHT PURPLE SKY'S EMPTY INBOX SETS ITS BOX ON FROSTED GLASS (w-4636402bdb, 2026-11-16).
//
// "This theme doesn't do well with this page": on the light purple sky the
// streak's deep plum dots ran through the placeholder, the chip outlines, Send
// and every suggestion, photographed in the built renderer at 1440x900. The
// dark skies' fix (words drawn white, nothing laid over the sky) cannot work on
// a white card. The owner picked option 1: the box and its suggestions on the
// frosted card Home already wears on this sky, with "make sure that doesn't
// affect other design themes". So every other sky keeps nothing over it.
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { SKY_THEMES, wearsInboxSky } from '../renderer/src/home/sky.ts';

const css = fs.readFileSync(new URL('../renderer/src/home/home.css', import.meta.url), 'utf8');
const purple = ':root[data-sky-frame="dusk-light"] .app:has(> .inbox-sky-zero) .th-start';
const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));

describe('the empty Inbox on the light purple sky', () => {
  it('draws the writing box on frosted glass', () => {
    const card = rules.find((r) => r.selector === `${purple} .tc-card.tc-inline`);
    expect(card?.body).toMatch(/backdrop-filter: blur\(\d+px\)/);
    expect(card?.body).toMatch(/background: linear-gradient\(180deg, rgba\(255, 255, 255, \.\d+\)/);
  });

  it('keeps the suggestions inside that card', () => {
    const ideas = rules.find((r) => r.selector === `${purple} .tc-inline .tc-ideas`);
    expect(ideas?.body).toMatch(/margin: \d+px -\d+px -\d+px/);
  });

  it('lines the words in the card up with the heading', () => {
    const card = rules.find((r) => r.selector === `${purple} .tc-card.tc-inline`)?.body ?? '';
    const pad = Number(card.match(/padding: \d+px (\d+)px/)?.[1]);
    expect(pad).toBeGreaterThan(0);
    const slot = rules.find((r) => r.selector === `${purple} > .th-clear-compose`)?.body ?? '';
    expect(Number(slot.match(/width: (\d+)px/)?.[1])).toBe(720 + 2 * pad);
  });
});

describe('every other sky', () => {
  it('lays nothing over the empty Inbox sky', () => {
    const over = rules.filter((r) => r.selector.includes('.inbox-sky-zero') && /(background|backdrop-filter|text-shadow)/.test(r.body));
    expect(over.length).toBeGreaterThan(0);
    for (const r of over) for (const s of r.selector.split(/,(?![^(]*\))/)) expect(s.trim().startsWith(':root[data-sky-frame="dusk-light"]')).toBe(true);
  });

  it('is the only light sky that reaches the empty Inbox, so the card shows on no other look', () => {
    expect(SKY_THEMES.filter((s) => !s.dark && wearsInboxSky(s)).map((s) => s.id)).toEqual(['dusk-light']);
  });
});
