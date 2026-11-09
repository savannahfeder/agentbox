// THE SIDEBAR'S CLOCK ONLY MOVES ON THE MINUTE., 2026-08-20.
//
// Two things had to be true for that and this holds both, because either one
// alone leaves her watching a number move:
//
//   1. The panel never prints a seconds reading at all. `ago` says "13s", so a
//      clock recomputed once a minute would still be showing her seconds; the
//      rail uses `agoQuiet`, which says "now" under a minute and nothing else.
//   2. The value of `now` the rail measures against is rounded down to the
//      minute in App.tsx. The panel is redrawn far more often than once a
//      minute — the snapshot poll is every ten seconds and any keystroke
//      re-renders — so a slower timer would not have helped. What is fixed here
//      is the VALUE, so the text is identical for a whole minute however many
//      times React draws it, and it changes all at once when the minute turns.
//
// The rest of the app is untouched: `ago` still prints seconds everywhere else,
// which is what the inbox rows and the task header have always shown.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ago, agoQuiet } from '../renderer/src/format';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = fs.readFileSync(path.join(root, 'renderer/src/App.tsx'), 'utf8');
const rail = fs.readFileSync(path.join(root, 'renderer/src/components/Rail.tsx'), 'utf8');

const NOW = 1_787_190_000_000;
const quantise = (t) => Math.floor(t / 60_000) * 60_000;

describe('the panel clock never says seconds', () => {
  it('says "now" for anything under a minute, at every second of it', () => {
    for (let s = 0; s < 60; s += 1) expect(agoQuiet(NOW - s * 1000, NOW)).toBe('now');
  });

  it('picks up exactly on the minute and reads the same as everywhere else after', () => {
    expect(agoQuiet(NOW - 60_000, NOW)).toBe('1m');
    expect(agoQuiet(NOW - 59_999, NOW)).toBe('now');
    for (const m of [1, 2, 17, 59, 60, 90, 300, 1440]) {
      expect(agoQuiet(NOW - m * 60_000, NOW)).toBe(ago(NOW - m * 60_000, NOW));
    }
  });

  it('leaves `ago` alone, so nothing outside the panel changed', () => {
    expect(ago(NOW - 13_000, NOW)).toBe('13s');
    expect(ago(NOW, NOW)).toBe('0s');
  });
});

describe('and the value it measures against does not move between minutes', () => {
  it('reads the same for every redraw inside one minute, and turns over at the boundary', () => {
    const at = NOW - 3 * 60_000 - 30_000;           // a row that spoke 3m30s ago
    const inside = [];
    for (let s = 0; s < 60; s += 1) inside.push(agoQuiet(at, quantise(NOW + s * 1000)));
    expect(new Set(inside).size).toBe(1);           // one reading for the whole minute
    expect(inside[0]).toBe('3m');
    expect(agoQuiet(at, quantise(NOW + 60_000))).toBe('4m');
  });

  it('is what App.tsx hands the rail, and the rail is what uses it', () => {
    expect(app).toMatch(/const railNow = Math\.floor\(now \/ 60_000\) \* 60_000;/);
    expect(app).not.toContain('<Rail'); // Retired from all screens on 2026-09-14.
    expect(app).not.toMatch(/rows=\{railRows\}\s*\n\s*now=\{now\}/);
    expect(rail).toMatch(/agoQuiet\(r\.at, now\)/);
    expect(rail).not.toMatch(/\bago\(r\.at/);
  });
});
