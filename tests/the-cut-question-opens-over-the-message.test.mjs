// THE QUESTION SHE COULD ONLY SEE HALF OF.
//
// Both of its promises carry over and both are pinned here, because both are
// the kind of thing a later edit undoes without noticing: nothing in the flow
// moves, and hover is the only thing that opens it.
//
// The measurement is the part that is NOT like the option, and it is the whole
// reason this needed its own function. An option is cut by a CSS clamp, which
// the DOM will report. The question is cut twice: `clipToSentence` takes the
// string down to 130 characters before React ever sees it, and the clamp cuts
// whatever survives that. A heading cut by the budget fits its two lines
// comfortably and measures as not clipped, so reading the box alone would have
// left the card shut on exactly the rows she is complaining about. Measured
// across her fifteen ledgers on 2026-08-29: 303 of the 450 rows that draw an
// offer lose words to the budget, at a median ask length of 263 characters.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { askLine, askFull, askIsClipped, ASK_BUDGET } from '../renderer/src/ask-line.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const focus = fs.readFileSync(path.join(root, 'renderer/src/components/Focus.tsx'), 'utf8');

const OFFER = ['## Options', '1. Merge it (recommended)', '2. Leave it on the branch'].join('\n');
// The row in her screenshot, as an agent wrote it: two sentences, no bold, so
// the whole paragraph is the ask and the budget takes the second sentence off.
const HERS = {
  title: 'Codex read the checklist',
  result: `Codex reviewed the checklist. Eight defects I verified in our own files, including an Android hole and a photo rule the archive never applied, and three of them are one-line fixes.\n\n${OFFER}`,
};
const FITS = { body: `**Thirty seconds or forty five?**\n\nBoth cuts are rendered.\n\n${OFFER}` };

describe('the heading keeps the whole question behind it', () => {
  it('still shows the clipped line, so the strip is unchanged', () => {
    expect(askLine(HERS).length).toBeLessThanOrEqual(ASK_BUDGET + 1);
    expect(askLine(HERS).endsWith('…') || askLine(HERS).endsWith('.')).toBe(true);
  });

  it('keeps the words the budget took, and they are the same sentence', () => {
    const full = askFull(HERS);
    expect(full.length).toBeGreaterThan(askLine(HERS).length);
    expect(full).toContain('the archive never applied');
    // Not a different message: what she is half-reading opens the card.
    expect(full.startsWith('Codex reviewed the checklist.')).toBe(true);
  });

  it('reads the ask off the same field the options came off', () => {
    // The card and the strip's heading are one walk over one field, so they
    // can never be from two different rounds.
    const item = { body: 'Hers, and no worker may rewrite it.', result: HERS.result, title: HERS.title };
    expect(askFull(item).startsWith('Codex reviewed')).toBe(true);
  });
});

describe('it opens only on a question that is actually cut', () => {
  it('opens on the one she screenshotted, which the DOM calls unclipped', () => {
    // 130 characters sit inside two lines, so the box reports no cut at all.
    // The string test is what catches this, and it is the common case.
    const box = { scrollHeight: 36, clientHeight: 36 };
    expect(askIsClipped(askLine(HERS), askFull(HERS), box)).toBe(true);
  });

  it('is quiet on a question that fits', () => {
    expect(askIsClipped(askLine(FITS), askFull(FITS), { scrollHeight: 18, clientHeight: 18 })).toBe(false);
  });

  it('still opens when the clamp is the thing doing the cutting', () => {
    // A 128-character ask survives the budget whole and still wants three
    // lines on a narrow pane. Either cut is words she cannot see.
    expect(askIsClipped('same', 'same', { scrollHeight: 54, clientHeight: 36 })).toBe(true);
  });

  it('does not call a rounded line box a cut', () => {
    expect(askIsClipped('same', 'same', { scrollHeight: 36, clientHeight: 35.6 })).toBe(false);
  });

  it('stays shut before anything has been measured, unless the string says otherwise', () => {
    expect(askIsClipped('same', 'same', null)).toBe(false);
    expect(askIsClipped(askLine(HERS), askFull(HERS), null)).toBe(true);
  });

  it('has nothing to open on a row with no ask at all', () => {
    expect(askIsClipped('', '', { scrollHeight: 54, clientHeight: 18 })).toBe(false);
  });
});

describe('it behaves like the option card it was asked to copy', () => {
  it('opens on the pointer and shuts when it leaves', () => {
    expect(focus).toMatch(/onMouseEnter=\{\(e\) => onAskEnter\(e\.currentTarget\)\}/);
    expect(focus).toMatch(/onMouseLeave=\{\(\) => setAskPeek\(false\)\}/);
  });

  it('uses the same card, so nothing in the flow moves', () => {
    // .opt-peek is absolute, bottom: 100%, pointer-events: none. Its own test
    // holds those; what matters here is that this reuses it rather than
    // inventing a box that grows the strip.
    expect(focus).toMatch(/askPeek && \(\s*<div className="opt-peek">/);
    expect(focus).toMatch(/The question, in full/);
  });

  it('never stacks two cards in the one slot', () => {
    expect(focus).toMatch(/\{!peekOption && askPeek &&/);
  });

  it('is drawn before the option rows, so the last row keeps its padding', () => {
    expect(focus.indexOf('The question, in full')).toBeLessThan(focus.indexOf('className={`opt-row'));
  });
});
