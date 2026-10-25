// THREAD ROWS OFTEN NEEDED TWO CLICKS TO OPEN.
//
// QA batch 002, F-41, Oct 23 2026, on the Linux desktop build: "Several rows
// needed two clicks to open." Read off renderer/src/threads/row-drag.ts, which
// is what every list row's press goes through since threads could be dragged
// into an order (w-6e5b532a95):
//
//   A press picked the row up as soon as it had travelled 4px, which is inside
//   the drift of an ordinary click, especially on a trackpad.
//
//   Letting go then ALWAYS swallowed the click, even when the row had been put
//   straight back in its own slot. So a click that wobbled did nothing at all,
//   and the second one opened the thread.
//
// Two halves, so two rules. A press has to travel far enough to mean it before
// it carries anything, and a press that carried the row nowhere is still a
// click. A press called off with Escape is not: it is spent, and letting go
// after it must not open what it was carrying.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lifts, opensTheRow } from '../renderer/src/threads/row-drag.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const drag = fs.readFileSync(path.join(here, '..', 'renderer', 'src', 'threads', 'row-drag.ts'), 'utf8');

describe('how far a press travels before it carries a row', () => {
  it('a still press carries nothing', () => {
    expect(lifts(0, 0)).toBe(false);
  });

  it('the drift of a click carries nothing, including the 4px that used to', () => {
    expect(lifts(3, 3)).toBe(false); // 4.24px: this is what picked rows up
    expect(lifts(0, 7)).toBe(false);
  });

  it('a press that means it carries the row', () => {
    expect(lifts(0, 8)).toBe(true);
    expect(lifts(-40, 120)).toBe(true);
  });
});

describe('whether the click at the end of a press opens the row', () => {
  it('opens it when the press never carried anything', () => {
    expect(opensTheRow({ lifted: false, letGo: true, wandered: false })).toBe(true);
  });

  it('opens it when the row was picked up and put back in its own slot', () => {
    expect(opensTheRow({ lifted: true, letGo: true, wandered: false })).toBe(true);
  });

  // The cases that must NOT open it.
  it('does not open it when the row was carried somewhere else', () => {
    expect(opensTheRow({ lifted: true, letGo: true, wandered: true })).toBe(false);
  });

  it('does not open it when the carry was called off with Escape', () => {
    expect(opensTheRow({ lifted: true, letGo: false, wandered: false })).toBe(false);
    expect(opensTheRow({ lifted: true, letGo: false, wandered: true })).toBe(false);
  });
});

describe('the carry itself', () => {
  it('asks how far the press has travelled rather than measuring it again', () => {
    expect(drag).toContain('if (!lifts(x - h.startX, y - h.startY)) return;');
    expect(drag).not.toMatch(/Math\.hypot\(x - h\.startX/);
  });

  it('remembers whenever the row points at a place that is not its own', () => {
    expect(drag).toContain('if (!stays(h.from, h.to)) h.wandered = true;');
  });

  it('and letting go swallows the click only when the rule says to', () => {
    expect(drag).toContain('swallow.current = !opensTheRow({ lifted: true, letGo: keep, wandered: h.wandered });');
  });
});
