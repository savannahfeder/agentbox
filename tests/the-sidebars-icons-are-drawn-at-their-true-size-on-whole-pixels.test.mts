// THE SIDEBAR'S ICONS ARE DRAWN AT THEIR TRUE SIZE, ON WHOLE PIXELS.
//
// The owner, 2026-11-24, of the closed sidebar: "kind of thick. They're blurred
// and not sharp or clean like normal icons." The icons were drawn on a 24 grid
// and shown at 18 and 20 points with a 1.2 point line, so no line began on a
// pixel. Measured on a 2x screen, down through Inbox's three lines: each read
// 75 25 75 or 176 25 25 176 against a 228 ground, a grey fringe either side of
// a line three or four pixels deep. Drawn on a 16 grid at 16 points with a 1
// point line centred on a half point, the same lines read 25 25: two pixels
// and no fringe.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SidebarGlyph, SIDEBAR_GLYPHS } from '../renderer/src/components/SidebarGlyph.tsx';
globalThis.React = React;

const read = (rel) => fs.readFileSync(path.join(import.meta.dirname, '..', rel), 'utf8');
const names = Object.keys(SIDEBAR_GLYPHS);
const drawn = (name) => renderToStaticMarkup(createElement(SidebarGlyph, { name }));

const TAKES = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };

/** Where each level or upright line of a path sits: the y of a level one, the x of an upright one. */
function straightLines(d) {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.\d+|\.\d+|\d+)/g) ?? [];
  const lines = [];
  let x = 0, y = 0, startX = 0, startY = 0, cmd = '', i = 0;
  const lineTo = (nx, ny) => {
    if (Math.abs(nx - x) < 1e-6 && Math.abs(ny - y) > 1e-6) lines.push(x);
    if (Math.abs(ny - y) < 1e-6 && Math.abs(nx - x) > 1e-6) lines.push(y);
    x = nx; y = ny;
  };
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    const low = cmd.toLowerCase(), rel = cmd === low;
    const n = tokens.slice(i, i + TAKES[low]).map(Number); i += TAKES[low];
    if (low === 'z') { lineTo(startX, startY); continue; }
    if (low === 'h') { lineTo(rel ? x + n[0] : n[0], y); continue; }
    if (low === 'v') { lineTo(x, rel ? y + n[0] : n[0]); continue; }
    const nx = (rel ? x : 0) + n[n.length - 2], ny = (rel ? y : 0) + n[n.length - 1];
    if (low === 'm') { x = startX = nx; y = startY = ny; cmd = rel ? 'l' : 'L'; continue; }
    if (low === 'l') { lineTo(nx, ny); continue; }
    x = nx; y = ny;
  }
  return lines;
}
const onAHalf = (v) => Math.abs((((v % 1) + 1) % 1) - 0.5) < 1e-6;
const edges = (svg) => [
  ...[...svg.matchAll(/ d="([^"]+)"/g)].flatMap((m) => straightLines(m[1])),
  ...[...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)].flatMap(([, cx, cy, r]) => [+cx - +r, +cx + +r, +cy - +r, +cy + +r]),
];

describe('the check itself', () => {
  it('reads level and upright lines out of a path, and passes over slanted and curved ones', () => {
    expect(straightLines('M2.5 4.5h11M2.5 8.5h11')).toEqual([4.5, 8.5]);
    expect(straightLines('M6.5 13.5V10a1.5 1.5 0 0 1 3 0v3.5')).toEqual([6.5, 9.5]);
    expect(straightLines('M2.5 7.5 13.5 2.5l-3 11-3-4z')).toEqual([]);
    expect(straightLines('M4 4h8v8h-8z')).toEqual([4, 12, 12, 4]);
  });
  it('tells a half point from a whole one and from the old drawing squeezed to 18', () => {
    expect(onAHalf(4.5)).toBe(true);
    expect(onAHalf(13.5)).toBe(true);
    expect(onAHalf(4)).toBe(false);
    expect(onAHalf(4.4)).toBe(false);
    // Inbox's old lines, 7 12 and 17 on the 24 grid, at 18 points.
    expect([7, 12, 17].map((v) => v * 0.75).some(onAHalf)).toBe(false);
  });
});

describe('a sidebar icon', () => {
  it('is 16 points of a 16 grid, with a 1 point line', () => {
    for (const name of names) {
      expect(drawn(name), name).toMatch(/^<svg class="sb-glyph" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1" /);
    }
  });
  it('has every level line, upright line and circle edge centred on a half point', () => {
    for (const name of names) {
      const at = edges(drawn(name));
      expect(at.filter((v) => !onAHalf(v)), `${name}: ${at.join(' ')}`).toEqual([]);
    }
    expect(edges(drawn('inbox'))).toEqual([4.5, 8.5, 12.5]);
  });
  it('stays inside its box, line and all', () => {
    for (const name of names) for (const v of edges(drawn(name))) { expect(v, name).toBeGreaterThanOrEqual(1.5); expect(v, name).toBeLessThanOrEqual(14.5); }
  });
});

describe('the sidebar', () => {
  const css = read('renderer/src/sidebar.css');
  const nav = read('renderer/src/components/WorkspaceNavigation.tsx');
  it('shows them at 16 points and leaves their line alone', () => {
    expect(css).toContain(':is(.workspace-tab, .workspace-find button, .workspace-utilities > button, .sb-update-slot > .sb-update-row) > svg { width: 16px; height: 16px; margin: 0; color: inherit; }');
    expect(css).toContain('.sb-update-card-title > svg { width: 16px; height: 16px; }');
    expect(css).not.toMatch(/> svg[^{]*\{[^}]*stroke-width/);
    expect(css).not.toMatch(/> svg \{ width: (18|20)px/);
  });
  it('draws none of the 24 grid icons, which only fit at their own sizes', () => {
    for (const file of ['renderer/src/components/WorkspaceNavigation.tsx', 'renderer/src/components/SidebarUpdate.tsx', 'renderer/src/team/rooms/GroupsSidebar.tsx']) {
      const src = read(file).replace(/function CloseIcon[\s\S]*?\n}/, '');
      expect(src, file).not.toContain('viewBox="0 0 24 24"');
      expect(src, file).toContain('<SidebarGlyph name=');
    }
    expect(nav).not.toMatch(/SettingsIcon|SidebarIcon|I\.groupNav/);
  });
  it('still draws the keep-open button on the same grid', () => {
    expect(nav).toMatch(/className="ws-keep"[\s\S]{0,400}<svg viewBox="0 0 16 16"[^>]*strokeWidth="1"/);
  });
});
