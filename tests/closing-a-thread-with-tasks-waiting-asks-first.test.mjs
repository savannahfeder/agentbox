// CLOSING A THREAD WITH TASKS STILL WAITING ON YOU ASKS FIRST (w-d2744c6daa).
//
// "I feel like I often miss these filed tasks from this thread that need my
// review... they're not very visible and it's really easy to skip them."
//
// Measured on the real store, 2026-10-07: 15 tasks filed under threads in two
// and a half weeks, and one of them had waited 22 hours under a thread that
// was already closed. That thread's answer offered one option, "Close this
// task", with the filed task in a quiet list above it and nothing that stopped
// a close from walking straight past it.
//
// So a close (E, the "Close this task" option, the pane's button, ⌘K) on a
// thread with tasks still waiting for a yes does not close. The options turn
// into the question that was skipped, in the words chosen off the drawings:
// with one waiting, approve it or drop it; with several, decide each one,
// start them all, or drop them all; and esc keeps the thread open.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { closeAsk } from '../renderer/src/close-asks-first.ts';
import { OptionsOffer } from '../renderer/src/components/OptionsOffer.tsx';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const words = (ask) => ask.options.map((o) => o.text);

describe('the question a close asks', () => {
  it('asks nothing when no task is waiting, so the close goes through', () => {
    expect(closeAsk(0)).toBeNull();
  });

  it('with one waiting, offers to approve it or drop it, approve first', () => {
    const ask = closeAsk(1);
    expect(ask.ask).toBe('Before this closes: one task it filed has not started.');
    expect(words(ask)).toEqual(['Approve it, then close', 'Drop it, then close']);
    expect(ask.options.map((o) => o.act)).toEqual(['start', 'drop']);
    expect(ask.options[0].recommended).toBe(true);
    expect(ask.options.map((o) => o.n)).toEqual([1, 2]);
  });

  it('with two, offers to decide each one first, then both at once', () => {
    const ask = closeAsk(2);
    expect(ask.ask).toBe('Before this closes: two tasks it filed have not started.');
    expect(words(ask)).toEqual(['Decide each one', 'Start both, then close', 'Drop both, then close']);
    expect(ask.options.map((o) => o.act)).toEqual(['decide', 'start', 'drop']);
    expect(ask.options[0].recommended).toBe(true);
    expect(ask.options.filter((o) => o.recommended)).toHaveLength(1);
  });

  it('with three, says all three', () => {
    const ask = closeAsk(3);
    expect(ask.ask).toBe('Before this closes: three tasks it filed have not started.');
    expect(words(ask)).toEqual(['Decide each one', 'Start all three, then close', 'Drop all three, then close']);
  });

  it('past the words it has, falls back to the number rather than inventing one', () => {
    const ask = closeAsk(12);
    expect(ask.ask).toBe('Before this closes: 12 tasks it filed have not started.');
    expect(words(ask)).toContain('Start all 12, then close');
  });
});

describe('the esc row under the question', () => {
  const ask = closeAsk(2);
  const props = {
    ask: ask.ask, askAll: ask.ask, options: ask.options, peekOption: null, askPeek: false,
    selectedOption: null, selRef: { current: null }, onPick: () => {},
    onOptionEnter: () => {}, onAskEnter: () => {}, setPeek: () => {}, setAskPeek: () => {},
  };

  it('is drawn with its key when the strip is given a way to keep the thread', () => {
    const html = renderToStaticMarkup(React.createElement(OptionsOffer, { ...props, keep: { label: 'Keep this thread open', onKeep: () => {} } }));
    expect(html).toContain('>esc<');
    expect(html).toContain('Keep this thread open');
    expect(html).toContain('Before this closes: two tasks it filed have not started.');
    expect(html.match(/class="opt-row/g)).toHaveLength(4);
  });

  it('is not drawn under an ordinary offer', () => {
    const html = renderToStaticMarkup(React.createElement(OptionsOffer, props));
    expect(html).not.toContain('>esc<');
    expect(html.match(/class="opt-row/g)).toHaveLength(3);
  });
});

describe('where the question is wired', () => {
  const app = read('renderer/src/App.tsx');
  const focus = read('renderer/src/components/Focus.tsx');

  it('stops every close at one place, markDone, unless the close was the answer', () => {
    expect(app).toMatch(/const markDone = useCallback\(async \(item: WorkItem, \{ stay, force \}/);
    expect(app).toMatch(/if \(!force && waitingFiled\(item\)\.length\)/);
  });

  it('closes for real once the question is answered, and only then', () => {
    expect(app).toMatch(/markDone\(item, \{ force: true \}\)/);
  });

  it('gives the number keys, the arrows, Enter and esc to the question while it is up', () => {
    expect(app).toMatch(/if \(asking\) \{/);
    expect(app).toMatch(/answerCloseAsk\(focused, /);
  });

  it('draws the question in the place of the offer, in the pane and on the card', () => {
    expect(focus).toMatch(/closeAsk \?/);
    expect(focus.match(/keep=\{closeAsk\.keep\}/g)?.length).toBe(2);
  });
});
