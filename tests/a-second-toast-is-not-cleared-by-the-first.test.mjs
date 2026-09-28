// A TOAST RAISED INSIDE THE LAST ONE'S LIFE WAS WIPED BY THE LAST ONE'S TIMER.
//
// Every call to `showToast` set a `setTimeout` to clear the bar and none of them
// was ever cancelled, so the first timer to land took down whatever was on the
// screen by then, however new it was.
//
// Measured 2026-09-27 on the built renderer, while proving the undo question
// (scripts/proof-stale-undo.mjs, the "Z, then another key, then Z" round): Z
// asked its question, another key answered no, and Z asked again 1.8 seconds
// later. The second question was cleared 0.7 seconds after it appeared, by the
// timer belonging to the first one, and the shot came back with an empty bar.
//
// Two toasts in quick succession is the ordinary case for a keyboard, not an
// edge one: undo, close, snooze and reply all speak, and she is fast.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, '..', 'renderer', 'src', 'App.tsx'), 'utf8');

describe('how long a toast stays', () => {
  it('cancels the previous timer before it starts its own', () => {
    expect(app).toContain('if (toastTimer.current) clearTimeout(toastTimer.current);');
    const clear = app.indexOf('if (toastTimer.current) clearTimeout(toastTimer.current);');
    const set = app.indexOf('toastTimer.current = setTimeout(() => setToast(null)');
    expect(clear).toBeGreaterThan(-1);
    expect(set).toBeGreaterThan(clear);
  });

  it('keeps the two lifetimes it already had', () => {
    expect(app).toContain('setToast(null), goes ? 6000 : 2500');
  });

  // The whole point is that there is ONE timer, so a second bare setTimeout that
  // clears the bar would bring the fault straight back. Her click on a toast that
  // carries a way in still dismisses it by hand, which is not a timer and is not
  // this fault.
  it('has no other timer that clears the bar', () => {
    const timers = app.split('\n').filter((l) => l.includes('setToast(null)') && l.includes('setTimeout'));
    expect(timers).toEqual(['    toastTimer.current = setTimeout(() => setToast(null), goes ? 6000 : 2500);']);
  });
});
