// THE STRIP NAMED ITS OWN CONTROL AND NEVER THE CHOICE.
//
// The ask is up in the message, and the message scrolls while the strip is
// docked, so by the time she has read down to three numbered answers the
// sentence they answer is off the top of the screen.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { askLine, ASK_BUDGET } from '../renderer/src/ask-line.ts';
import { optionsFrom } from '../renderer/src/format.ts';

const OFFER = ['## Options', '1. Merge it (recommended)', '2. Leave it on the branch'].join('\n');

describe('the question sits above the options', () => {
  it('takes the ask off the field the options came off, not off the body by habit', () => {
    const item = {
      title: 'The booster opening animation is too slow on the second card.',
      body: 'Make the second card open faster, please.',
      result: `**The second card is at 200ms and it is on the branch, ready to merge.**\n\nAll five cards turn at the same speed now.\n\n${OFFER}`,
    };
    expect(optionsFrom(item)).toBe('result');
    expect(askLine(item)).toBe('The second card is at 200ms and it is on the branch, ready to merge.');
  });

  it('reads a checkpoint the same way, so a run that has not finished still says what it is asking', () => {
    const item = { body: 'Hers.', note: `**Thirty seconds or forty five?**\n\nBoth cuts are rendered.\n\n${OFFER}` };
    expect(optionsFrom(item)).toBe('note');
    expect(askLine(item)).toBe('Thirty seconds or forty five?');
  });

  it('takes the bold opening alone when the paragraph carries context after it', () => {
    const item = { body: `**Pick a dark palette, A or B.** Both are drawn against the real ground.\n\n${OFFER}` };
    expect(askLine(item)).toBe('Pick a dark palette, A or B.');
  });

  // The title is in the band ABOVE the scroll, so it is on the screen the whole
  // time. A heading repeating it would spend this line saying what can
  // already be read, and on a message written as one paragraph the title is a
  // label cut FROM the body (message-split.ts).
  it('never repeats the title she can already see', () => {
    const title = 'The landing page headline is too long.';
    const item = { title, body: `${title} It runs to three lines on a laptop.\n\n${OFFER}` };
    expect(askLine(item)).toBe('It runs to three lines on a laptop.');
  });

  it('walks past the furniture: headings, pasted pictures and the list itself', () => {
    const item = { body: `## Context\n\n![shot](fixture://a.png)\n\nThe toggle is below the fold.\n\n${OFFER}` };
    expect(askLine(item)).toBe('The toggle is below the fold.');
  });

  // A recap is the one thing that may not have this line.
  it('walks past a "Where we were" recap to reach something that is an answer', () => {
    const item = {
      body: ['## Where we were', 'You asked for a pricing page. You said annual default felt presumptuous.', '',
        '## Context', 'The page is rebuilt with the monthly default.', '', OFFER].join('\n'),
    };
    expect(askLine(item)).toBe('The page is rebuilt with the monthly default.');
  });

  it('keeps whole sentences and never runs past two lines of heading', () => {
    const long = `${'A sentence that just keeps going and going. '.repeat(8)}\n\n${OFFER}`;
    const out = askLine({ body: long });
    expect(out.length).toBeLessThanOrEqual(ASK_BUDGET);
    expect(out.endsWith('.')).toBe(true);
  });

  it('says nothing at all when the field has no sentence in it, and the old label stands in', () => {
    expect(askLine({ body: OFFER })).toBe('');
    // The strip's markup lives in its own component since w-560647d4db, when it
    // moved off the reply card and onto the turn that offered it.
    const focus = readFileSync(new URL('../renderer/src/components/OptionsOffer.tsx', import.meta.url), 'utf8');
    expect(focus).toMatch(/\{ask \|\| 'Their options · pick or write your own'\}/);
  });

  it('is drawn as a sentence rather than in the label\'s small caps', () => {
    const css = readFileSync(new URL('../renderer/src/styles.css', import.meta.url), 'utf8');
    const rule = css.slice(css.indexOf('.opt-head-ask span'), css.indexOf('.opt-collapse {'));
    expect(rule).toMatch(/text-transform: none/);
    expect(rule).toMatch(/-webkit-line-clamp: 2/);
  });
});
