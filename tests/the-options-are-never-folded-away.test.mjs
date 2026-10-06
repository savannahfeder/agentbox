// THE OPTIONS CARRY NO DROPDOWN.
//
// Said 2026-10-05 on w-2e13752a85, with a picture of the block drawn in the
// conversation: "hilariously this is actually a great feature. i almost never
// read these when attached to the chat but now it basically agreggates it into
// a nice component that's quick to read. just remove the dropdown as it's not
// needed and it'd be perfect."
//
// The chevron was right for a docked strip, where the block stood over the
// composer for as long as the thread was open and folding it was the only way
// to get the screen back. Drawn at its own turn it scrolls away by itself, so
// the fold answers a question nobody is asking any more — and a control that
// does nothing worth doing is one more thing to read past.
//
// So: no chevron, no held state, and every option is on the screen always.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OptionsOffer } from '../renderer/src/components/OptionsOffer.tsx';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const OPTIONS = [
  { n: 1, text: 'Do that — delete the card, open the Mac’s folder window', recommended: true },
  { n: 2, text: 'Same, but after picking, one small line to confirm the name', recommended: false },
];

const draw = (over = {}) => renderToStaticMarkup(React.createElement(OptionsOffer, {
  ask: 'Scrap the whole thing: New project just opens the Mac’s folder window.',
  askAll: 'Scrap the whole thing: New project just opens the Mac’s folder window.',
  options: OPTIONS,
  peekOption: null,
  askPeek: false,
  selectedOption: null,
  selRef: { current: null },
  onPick: () => {},
  onOptionEnter: () => {},
  onAskEnter: () => {},
  setPeek: () => {},
  setAskPeek: () => {},
  ...over,
}));

describe('the options block, drawn', () => {
  it('carries no fold: no chevron button and no chevron', () => {
    const html = draw();
    expect(html).not.toContain('opt-collapse');
    expect(html).not.toContain('<svg');
  });

  it('still says the question and still draws every option', () => {
    const html = draw();
    expect(html).toContain('Scrap the whole thing');
    expect(html.match(/class="opt-row[^"]*"/g)).toHaveLength(2);
    expect(html).toContain('>1<');
    expect(html).toContain('>2<');
    expect(html).toContain('recommended');
  });

  it('still opens the card over an option that is being pointed at', () => {
    const html = draw({ peekOption: { n: 2, text: 'Same, but after picking, one small line', recommended: false } });
    expect(html).toContain('opt-peek');
    expect(html).toContain('Option 2, in full');
  });

  it('and over the question', () => {
    expect(draw({ askPeek: true })).toContain('The question, in full');
  });
});

describe('nothing is left holding the fold open', () => {
  it('the block takes no open flag and no setter', () => {
    const src = read('renderer/src/components/OptionsOffer.tsx');
    expect(src).not.toContain('optsOpen');
    expect(src).not.toContain('setOptsOpen');
  });

  it('the pane keeps no state for it', () => {
    const focus = read('renderer/src/components/Focus.tsx');
    expect(focus).not.toContain('optsOpen');
  });

  it('and the stylesheet carries no rule for a control that is gone', () => {
    expect(read('renderer/src/styles.css')).not.toContain('.opt-collapse');
  });
});
