// Z BROUGHT THE ROW BACK AND LEFT HER SOMEWHERE ELSE.
//
// w-7eb39d3c97, 2026-09-30. Closing a task and pressing Z reopened it in the
// ledger, but it no longer came back in front of her: it sat somewhere in the
// list and she had to go and find it.
//
// Two paths answer Z, and only one of them ever opened the row again.
//
//   Inside the three second grace window   nothing has been written yet, and
//                                          `undo` cancels the timer and opens
//                                          the row it held. Always did.
//   After it                               the close is written, so Z pops the
//                                          undo pile and writes the row open
//                                          again. It announced that in a toast
//                                          and opened nothing, so she stayed on
//                                          the task the close had moved her to.
//
// The store side was never wrong: a reopened row is back in the inbox list by
// `belongsInInbox`. What was wrong is that a reflex Z often lands a few seconds
// after the close, past the grace window, so most undos took the second path
// and the row came back somewhere she was not looking.
//
// So an entry on the pile can name the row it puts back, and whichever path
// answers Z, that row is opened.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shownAfterUndo } from '../renderer/src/undo-window.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, '..', 'renderer', 'src', 'App.tsx'), 'utf8');

const row = { id: 'w-1', product: 'p', title: 'The row she closed' };

describe('what a Z past the grace window puts in front of her', () => {
  it('opens the row a reopen brought back', () => {
    expect(shownAfterUndo(null, row)).toEqual({ open: row, compose: false });
  });

  it('still opens the thread a withdrawn reply belongs to, words and all', () => {
    const thread = { id: 'w-2' };
    expect(shownAfterUndo({ item: thread }, row)).toEqual({ open: thread, compose: false });
  });

  it('still reopens the new task card for a withdrawn new task, and opens no row', () => {
    expect(shownAfterUndo({ compose: true }, undefined)).toEqual({ open: null, compose: true });
  });

  // The case that must not match: undoing a schedule change or putting the
  // update row back names no row, and must not pull her off what she is on.
  it('opens nothing when the undo named no row', () => {
    expect(shownAfterUndo(null, undefined)).toEqual({ open: null, compose: false });
    expect(shownAfterUndo(undefined, undefined)).toEqual({ open: null, compose: false });
  });
});

describe('the app uses that rule on every row it puts back', () => {
  it('names the row on the close, the approval and the pick', () => {
    // markDone's reopen
    expect(app).toMatch(/undoes: `reopen “\$\{clipToSentence\(item\.title, TOAST_TITLE\)\}”`, brings: item,/);
    // approval withdrawn, back in your inbox
    expect(app).toMatch(/label: 'Approval withdrawn, back in your inbox', undoes: '[^']+', brings: item,/);
    // option withdrawn, back in your inbox
    expect(app).toMatch(/label: `Option \$\{option\.n\} withdrawn, back in your inbox`, undoes: `[^`]+`, brings: item,/);
  });

  it('opens what the rule says after a late Z, and drops a pending advance', () => {
    const from = app.indexOf('const { take: last, rest, instant } = nextUndo(undoStack, now);');
    const late = app.slice(from, app.indexOf('/* ------------------------------- keyboard', from));
    expect(late).toContain('shownAfterUndo(restored, last.brings)');
    expect(late).toContain('advanceRef.current = null;');
    expect(late).toContain('setFocused(shown.open); markSeen(shown.open);');
    // and the advance is dropped BEFORE the undo runs, not after the row opens
    expect(late.indexOf('advanceRef.current = null;')).toBeLessThan(late.indexOf('await last.run();'));
  });
});
