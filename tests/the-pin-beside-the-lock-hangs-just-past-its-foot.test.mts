// THE PIN BESIDE THE LOCK HANGS JUST PAST ITS FOOT.
//
// Reported 2026-10-20 (w-739077c097) with a crop of a pinned private title:
// "not lined up well", and then, of the pin redrawn on the lock's grid: "the
// issue was that it was just a tiny bit too high, maybe half a pixel too
// high. This new icon looks much worse." So the pin keeps its own drawing and
// only moves.
//
// Worked out from the marks as drawn: on its 13px box set 2px under the
// baseline, the tip of the pin's needle ended 0.75px below the baseline, and
// the foot of the lock's body ends 1.1px below it, so the pin stood 0.35px
// high. Half a pixel lower its tip was level with the lock's foot (0.15px
// past it), and on a 2x screen it still read high: "it still doesn't feel
// perfectly lined up. It feels like it is a tiny bit too high." The pin's
// weight is in its head and the lock's in its body, so level feet read as a
// raised pin. A whole pixel below where it shipped, the tip hangs 0.65px past
// the lock's foot.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThreadCells } from '../renderer/src/threads/Pages.tsx';
import { PinMark } from '../renderer/src/threads/ThreadMenu.tsx';
import { TeamContext } from '../renderer/src/team/people.tsx';
globalThis.React = React;

const NOW = Date.now();
const SINCE = NOW - 7 * 86_400_000;
const ME = 'p-me';
const northwind = { slug: 'northwind', name: 'Northwind', team: { visibility: 'team', people: [] } };
const item = { id: 'w-1', product: 'northwind', productName: 'Northwind', status: 'open', title: 'Slack export and safe cancellation', kind: 'directive',
  labels: ['founder'], priority: 5, epoch: 0, claim: null, createdAt: SINCE + 86_400_000, updatedAt: NOW - 60_000, createdBy: ME, visibility: 'private', pinned: true };
const team = { state: { since: SINCE, signedIn: true }, me: ME, byId: new Map(), products: new Map() };
const row = renderToStaticMarkup(React.createElement(TeamContext.Provider, { value: team },
  React.createElement(ThreadCells, { item, product: northwind, now: NOW })));
const css = fs.readFileSync(new URL('../renderer/src/threads/pages.css', import.meta.url), 'utf8');

const svgOf = (html, cls) => html.match(new RegExp(`<svg[^>]*class="${cls}"[^>]*>[\\s\\S]*?</svg>`))[0];
const attr = (svg, name) => svg.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null;
const valign = (cls, sheet = css) => Number(sheet.match(new RegExp(`^\\.${cls} \\{[^}]*vertical-align:\\s*(-?[\\d.]+)px`, 'm'))[1]);

// The lowest y a mark's paths and rects reach, in its own units. An arc counts
// by its end points only: the lock's shackle is the one arc, and it bows up.
function lowest(svg) {
  let low = -Infinity;
  for (const [, y, h] of svg.matchAll(/<rect[^>]*\sy="([\d.]+)"[^>]*\sheight="([\d.]+)"/g)) low = Math.max(low, Number(y) + Number(h));
  for (const [, d] of svg.matchAll(/<path d="([^"]*)"/g)) {
    let x = 0, y = 0, sx = 0, sy = 0;
    for (const [, cmd, args] of d.matchAll(/([MmLlHhVvAaZz])([^MmLlHhVvAaZz]*)/g)) {
      const n = args.trim() ? args.trim().split(/[\s,]+/).map(Number) : [];
      const step = { M: 2, m: 2, L: 2, l: 2, H: 1, h: 1, V: 1, v: 1, A: 7, a: 7, Z: 0, z: 0 }[cmd];
      if (!step) { x = sx; y = sy; continue; }
      for (let i = 0; i < n.length; i += step) {
        if (cmd === 'M' || cmd === 'L') [x, y] = [n[i], n[i + 1]];
        else if (cmd === 'm' || cmd === 'l') [x, y] = [x + n[i], y + n[i + 1]];
        else if (cmd === 'A') [x, y] = [n[i + 5], n[i + 6]];
        else if (cmd === 'a') [x, y] = [x + n[i + 5], y + n[i + 6]];
        else if (cmd === 'H') x = n[i];
        else if (cmd === 'h') x += n[i];
        else if (cmd === 'V') y = n[i];
        else if (cmd === 'v') y += n[i];
        if ((cmd === 'M' || cmd === 'm') && i === 0) [sx, sy] = [x, y];
        low = Math.max(low, y);
      }
    }
  }
  return low;
}

// Where a mark's ink ends, in CSS px below the text's baseline. An inline
// picture's foot sits `vertical-align` below the baseline, and its line runs
// half a stroke past the lowest point it is drawn to.
function inkFoot(svg, verticalAlign) {
  const h = Number(attr(svg, 'height'));
  const vb = Number(attr(svg, 'viewBox').split(/\s+/)[3]);
  const half = Number(attr(svg, 'stroke-width')) / 2;
  return -verticalAlign - h + (lowest(svg) + half) * (h / vb);
}

const lock = svgOf(row, 'th-lock');
const pin = svgOf(row, 'th-pin');
const footOf = (va) => inkFoot(pin, va);
const lockFoot = inkFoot(lock, valign('th-lock'));

// How far the tip of the pin's needle ends past the foot of the lock, in px.
const past = (va) => footOf(va) - lockFoot;
const RIGHT = { from: 0.5, to: 0.8 };

describe('the pin after a title', () => {
  it('hangs about two thirds of a pixel past the foot of the lock', () => {
    expect(past(valign('th-pin'))).toBeGreaterThanOrEqual(RIGHT.from);
    expect(past(valign('th-pin'))).toBeLessThanOrEqual(RIGHT.to);
  });

  // Each half pixel it has stood at, worked out the same way, and the next
  // one down.
  it('where it shipped, 2px under the baseline, it stood a third of a pixel high', () => {
    expect(past(-2)).toBeCloseTo(-0.35, 2);
  });
  it('level with the lock\'s foot, as it was at 2.5px, is still too high', () => {
    expect(past(-2.5)).toBeLessThan(RIGHT.from);
  });
  it('another half pixel down would hang a whole pixel past the lock', () => {
    expect(past(-3.5)).toBeGreaterThan(RIGHT.to);
  });

  it('keeps its own drawing: the menu\'s pin at 13px, not one drawn for the row', () => {
    const menu = renderToStaticMarkup(React.createElement(PinMark));
    expect(pin.match(/<path[\s\S]*<\/svg>/)[0]).toBe(menu.match(/<path[\s\S]*<\/svg>/)[0]);
    expect([attr(pin, 'width'), attr(pin, 'height'), attr(pin, 'viewBox')]).toEqual(['13', '13', '0 0 24 24']);
  });
});
