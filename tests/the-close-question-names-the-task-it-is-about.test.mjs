// THE CLOSE QUESTION NAMES THE TASK IT IS ABOUT, AND OPENS IT (w-66748120f2).
//
// "when it does this idk how to find the missing thread, bad ux". Pressing E on
// a long thread raised "Before this closes: one task it filed has not started."
// and nothing else. The task's own row sits on the turn that filed it, which
// was folded behind "Show 8 earlier messages" in a built copy of the app with
// that thread's shape, so nothing on screen said which task or where it was.
// Now the question lists each waiting task by its title, and a click opens it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { closeAsk } from '../renderer/src/close-asks-first.ts';
import { OptionsOffer } from '../renderer/src/components/OptionsOffer.tsx';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const strip = (extra) => {
  const ask = closeAsk(1);
  return renderToStaticMarkup(React.createElement(OptionsOffer, {
    ask: ask.ask, askAll: ask.ask, options: ask.options, peekOption: null, askPeek: false,
    selectedOption: null, selRef: { current: null }, onPick: () => {},
    onOptionEnter: () => {}, onAskEnter: () => {}, setPeek: () => {}, setAskPeek: () => {},
    keep: { label: 'Keep this thread open', onKeep: () => {} }, ...extra,
  }));
};

describe('the tasks a close question names', () => {
  it('draws the waiting task by its title, between the question and the options', () => {
    const html = strip({ named: { rows: [{ id: 'w-k1', title: 'The Later tab is slow' }], onOpen: () => {} } });
    expect(html).toContain('The Later tab is slow');
    const at = html.indexOf('The Later tab is slow');
    expect(at).toBeGreaterThan(html.indexOf('Before this closes'));
    expect(at).toBeLessThan(html.indexOf('Approve it, then close'));
  });

  it('draws one row per task when several wait', () => {
    const rows = [{ id: 'a', title: 'First one' }, { id: 'b', title: 'Second one' }, { id: 'c', title: 'Third one' }];
    const html = strip({ named: { rows, onOpen: () => {} } });
    expect(html.match(/class="opt-named-row"/g)).toHaveLength(3);
  });

  it('draws nothing extra when no task is named, as on every other offer', () => {
    expect(strip({})).not.toContain('opt-named');
    expect(strip({ named: { rows: [], onOpen: () => {} } })).not.toContain('opt-named');
  });

  it('opens the task it names on a click', () => {
    const src = read('renderer/src/components/OptionsOffer.tsx');
    expect(src).toMatch(/className="opt-named-row"[^>]*onClick=\{\(\) => named\.onOpen\(r\.id\)\}/);
  });
});

describe('where the names come from', () => {
  const app = read('renderer/src/App.tsx');
  const focus = read('renderer/src/components/Focus.tsx');

  it('names the waiting tasks only on the question about filed tasks', () => {
    expect(app).toMatch(/const named = closeAskWhy === 'filed' \? waitingFiled\(focused\)\.map\(\(i\) => \(\{ id: i\.id, title: rowTitle\(i\) \}\)\) : undefined;/);
  });

  it('passes them to the question in the pane and in full screen, opening each like a filed row', () => {
    expect(focus.match(/named=\{closeAsk\.named && \{ rows: closeAsk\.named, onOpen: openFiled \}\}/g)).toHaveLength(2);
  });
});
