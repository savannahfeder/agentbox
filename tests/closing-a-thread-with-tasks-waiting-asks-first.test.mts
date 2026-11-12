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
// into the question that was skipped. The words were rewritten in
// w-66748120f2: "Approve it, then close" read as the agent approving, "Drop it"
// said nothing, and the esc row beside the numbers was one more thing to work
// out, so it is three numbered answers.
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

  it('with one waiting, offers to start it, close both, or keep the thread, starting first', () => {
    const ask = closeAsk(1);
    expect(ask.ask).toBe('Before this thread closes, what happens to the task it filed?');
    expect(words(ask)).toEqual([
      'Start the task in a new thread, then close this one',
      'Close both without starting the task',
      'Keep this thread open',
    ]);
    expect(ask.options.map((o) => o.act)).toEqual(['start', 'drop', 'keep']);
    expect(ask.options.filter((o) => o.recommended).map((o) => o.n)).toEqual([1]);
    expect(ask.options.map((o) => o.n)).toEqual([1, 2, 3]);
  });

  it('with two, says both, and recommends keeping the thread to decide each one', () => {
    const ask = closeAsk(2);
    expect(ask.ask).toBe('Before this thread closes, what happens to the two tasks it filed?');
    expect(words(ask)).toEqual([
      'Start both in new threads, then close this one',
      'Close this thread and both tasks without starting them',
      'Keep this thread open and decide each one',
    ]);
    expect(ask.options.map((o) => o.act)).toEqual(['start', 'drop', 'decide']);
    expect(ask.options.filter((o) => o.recommended).map((o) => o.n)).toEqual([3]);
  });

  it('with three, says all three', () => {
    const ask = closeAsk(3);
    expect(ask.ask).toBe('Before this thread closes, what happens to the three tasks it filed?');
    expect(words(ask)).toContain('Start all three in new threads, then close this one');
    expect(words(ask)).toContain('Close this thread and all three tasks without starting them');
  });

  it('past the words it has, falls back to the number rather than inventing one', () => {
    const ask = closeAsk(12);
    expect(ask.ask).toBe('Before this thread closes, what happens to the 12 tasks it filed?');
    expect(words(ask)).toContain('Start all 12 in new threads, then close this one');
  });

  it('never words an option as approving or dropping', () => {
    for (const n of [1, 2, 5]) expect(words(closeAsk(n)).join(' ')).not.toMatch(/approve|drop/i);
  });
});

describe('the strip it is drawn in', () => {
  const ask = closeAsk(2);
  const html = renderToStaticMarkup(React.createElement(OptionsOffer, {
    ask: ask.ask, askAll: ask.ask, options: ask.options, peekOption: null, askPeek: false,
    selectedOption: null, selRef: { current: null }, onPick: () => {},
    onOptionEnter: () => {}, onAskEnter: () => {}, setPeek: () => {}, setAskPeek: () => {},
  }));

  it('draws three numbered rows and no esc row', () => {
    expect(html.match(/class="opt-row/g)).toHaveLength(3);
    expect(html).not.toContain('>esc<');
    expect(html).toContain('Before this thread closes, what happens to the two tasks it filed?');
  });
});

describe('where the question is wired', () => {
  const app = read('renderer/src/App.tsx');
  const focus = read('renderer/src/components/Focus.tsx');

  it('stops every close at one place, markDone, unless the close was the answer', () => {
    expect(app).toMatch(/const markDone = useCallback\(async \(item: WorkItem, \{ stay, force, unshippedOk[,\w\s]*\}/);
    expect(app).toMatch(/if \(unshipped \|\| \(!force && waitingFiled\(item\)\.length\)\)/);
  });

  it('closes for real once the question is answered, and only then', () => {
    expect(app).toMatch(/markDone\(item, \{ force: true, unshippedOk: true \}\)/);
  });

  it('keeps the thread open on keeping it and on deciding each one', () => {
    expect(app).toContain("if (option.act === 'keep' || option.act === 'decide') return;");
  });

  it('gives the number keys, the arrows, Enter and esc to the question while it is up', () => {
    expect(app).toMatch(/if \(asking && closeAskOwnsKey\(e\.key\)\) \{/);
    expect(app).toMatch(/answerCloseAsk\(focused, /);
  });

  it('draws the question in the place of the offer, in the pane and on the card', () => {
    expect(focus).toMatch(/closeAsk \?/);
    expect(focus).toContain('{!fullScreenDoc && !askAtTask && closeAskStrip(false)}');
    expect(focus).toContain('{fullScreenDoc && closeAskStrip(true)}');
  });
});
