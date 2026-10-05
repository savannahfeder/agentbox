// THE OPTIONS STOOD AT THE FOOT OF EVERY THREAD THAT EVER ASKED ONE.
//
// Said 2026-10-05, with a screenshot of a thread whose conversation had moved
// well past the question: "right now all my chats have this stuck at the
// bottom. it should instead occur at the end of the turn/message where it
// occured, not stuck at the bottom... Once I've seen it as a user, I don't
// really want to see it continuously. It's been processed."
//
// Measured before the change: the strip was a child of `.focus-dock`, a
// sibling of the scroll, so it was on the screen for as long as the task was
// open however far you had scrolled, and it vanished the instant you answered
// (`offerIsLive` went false and nothing was drawn in its place).
//
// Two facts are pinned here and they are the two halves of what was asked for.
//
// 1. WHICH TURN IT IS ON. One rule, `offerOnTurn`, comparing the turn's own
//    words against the field the offer came off. The case that must NOT match
//    is the one that would put a second copy of the question somewhere in the
//    middle of the thread: another message on the same row, and an older
//    message that merely mentions the same words.
//
// 2. WHEN IT STOPS BEING A QUESTION. Answered is answered whether you pressed
//    a number or typed a sentence: both are your next word on the row, and
//    `offerIsLive` already reads it that way. What is new is that the spent
//    offer is still drawn, in place, as the record of what was offered, with
//    the one you pressed marked. So `picked` is a number after a press and
//    null after prose, and the block says a different thing in each case.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { offerFor, offerOnTurn, pickedOption } from '../renderer/src/offer-in-thread.ts';

const OFFER = [
  '## Options',
  '1. Merge it (recommended)',
  '2. Take the extra beat off the rare card first',
].join('\n');

// The row off the screenshot: your own directive, your reply from an hour ago,
// and a worker's result written three minutes ago with the pick in it.
const RESULT = `**The second card is at 200ms, ready to merge.**\n\nAll five cards turn at the same speed now.\n\n${OFFER}`;
const yours = (over = {}) => ({
  title: 'The booster opening animation is too slow on the second card.',
  body: 'It feels fine on the first and then it drags.',
  answer: 'Yes, try it at 200ms and show me.',
  result: RESULT,
  wrote: { answer: { ts: 1000, source: 'founder' }, result: { ts: 2000, source: 'agent' } },
  ...over,
});

describe('the offer names the turn it was made on', () => {
  it('comes off the field the pane is leading with, in that field\'s own words', () => {
    const offer = offerFor(yours());
    expect(offer.text).toBe(RESULT);
    expect(offer.options.map((o) => o.n)).toEqual([1, 2]);
    expect(offer.live).toBe(true);
  });

  it('sits on the turn whose words are that field', () => {
    const offer = offerFor(yours());
    expect(offerOnTurn(RESULT, offer)).toBe(true);
    // Trailing whitespace is how the same text arrives from the ledger.
    expect(offerOnTurn(`${RESULT}\n`, offer)).toBe(true);
  });

  it('and on NO other turn in the thread', () => {
    const offer = offerFor(yours());
    // Your own message, the checkpoint before it, and an older message that
    // happens to carry the same list: none of them is the turn it was asked on.
    expect(offerOnTurn('Yes, try it at 200ms and show me.', offer)).toBe(false);
    expect(offerOnTurn('Still measuring the second card.', offer)).toBe(false);
    expect(offerOnTurn(`An older round said this.\n\n${OFFER}`, offer)).toBe(false);
    expect(offerOnTurn(undefined, offer)).toBe(false);
  });

  it('is nothing at all on a row that offered no pick', () => {
    expect(offerFor({ result: 'Merged. Nothing needs you.' })).toBe(null);
    expect(offerOnTurn('Merged. Nothing needs you.', null)).toBe(false);
  });
});

describe('once you have spoken it is a record, not a question', () => {
  it('is live while your last word is older than the offer', () => {
    expect(offerFor(yours()).live).toBe(true);
  });

  it('is spent the moment you press a number, and says which one', () => {
    const offer = offerFor(yours({
      answer: 'Option 2: Take the extra beat off the rare card first',
      wrote: { answer: { ts: 3000, source: 'founder' }, result: { ts: 2000, source: 'agent' } },
    }));
    expect(offer.live).toBe(false);
    expect(offer.picked).toBe(2);
  });

  it('is spent when you answer in prose instead, with nothing marked', () => {
    // The case this row had to decide: a question you scrolled past and
    // replied to in your own words is just as answered as one you pressed.
    const offer = offerFor(yours({
      answer: 'Merge it but leave the rare card alone.',
      wrote: { answer: { ts: 3000, source: 'founder' }, result: { ts: 2000, source: 'agent' } },
    }));
    expect(offer.live).toBe(false);
    expect(offer.picked).toBe(null);
  });

  it('is still drawn once spent, on the same turn, so the record stays in place', () => {
    const offer = offerFor(yours({
      answer: 'Option 1: Merge it',
      wrote: { answer: { ts: 3000, source: 'founder' }, result: { ts: 2000, source: 'agent' } },
    }));
    expect(offer).not.toBe(null);
    expect(offerOnTurn(RESULT, offer)).toBe(true);
  });

  it('does not let your reply from an hour ago spend an offer written since', () => {
    // The boundary either side of the one that matters: the answer BEFORE the
    // offer leaves it live, the answer AFTER it spends it.
    expect(offerFor(yours({ wrote: { answer: { ts: 1999, source: 'founder' }, result: { ts: 2000, source: 'agent' } } })).live).toBe(true);
    expect(offerFor(yours({ wrote: { answer: { ts: 2001, source: 'founder' }, result: { ts: 2000, source: 'agent' } } })).live).toBe(false);
  });

  it('counts a withdrawn answer as no answer', () => {
    const offer = offerFor(yours({ answer: '(withdrawn)', wrote: { answer: { ts: 3000, source: 'founder' }, result: { ts: 2000, source: 'agent' } } }));
    expect(offer.live).toBe(true);
    expect(offer.picked).toBe(null);
  });
});

describe('which number you pressed, read off your own answer', () => {
  it('reads the words a pick is written in', () => {
    // App.tsx writes `Option N: <the option as the thread drew it>`.
    expect(pickedOption({ answer: 'Option 3: Leave it on the branch' })).toBe(3);
  });

  it('is null for anything you typed yourself', () => {
    expect(pickedOption({ answer: 'Option one please' })).toBe(null);
    expect(pickedOption({ answer: 'I would merge it, option 2 is fine too' })).toBe(null);
    expect(pickedOption({ answer: '' })).toBe(null);
    expect(pickedOption({})).toBe(null);
  });
});

describe('it is drawn in the stream and not on the dock any more', () => {
  const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  const focus = read('renderer/src/components/Focus.tsx');
  const thread = read('renderer/src/components/ItemThread.tsx');
  const css = read('renderer/src/styles.css');

  it('the dock card no longer holds an options strip', () => {
    const dock = focus.slice(focus.indexOf('<div className="focus-dock">'));
    expect(dock).not.toMatch(/className="opt-strip/);
  });

  it('the conversation is what draws it, on the turn it matched', () => {
    expect(thread).toMatch(/offerOnTurn/);
    expect(thread).toMatch(/OptionBlock/);
  });

  it('an option in the stream is never cut off, because nothing is docked', () => {
    // The two-line clamp was the docked strip's rule: it had a fixed slice of
    // the pane to live in. In the stream the message sets the width and the
    // option reads whole, which is what took the hover card away with it.
    const inline = css.match(/\.opt-strip-inline \.opt-text \{([^}]*)\}/s);
    expect(inline, 'no .opt-strip-inline .opt-text rule').toBeTruthy();
    expect(inline[1]).toMatch(/-webkit-line-clamp:\s*none/);
    expect(css).not.toMatch(/\.opt-peek/);
  });
});
