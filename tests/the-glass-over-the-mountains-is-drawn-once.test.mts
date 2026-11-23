// THE GLASS OVER THE MOUNTAINS IS DRAWN ONCE, NOT EVERY TIME A BIRD MOVES (w-9687db6270, 2026-11-22).
//
// Home's cards, doors and writing box are glass over the mountains, and the
// browser blurs what is behind such glass again for every frame it draws. With
// birds moving thirty times a second that was most of their cost: 15 to 19% of
// one core with the glass, 6.7% without (a hidden browser on the founder's Mac).
// Nothing behind the glass ever moves, so the soft mountains are drawn once,
// small, and shown through a hole the shape of each pane.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { panesPath } from '../renderer/src/home/frost.ts';

const read = (p: string) => fs.readFileSync(new URL(`../renderer/src/${p}`, import.meta.url), 'utf8');

describe('the glass on Home in the light mountains', () => {
  const css = read('home/home.css');
  it('asks the browser to blur nothing', () => {
    const rules = css.match(/:root\[data-theme="light"\]\[data-sky-frame="mountains"\] \.hm-glass,[^{]*\{[^}]*\}/)?.[0] ?? '';
    expect(rules).toContain('.hm-start .tc-card.tc-inline');
    expect(rules).toContain('.hm-door');
    expect(rules).toMatch(/backdrop-filter: none; -webkit-backdrop-filter: none;/);
  });
  it('is drawn when the mountains are, and never on a timer', () => {
    const src = read('home/frost.ts');
    expect(src).not.toMatch(/setInterval|setTimeout/);
    expect(read('home/SkyBackdrop.tsx')).toMatch(/paintSky\([^\n]*\n?[^\n]*soft\?\.paint\(\)/);
  });
  it('follows its panes when they grow, move, scroll or arrive', () => {
    const src = read('home/frost.ts');
    expect(src).toMatch(/ResizeObserver/);
    expect(src).toMatch(/MutationObserver/);
    expect(src).toMatch(/'scroll'/);
  });
});

describe('the holes', () => {
  it('are each pane with its own corners', () => {
    expect(panesPath([{ x: 10, y: 20, w: 100, h: 50, r: 8 }])).toBe('M18 20h84a8 8 0 0 1 8 8v34a8 8 0 0 1 -8 8h-84a8 8 0 0 1 -8 -8v-34a8 8 0 0 1 8 -8z');
  });
  it('are one path for several panes', () => {
    const p = panesPath([{ x: 0, y: 0, w: 40, h: 20, r: 0 }, { x: 50, y: 0, w: 40, h: 20, r: 0 }]);
    expect(p.match(/M/g)).toHaveLength(2);
  });
  it('leave out a pane with no size, and round no further than half its side', () => {
    expect(panesPath([{ x: 0, y: 0, w: 0, h: 20, r: 4 }])).toBe('');
    expect(panesPath([{ x: 0, y: 0, w: 20, h: 10, r: 40 }])).toContain('a5 5');
  });
});
