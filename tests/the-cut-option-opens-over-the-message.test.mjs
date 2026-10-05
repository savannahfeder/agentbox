// The half of an option that is cut off, readable without the strip growing.
//
// Both halves of that are pinned here, because both are the kind of thing a
// later edit undoes without noticing. The first is a layout promise: the card is out of
// the flow, so a stylesheet that ever puts it back in the flow is the feature
// failing at the exact thing it was for. The second is the trigger: the app already
// tracks a selected option and wiring the card to that instead is a one-word
// change that would open it on every arrow press.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { optionIsClipped, optionPeek } from '../renderer/src/option-peek';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const css = fs.readFileSync(path.join(root, 'renderer/src/styles.css'), 'utf8');
const focus = fs.readFileSync(path.join(root, 'renderer/src/components/Focus.tsx'), 'utf8');
const block = (sel) => {
  const m = css.match(new RegExp(`\\${sel} \\{([^}]*)\\}`, 's'));
  expect(m, `no ${sel} rule`).toBeTruthy();
  return m[1];
};

describe('it opens only on words that are actually cut', () => {
  it('is quiet on an option that fits', () => {
    // Two lines wanted, two lines shown: 68% of her options, and on those the
    // card would only repeat the sentence she is already reading.
    expect(optionIsClipped({ scrollHeight: 41, clientHeight: 41 })).toBe(false);
    expect(optionPeek(1, optionIsClipped({ scrollHeight: 41, clientHeight: 41 }))).toBe(null);
  });

  it('opens on an option with lines under the clamp', () => {
    // Four lines wanted, two shown: option 1 of the row she screenshotted.
    expect(optionIsClipped({ scrollHeight: 82, clientHeight: 41 })).toBe(true);
    expect(optionPeek(1, true)).toBe(1);
  });

  it('does not call a rounded line box a cut', () => {
    // 14px/1.45 is a 20.3px line, so two of them round apart. Without the
    // slack every option in the store reads as clipped.
    expect(optionIsClipped({ scrollHeight: 41, clientHeight: 40.6 })).toBe(false);
  });
});

describe('hover is the only thing that opens it', () => {
  it('is shut when the pointer is on nothing', () => {
    expect(optionPeek(null, true)).toBe(null);
  });

  it('takes the hovered option and nothing else', () => {
    // The signature is the guarantee: there is no selection argument to pass,
    // so keyboard selection cannot reach this decision.
    expect(optionPeek.length).toBe(2);
    expect(optionPeek(3, true)).toBe(3);
  });

  it('is wired to the pointer in the pane, not to the arrow keys', () => {
    expect(focus).toMatch(/onMouseEnter=\{\(e\) => onOptionEnter\(o\.n, e\.currentTarget\)\}/);
    expect(focus).toMatch(/onMouseLeave=\{\(\) => setPeek\(null\)\}/);
    // selectedOption is what the arrow keys move; it must not feed the card.
    expect(focus).not.toMatch(/optionPeek\(selectedOption/);
  });
});

describe('the strip is the same height with it open', () => {
  const peek = block('.opt-peek');

  it('keeps the card out of the flow, above the strip', () => {
    expect(peek).toMatch(/position:\s*absolute/);
    expect(peek).toMatch(/bottom:\s*100%/);
    // Absolute against the strip, not against some ancestor further out.
    expect(block('.opt-strip')).toMatch(/position:\s*relative/);
  });

  it('never takes a click meant for the row underneath', () => {
    expect(peek).toMatch(/pointer-events:\s*none/);
  });

  it('draws the card before the rows, so the last row keeps its padding', () => {
    // .opt-row:last-child carries the strip's bottom padding. Rendered after
    // the rows the card became the last child and the strip measured 4px short.
    expect(focus.indexOf('opt-peek')).toBeLessThan(focus.indexOf('className={`opt-row'));
  });
});
