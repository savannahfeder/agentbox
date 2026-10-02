// THE STATUS ROW IN A THREAD'S SUMMARY IS HOW YOU MARK IT DONE WITH A MOUSE.
//
// WHERE THIS CAME FROM, and the half that matters is what it is NOT. The round
// before this one found that somebody who does not use keyboard shortcuts
// cannot clear their inbox: E closes a thread, the hover plate names E and
// refuses the pointer on purpose, and Mark done is a row in the three-dot menu
// inside an opened thread. The first answer was a Done button on the inbox row
// itself, and the founder turned it down (2026-10-01):
//
//   "My thinking is that you really don't mark something done often from the
//    inbox itself so putting that on the inbox item isn't great. We have it as
//    something you can do for the task itself.
//
//    I would also like to address the status here. I think it would be
//    intuitive for people to be able to drop down and mark it done. I think
//    that's better than our Mark Done button in the top-right corner. It's okay
//    if there's some redundancy because it's such a critical action, but I
//    don't think we should have those in the inbox thread on that page. I would
//    disagree with the premise of building buttons for those."
//
// So the mouse route is on the THREAD, in the panel she pointed at, and the
// inbox row keeps nothing to press. Both halves are pinned here, because the
// one that will quietly come back is a button on the row.
//
// ONE ACTION, NOT TWO. The row calls the same `markDone` E calls, handed down
// from Focus as the prop the three-dot menu's Mark done row already takes, so
// the undo, the toast and the move to the next thread are one behaviour. A
// `status: 'done'` written straight through `threadEdit` here would have been a
// second way to close a thread, with its own rules and no undo.
//
// Drawn with react-dom/server, so these are the real components.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SummaryPanel } from '../renderer/src/threads/Summary.tsx';
import { STATE_WORD, statusChoices } from '../renderer/src/threads/summary-rules.ts';
globalThis.React = React;

const NOW = Date.now();
const DAY = 86_400_000;
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const focus = read('renderer/src/components/Focus.tsx');
const list = read('renderer/src/components/List.tsx');
const panel = read('renderer/src/threads/Summary.tsx');

const item = (o = {}) => ({
  id: 'w-acme', product: 'northwind', productName: 'Northwind', status: 'open', kind: 'directive', labels: ['founder'],
  title: 'Can you send Acme their renewal terms by Thursday?', label: 'Acme renewal terms',
  priority: 7, epoch: 0, claim: null, createdAt: NOW - DAY, updatedAt: NOW - DAY,
  result: 'The terms are drafted and ready to send.',
  wrote: { result: { ts: NOW - DAY + 1000, source: 'agent' } },
  ...o,
});
const team = { state: { since: NOW - 7 * DAY, signedIn: true }, me: 'p-me', byId: new Map(), products: new Map() };
const draw = (it, props = {}) => renderToStaticMarkup(
  React.createElement(SummaryPanel, { item: it, items: [it], team, ...props }),
);
const between = (html, a, b) => html.slice(html.indexOf(`>${a}<`), html.indexOf(`>${b}<`));

describe('what the status row offers', () => {
  it('offers Done, and only Done, on a thread that is not finished', () => {
    for (const state of ['waiting', 'running', 'scheduled']) {
      expect(statusChoices(state).map((c) => c.id), state).toEqual(['done']);
      expect(statusChoices(state)[0].word, state).toBe(STATE_WORD.done);
    }
  });

  // THE THREE IT DOES NOT OFFER, each for its own reason and none of them an
  // oversight. In progress is an agent holding the thread and Waiting is nobody
  // holding it: both are facts about what is happening, not choices. Scheduled
  // is a moment somebody picks in the picker, which is a second step and a
  // different gesture. A menu row that cannot be chosen is the dead key this
  // codebase keeps refusing, so they are absent rather than greyed.
  it('offers none of the three a person does not set', () => {
    const words = statusChoices('waiting').map((c) => c.word);
    for (const w of [STATE_WORD.waiting, STATE_WORD.running, STATE_WORD.scheduled]) {
      expect(words, w).not.toContain(w);
    }
  });

  it('offers nothing at all on a thread that is already finished', () => {
    // Un-finishing one exists only as the undo of closing it, so a "Back to
    // inbox" row here would be an action invented to fill the menu out.
    expect(statusChoices('done')).toEqual([]);
  });
});

describe('the status row draws as something you can change', () => {
  const open = draw(item(), { onFinish: () => {} });

  it('is a button with a caret, the same drawing Priority and Visible to use', () => {
    const cell = between(open, 'Status', 'Owner');
    expect(cell).toMatch(/<button[^>]*class="ts-prop-btn"/);
    expect(cell).toContain('ts-caret');
    expect(cell).toContain('aria-haspopup="listbox"');
  });

  it('still says the state it is in, with its own mark', () => {
    expect(between(open, 'Status', 'Owner')).toContain(STATE_WORD.waiting);
  });

  it('goes back to a plain word on a finished thread, with nothing to set', () => {
    const done = draw(item({ status: 'done' }), { onFinish: () => {} });
    const cell = between(done, 'Status', 'Owner');
    expect(cell.length).toBeGreaterThan(0);
    expect(cell).not.toContain('<button');
    expect(cell).toContain(STATE_WORD.done);
  });

  it('goes back to a plain word where nothing was handed in to close with', () => {
    const cell = between(draw(item()), 'Status', 'Owner');
    expect(cell).not.toContain('<button');
  });
});

describe('it is the one action, not a second one', () => {
  it('runs the handler it is given rather than writing the status itself', () => {
    // The press calls `onFinish`. Nothing in the panel writes a status.
    expect(panel).toContain('onClick={() => { setMenu(null); onFinish(); }}');
    expect(panel).not.toMatch(/save\(\{\s*status/);
  });

  it('is handed the same function the three-dot menu Mark done row takes', () => {
    // Focus holds one `canFinish ? onResolve : null` and gives it to both, and
    // App.tsx points onResolve at markDone, which carries the undo and the
    // toast. Two different expressions here would be two behaviours.
    expect(focus).toContain('onFinish={canFinish ? onResolve : null}');
    expect([...focus.matchAll(/onFinish=\{canFinish \? onResolve : null\}/g)]).toHaveLength(2);
    expect(read('renderer/src/App.tsx')).toContain('onResolve={() => markDone(focused)}');
  });
});

describe('and the inbox row still has nothing to press', () => {
  // HER RULE, AND THE ONE THING MOST LIKELY TO BE UNDONE BY ACCIDENT: "you
  // really don't mark something done often from the inbox itself so putting
  // that on the inbox item isn't great... I would disagree with the premise of
  // building buttons for those."
  it('draws no Done or Later button in a row', () => {
    expect(list).not.toMatch(/onClick=\{[^}]*markDone/);
    expect(list).not.toMatch(/onClick=\{[^}]*openSnooze/);
    expect(list).not.toContain('onRowKey');
  });

  it('leaves the hover plate a hint that takes no pointer', () => {
    expect(read('renderer/src/components/HintPlate.tsx')).toContain('It never takes the pointer');
    expect(read('renderer/src/styles.css')).toMatch(/\.hint-plate \{[\s\S]*?pointer-events: none;[\s\S]*?\}/);
  });
});
