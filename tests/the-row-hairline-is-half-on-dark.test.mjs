// The hairline between inbox rows draws at three eighths strength in every
// theme.
//
// The first cut halved dark and the picture themes and left the light ones
// whole. Then, 2026-09-22, looking at Peach Haze (a light theme) on her own
// window: "reduce intensity of the dividing half lines further." So the light
// themes came down to half as well, one value. Then, having seen the half live
// and a quarter pictured: "test somewhere between a quarter and half." So
// three eighths. (The file keeps its name; the story is what it pins.)
//
// The strength is a fraction of --line rather than a second colour, so each
// theme's own hue stays and only the weight moves, and the heading line, which
// is --line itself, does not move at all.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const css = fs.readFileSync(path.join(root, 'renderer/src/styles.css'), 'utf8');

function block(selector) {
  for (const m of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const list = m[1].split(',').map((x) => x.trim().replace(/^[\s\S]*\*\//, '').trim());
    if (list.includes(selector)) return m[2];
  }
  expect.fail(`${selector} block is missing`);
}

const rowLine = (selector) => {
  const m = block(selector).match(/^\s*--row-line:\s*([^;]+);/m);
  expect(m, `${selector} does not declare --row-line`).toBeTruthy();
  return Number(m[1].trim());
};

describe('the hairline between rows', () => {
  it('is a fraction of --line, read by the row rule and nothing else', () => {
    const rule = css.match(/\n\.row \+ \.row::after \{[^}]*\}/)[0];
    expect(rule).toMatch(/background:\s*var\(--line\)/);
    expect(rule).toMatch(/opacity:\s*var\(--row-line\)/);
    const readers = [...css.matchAll(/var\(--row-line\)/g)].length;
    expect(readers, 'only the row hairline reads --row-line').toBe(1);
  });

  it('draws at three eighths in light and in dark, and no picture theme says otherwise', () => {
    expect(rowLine(':root')).toBe(0.375);
    expect(rowLine(':root[data-theme="dark"]')).toBe(0.375);
    // The dark block also answers for :root[data-skin], so every picture theme
    // inherits the half. A theme block re-declaring it is a second value
    // nobody asked for.
    const declared = [...css.matchAll(/^\s*--row-line:/gm)].length;
    expect(declared, '--row-line is declared exactly twice, light and dark').toBe(2);
  });

  it('leaves the line under the heading alone', () => {
    // The workspace topbar's border is --line itself, unscaled.
    const nav = fs.readFileSync(path.join(root, 'renderer/src/workspace-navigation.css'), 'utf8');
    const topbar = nav.match(/\.workspace-layout > \.topbar \{[^}]*\}/)[0];
    expect(topbar).toMatch(/border-bottom:\s*1px solid var\(--line\)/);
    expect(topbar).not.toMatch(/row-line/);
  });
});
