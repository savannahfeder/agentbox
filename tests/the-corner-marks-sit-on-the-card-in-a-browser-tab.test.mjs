// THE CORNER MARKS SIT ON THE CARD IN A BROWSER TAB TOO.
//
// In the browser copy (`npx agentbox-app`) the four corner marks of the Ember
// Grid look hung below the card's top corners. A tab has no title bar, so
// threads/pages.css moves the card up from 40px to 22px, but the marks
// (.panel-marks) only followed a flat desktop window, not a tab. Measured
// 2026-10-26 in Chromium at 1512x945: the card's top at 22px, the marks' top
// at 40px, so the top marks stood 11px below the card's edge instead of 7px
// above it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'renderer', 'src');
const sheets = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.css')) sheets.push(fs.readFileSync(p, 'utf8'));
  }
})(src);
const css = sheets.join('\n');

// `:root[a][b] .thing { … top: Npx … }`, keyed by the root's attributes, which
// is how every window shape is told apart.
function topsBy(target) {
  const out = new Map();
  const re = new RegExp(`:root((?:\\[[^\\]]+\\])+) ${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`, 'g');
  for (const m of css.matchAll(re)) {
    const top = /(?:^|;)\s*top:\s*(\d+)px/.exec(m[2]);
    if (top) out.set(m[1], Number(top[1]));
  }
  return out;
}
const card = topsBy('.workspace-layout::before');
const marks = topsBy('.panel-marks');
const marksFor = (attrs) => marks.get(`${attrs}[data-skin="ember-grid"]`);

describe('the corner marks follow the card', () => {
  it('in a browser tab, up to the card\'s 22px', () => {
    expect(card.get('[data-shell="tab"]')).toBe(22);
    expect(marksFor('[data-shell="tab"]')).toBe(22);
  });

  it('in a desktop window without traffic lights, the same', () => {
    expect(card.get('[data-window="flat"]')).toBe(22);
    expect(marksFor('[data-window="flat"]')).toBe(22);
  });

  it('on the Mac they stay at 40px with the card', () => {
    expect(css).toMatch(/^\.workspace-layout::before \{[^}]*\btop: 40px;/m);
    expect(css).toMatch(/:root\[data-skin="ember-grid"\] \.panel-marks \{[^}]*\btop: 40px;/);
  });

  it('and no window shape moves the card without moving the marks the same', () => {
    expect(card.size).toBeGreaterThan(0);
    for (const [attrs, top] of card) expect(marksFor(attrs), attrs).toBe(top);
  });
});
