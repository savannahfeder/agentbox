// THE MAIN CARD HAS AN EDGE IN LIGHT, AND ITS OWN ROUNDER CORNER (w-1619359dd3, 2026-11-22).
//
// With the light frame at plain Light's #f8f8fa, the white card (#fefefe) sat
// 0.017 OKLab lightness above it with only a soft shadow between them: "the
// only issue is a lack of contrast between the foreground and the
// background ... add a tiny edge or border". Dark (Ember Grid) and Glass
// already draw a 1px inset hairline; light drew none. And "our edges on this
// app are kind of sharp": the card wore --radius, 6px, the same token as every
// small button, while the reply box inside it was rounder at 10px. The card
// now has a corner of its own; buttons keep theirs.
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { skyTheme } from '../renderer/src/home/sky.ts';

const read = (f: string) => fs.readFileSync(new URL(`../renderer/src/${f}`, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');
const styles = read('styles.css');
const nav = read('workspace-navigation.css');
const home = read('home/home.css');
const rule = (css: string, selector: string) => {
  const at = css.split('\n').find((l) => l.startsWith(`${selector} {`) || l.startsWith(`${selector}{`));
  return at ?? null;
};
const px = (name: string) => Number(styles.match(new RegExp(`--${name}: (\\d+)px;`))?.[1]);

describe('the light card', () => {
  it('sits on the same frame as plain Light, on the green sky too', () => {
    expect(styles).toMatch(/--bg: #f8f8fa;/);
    expect(skyTheme('sage')?.frame).toBe('#f8f8fa');
  });

  it('is edged with a hairline of the ink, faint like Glass and Dark draw theirs', () => {
    const r = rule(nav, ':root[data-theme="light"] .workspace-layout::before');
    expect(r).not.toBeNull();
    const m = r!.match(/inset 0 0 0 1px color-mix\(in srgb, var\(--text\) (\d+)%, transparent\)/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(6);
    expect(Number(m![1])).toBeLessThanOrEqual(12);
    expect(r).toContain('var(--shadow-card)');
  });

  it('leaves the dark card its own hairline', () => {
    expect(nav).toMatch(/:root\[data-skin="ember-grid"\] \.workspace-layout::before \{\s*box-shadow: inset 0 0 0 1px var\(--skin-pane-line\)/);
  });
});

describe('the main card corner', () => {
  // 6, 10, 14 and 18px were shown in light and the dark orange sky; 10px was approved.
  it('is its own token, the approved 10px, as round as the cards inside it', () => {
    expect(px('pane-corner')).toBe(10);
    expect(px('pane-corner')).toBeGreaterThanOrEqual(px('artifact-corner'));
  });

  it('is worn by the card and everything clipped to it', () => {
    expect(rule(nav, '.workspace-layout::before')).toContain('border-radius: var(--pane-corner);');
    expect(rule(nav, ':root .workspace-layout > .body > .list-pane')).toContain('border-radius: 0 0 var(--pane-corner) var(--pane-corner);');
    expect(rule(home, '.home-sky')).toContain('border-radius: var(--pane-corner);');
    expect(home).toContain('clip-path: inset(0 0 60px 0 round var(--pane-corner));');
  });

  it('does not round the buttons any further', () => {
    expect(styles).toMatch(/--radius: var\(--artifact-corner-small\);/);
    expect(rule(nav, '.workspace-navigation button')).toContain('border-radius: var(--radius);');
  });
});
