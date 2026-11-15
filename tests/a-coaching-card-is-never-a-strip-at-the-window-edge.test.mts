// A COACHING CARD IS NEVER A STRIP OF TWO-WORD LINES AT THE EDGE OF THE WINDOW.
//
// Photographed on 2026-10-25 on the tutorial beat that teaches replying: the
// card beside the reply box was about 100px wide, breaking "Press R or click
// the reply box to ask for that, or E to mark it done." into a dozen lines
// against the right edge. The step that teaches the reply was the hardest one
// in the walk to read.
//
// The cause is in the placement, not in the words. A card put beside its ring
// is given a `left` and no `right`, so what it actually gets is whatever is
// left of the window. Beside the reply box, which is as wide as its pane, that
// was 74px on the 1448px window in the shot.
//
// The numbers below are read off that screenshot (1280px wide at a scale of
// 1.5) and off the same shot's ⌘K beat, which is the case that must keep its
// card beside the ring.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BESIDE_MIN, TEXT_MAX, fitsBeside, padFor, ring,
} from '../renderer/src/onboarding.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const walk = strip(read('renderer/src/components/Onboarding.tsx'));

const VIEW = { w: 1448, h: 986 };
/** The reply box with its ring, measured in the shot. It is nearly the width
 *  of its pane, which is the whole of this bug. */
const DOCK = { x: 364, y: 897, w: 944, h: 51 };
/** The command bar on the ⌘K beat of the same walk: a modal in the middle, with
 *  a third of the window left beside it. */
const PALETTE = { x: 408, y: 196, w: 630, h: 400 };
/** Where a card beside a ring starts: 26px off the ring's right edge. */
const asideAt = (box) => Math.round(box.x + box.w + padFor(box) + 26);

describe('whether there is room beside the ring', () => {
  it('says no beside a reply box as wide as its pane', () => {
    const left = asideAt(DOCK);
    expect(VIEW.w - left).toBeLessThan(BESIDE_MIN);
    expect(fitsBeside(left, VIEW)).toBe(false);
  });

  it('says yes beside the command bar, which is the beat that wants it', () => {
    expect(fitsBeside(asideAt(PALETTE), VIEW)).toBe(true);
  });

  // AND THE SAME BEAT KEEPS ITS CARD BESIDE THE REPLY BOX WHEN THERE IS ROOM,
  // which is what it was moved there for on 2026-10-06: above the box the card
  // covered the agent's answer, and four persona testers said so. What was
  // missing is that the reply box is as wide as its pane, and with the summary
  // panel shut that pane is the window. With it open the pane ends 364px short
  // of the right edge (1440x900, tests/the-coach-ring-lands-on-the-thing).
  it('keeps the card beside the reply box when the summary panel is open', () => {
    const PANE_RIGHT = 1076;
    const dock = { x: 176, y: 820, w: PANE_RIGHT - 176, h: 51 };
    expect(fitsBeside(asideAt(dock), { w: 1440, h: 900 })).toBe(true);
  });

  // The boundary either side of the rule itself, so a later change to the
  // margin cannot quietly take the floor with it.
  it('holds the floor at the width a card can be read in', () => {
    expect(fitsBeside(1000, { w: 1000 + BESIDE_MIN + 24 })).toBe(true);
    expect(fitsBeside(1000, { w: 1000 + BESIDE_MIN + 23 })).toBe(false);
  });
});

describe('where the card goes instead', () => {
  // Above the reply box, which is where this beat's card sat until 2026-10-06
  // and was moved off because it covered the agent's answer. It is the lesser
  // of the two only here, where the choice is a whole card over a thread that
  // is mostly empty or a 100px strip of two-word lines. Where there is room
  // beside the box the card stays beside it, as it does above.
  it('puts a whole card above the reply box', () => {
    const g = ring(DOCK, { left: 0, right: VIEW.w }, VIEW);
    expect(g.below).toBe(false);
    expect(g.text.w).toBe(TEXT_MAX);
    expect(g.text.y).toBeLessThan(DOCK.y);
  });
});

describe('the walk asks before it places a card beside a ring', () => {
  it('draws the beside card only when it fits', () => {
    expect(walk).toMatch(/const aside = !!beside && fitsBeside\(asideAt, \{ w: window\.innerWidth \}\)/);
    expect(walk).toMatch(/\{aside \? \(/);
    // The old branch asked only whether the beat wanted a card beside its ring.
    expect(walk).not.toMatch(/\{beside \? \(/);
  });
});
