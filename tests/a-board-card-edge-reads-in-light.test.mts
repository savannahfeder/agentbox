// A BOARD CARD'S EDGE READS IN LIGHT.
//
// "The borders of these components are very hard to read", on a Light
// screenshot of the In progress board. Measured off that picture on
// 2026-11-02: the edge was rgb(239,239,241) on a rgb(254,254,254) page. The
// card's fill is a white film, invisible on white, so that hairline (`--line`,
// 6.5% ink) was all that marked a card. Of five drawn fixes the pick was the
// darker line alone: `--line-strong`, 14% ink, which drew rgb(220,222,225).
// Dark was not part of the complaint and keeps `--line`.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'renderer/src');
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '');
const styles = strip(readFileSync(join(src, 'styles.css'), 'utf8'));
const pages = strip(readFileSync(join(src, 'threads/pages.css'), 'utf8'));
const rules = (text) => [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selectors: m[1].split(',').map((s) => s.trim().replace(/\s+/g, ' ')), body: m[2] }));

const tokensOf = (selector) => {
  const r = rules(styles).find((x) => x.selectors.includes(selector));
  if (!r) throw new Error(`${selector} block is missing`);
  return Object.fromEntries([...r.body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
};
const light = tokensOf(':root');
const dark = tokensOf(':root[data-theme="dark"]');
const resolve = (tokens, v) => { const m = /^var\((--[\w-]+)\)$/.exec(v ?? ''); return m ? resolve(tokens, tokens[m[1]]) : v; };
const inkAlpha = (v) => Number(/rgba\(17, 25, 48, ([\d.]+)\)/.exec(v)?.[1]);

const borderOf = (sel) => {
  let found = null;
  for (const r of rules(pages)) {
    if (!r.selectors.includes(sel)) continue;
    const m = /border(?:-color)?:\s*([^;]+)/.exec(r.body);
    if (m) found = m[1].trim();
  }
  return found;
};

describe('a board card in Light', () => {
  it('draws its edge in the card line', () => {
    expect(borderOf('.th-card')).toMatch(/var\(--card-line\)/);
  });

  it('is at least the 14% ink that was picked, not the 6.5% hairline', () => {
    expect(inkAlpha(resolve(light, light['--card-line']))).toBeGreaterThanOrEqual(0.14);
  });

  it('is not so dark it reads as a box around a box', () => {
    expect(inkAlpha(resolve(light, light['--card-line']))).toBeLessThan(0.2);
  });

  it('still darkens on hover', () => {
    expect(borderOf('.th-card:hover')).toMatch(/var\(--card-line-hover\)/);
    expect(inkAlpha(resolve(light, light['--card-line-hover']))).toBeGreaterThan(inkAlpha(resolve(light, light['--card-line'])));
  });
});

describe('what must not change', () => {
  it('Dark keeps the hairline it had, and its hover', () => {
    expect(dark['--card-line']).toBe('var(--line)');
    expect(dark['--card-line-hover']).toBe('var(--line-strong)');
  });

  it('the row hairline and --line itself stay where they were', () => {
    expect(light['--line']).toBe('rgba(17, 25, 48, 0.065)');
  });

  it('an open or picked card keeps its own edge', () => {
    expect(borderOf('.th-card.selected')).toBe('var(--underline)');
    expect(borderOf('.th-card.picked')).toBe('var(--accent)');
  });
});
