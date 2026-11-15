// THE THREADS AN AGENT FILED CARRY AN APPROVE BUTTON (w-9cf2b43110).
//
// Said 2026-10-05 on w-560647d4db: "when an agent files another agent i don't
// love that it ends up in my inbox with no clear next step. feels confusing,
// like it wastes my time. better for it to file those and have an approval
// button in that component."
//
// Every thread an agent files is a PROPOSAL: it sits in Needs you and nothing
// runs on it until it is approved. Approving one meant leaving the thread that
// filed it, finding its own row, and acting there — once per thread. The list
// of filed threads now carries the press itself.
//
// Measured on the shipped list (2ed0cce): three filed threads, three separate
// trips out of the pane and back. The two decisions this pins:
//
//   ONE PRESS PER ROW. Approval is consequential and the app has already been
//   burned by a key that approved on someone's behalf (the E-key comment in
//   App.tsx's resolve). Asked for later, the count line gained a Start all
//   for the lot (w-fe64f35bdd, tests/one-press-starts-every-proposal-in-the-list);
//   each row's own press is unchanged.
//
//   AND THE WORD BECOMES "In progress", which is the word the tab already
//   uses. Nothing new is invented: the approve puts the row in the pending
//   grace window, which the In progress list claims (App.tsx `progress`), so
//   the row says it is moving the instant it is pressed and keeps saying so
//   once the answer lands.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { approvableFiled } from '../renderer/src/threads-made.ts';
import { ThreadsMade } from '../renderer/src/components/ThreadsMade.tsx';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
// An ordinary thread an agent filed under another: open, a task, nobody's reply
// on it, and not deliberately parked in Later.
const filed = (over = {}) => ({ id: 'w-kid', status: 'open', kind: 'task', labels: [], ...over });

describe('which filed threads are waiting to be approved', () => {
  it('is an open task an agent filed, which is the whole of the complaint', () => {
    expect(approvableFiled(filed(), 'waiting')).toBe(true);
  });

  it('is not one already approved, because the answer is what starts it', () => {
    expect(approvableFiled(filed({ answer: 'Approved. Run it.' }), 'waiting')).toBe(false);
  });

  it('is one whose approval was withdrawn, which is back to waiting', () => {
    expect(approvableFiled(filed({ answer: '(withdrawn)' }), 'waiting')).toBe(true);
  });

  it('is not one a worker already has, nor a finished or blocked one', () => {
    expect(approvableFiled(filed({ status: 'claimed' }), 'waiting')).toBe(false);
    expect(approvableFiled(filed({ status: 'done' }), 'waiting')).toBe(false);
    expect(approvableFiled(filed({ status: 'blocked' }), 'waiting')).toBe(false);
  });

  it('is not a question or a review, whose options have to be read first', () => {
    expect(approvableFiled(filed({ kind: 'question' }), 'waiting')).toBe(false);
    expect(approvableFiled(filed({ kind: 'review' }), 'waiting')).toBe(false);
  });

  it('is not a thread you wrote yourself: your own work needs no approval', () => {
    expect(approvableFiled(filed({ labels: ['founder'] }), 'waiting')).toBe(false);
  });

  it('is not one written down and deliberately not begun', () => {
    expect(approvableFiled(filed({ start: 'later' }), 'scheduled')).toBe(false);
  });

  // MEASURED BY PRESSING ONE IN THE BUILT APP, which is the only way this was
  // ever going to show up: the word went to IN PROGRESS and the button stayed
  // beside it. Approving holds its write for the undo window, so the row's
  // fields still say "open, no answer" for those few seconds while the inbox
  // has already let it go. The list was offering to start something it was
  // simultaneously reporting as started.
  it('is not one already moving, however open its fields still read', () => {
    const justApproved = filed(); // the ledger has not caught up yet
    expect(approvableFiled(justApproved, 'running')).toBe(false);
    expect(approvableFiled(justApproved, 'done')).toBe(false);
    expect(approvableFiled(justApproved, null)).toBe(false);
  });
});

describe('the button, drawn in the list', () => {
  const rows = [
    { id: 'w-a', title: 'Say why Send is off', state: 'waiting', approve: true },
    { id: 'w-b', title: 'Keep a pasted command exactly as typed', state: 'running' },
  ];
  const html = renderToStaticMarkup(React.createElement(ThreadsMade, { rows, onOpen: () => {}, onApprove: () => {} }));

  it('is one press per waiting thread and none on the rest', () => {
    expect(html.match(/class="made-approve"/g)).toHaveLength(1);
    // RENAMED 2026-10-13 (w-554834e749): the bare "Approve" was the confusing
    // part, and approving a proposal has always meant starting a new thread.
    // Shortened to NEW THREAD in the quiet list (w-fcb5fdc2e5); its accessible
    // name still says it in full.
    expect(html).toContain('>New thread<');
    expect(html).not.toContain('>Approve<');
  });

  it('names the thread it would start, so the press is never ambiguous', () => {
    expect(html).toContain('aria-label="Start new thread: Say why Send is off"');
  });

  it('still opens the thread, which is a second press and not the same one', () => {
    expect(html.match(/class="made-open"/g)).toHaveLength(2);
  });

  it('nests no button inside another, which no browser would accept', () => {
    expect(html).toContain('<div class="made-row');
    expect(html).not.toMatch(/<button[^>]*>(?:(?!<\/button>)[\s\S])*<button/);
  });

  it('draws no press at all where nothing can be approved from', () => {
    const plain = renderToStaticMarkup(React.createElement(ThreadsMade, { rows, onOpen: () => {} }));
    expect(plain).not.toContain('made-approve');
  });

  // THE PRESS TAKES THE STATE WORD'S PLACE (2026-10-05). It first shipped
  // BESIDE the word, which left the words on rows that had no press 104px short
  // of the right-hand edge to keep the room for one: "look very unattractive.
  // was more thinking in the place of needs you etc... Right now this button
  // looks a little weird because of how much space there is."
  //
  // A row that can be approved says APPROVE where it would have said NEEDS YOU,
  // and nothing is held in reserve, so every word and every press ends at the
  // same right-hand edge.
  it('says NEW THREAD in the place of the state word, not beside it', () => {
    expect(html).toContain('>New thread<');
    // The waiting row's own word is gone; the running row below it keeps its.
    expect(html).not.toContain('>Needs you<');
    expect(html).toContain('>In progress<');
    expect(html.match(/class="made-state/g)).toHaveLength(1);
  });

  it('reserves no room beside the word, which is what pushed the column left', () => {
    expect(html).not.toContain('made-approve-room');
    expect(html).not.toContain('aria-hidden="true"');
  });

  it('leaves the state words alone in a list where nothing can be approved', () => {
    const none = renderToStaticMarkup(React.createElement(ThreadsMade, {
      rows: rows.map(({ approve, ...r }) => r), onOpen: () => {}, onApprove: () => {},
    }));
    expect(none).not.toContain('made-approve');
    expect(none.match(/class="made-state/g)).toHaveLength(2);
  });

  // THE NO IS GONE (w-554834e749). It shipped in w-9cf2b43110's second round,
  // drawn under the cursor, and was taken out on 2026-10-13: "No basically
  // means reject so it's a different functionality... Ignoring it is
  // basically rejecting it." Turning one down came back as DISMISS
  // (w-fcb5fdc2e5, tests/a-proposal-is-a-dot-with-its-answers-always-beside-it), drawn
  // only where it is wired; the old No and its wiring stay gone.
  it('draws no No, on any row', () => {
    const both = renderToStaticMarkup(React.createElement(ThreadsMade, {
      rows, onOpen: () => {}, onApprove: () => {}, onHere: () => {},
    }));
    expect(both).not.toContain('made-reject');
    expect(both).not.toContain('>No<');
    expect(both).not.toContain('Reject:');
  });

  it('draws nothing at all when there are no rows', () => {
    expect(renderToStaticMarkup(React.createElement(ThreadsMade, { rows: [], onOpen: () => {} }))).toBe('');
  });
});

describe('where the press is wired', () => {
  const app = read('renderer/src/App.tsx');
  const focus = read('renderer/src/components/Focus.tsx');

  it('reaches the opened thread knowing which of its children can be approved', () => {
    expect(app).toMatch(/approve: approvableFiled\(i, stateOfMine\(i\)\)/);
    expect(app).toMatch(/import \{ threadsMade, approvableFiled[\w\s,]*\}/);
  });

  it('approves the child without taking you off the thread you are reading', () => {
    expect(app).toMatch(/onApproveFiled=\{\(i\) => resolve\(i, \{ stay: true \}\)\}/);
    expect(app).toMatch(/const resolve = useCallback\(async \(item: WorkItem, \{ stay \}/);
  });

  it('hands the list the press, by the row', () => {
    expect(focus).toMatch(/onApprove=\{[^}]*onApproveFiled/);
  });

  it('wires no No from the thread any more (w-554834e749)', () => {
    expect(app).not.toContain('onRejectFiled');
    expect(focus).not.toContain('onRejectFiled');
  });
});

// THE PRESS IS A WORD NOW, NOT A BOX (w-fcb5fdc2e5). The bordered chip read as
// "the really abrupt orange button"; in the quiet list it is the app's own
// mono capitals in the accent, washed in under the cursor, beside two grey
// words, and they stand where the state words end.
describe('the press looks like the app', () => {
  const css = read('renderer/src/components/threads-made.css');
  const rule = css.match(/\.made-approve \{[^}]*\}/)[0];
  const words = css.match(/\n\.made-acts button \{[^}]*\}/)[0];

  it('wears the app\'s own capitals, with no box round them, in the accent', () => {
    expect(words).toMatch(/text-transform: uppercase/);
    expect(words).toMatch(/var\(--mono\)/);
    expect(words).toMatch(/border: 0/);
    expect(rule).toMatch(/var\(--accent\)/);
  });

  it('stands at the right-hand edge the state words end at', () => {
    expect(css).toMatch(/\.made-open \{[^}]*flex: 1/);
    expect(css).toMatch(/\.made-row \{[^}]*padding-right: 10px/);
    // In the row's flow, hung 2px into its 10px padding: 8px from the edge,
    // where they stood in the drawing that was picked.
    expect(css).toMatch(/\n\.made-acts \{[^}]*margin-right: -2px/);
    expect(css).not.toContain('made-approve-room');
  });
});
