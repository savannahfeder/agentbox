// Z ON A ROW IN THE LATER TAB OPENED THE THREAD.
//
// QA batch 002, F-50, Oct 24 2026: "Open the LATER tab, select the row, press
// Z. Expected: Z undoes without navigating. Actual: it returned the thread
// ('Back in your inbox') but also opened it, with the breadcrumb still saying
// LATER."
//
// Both of the undos that open a row were written for someone reading a TASK.
// w-7eb39d3c97: a close moved her to the next task, so a Z past the grace
// window reopened the row in the store and left her on that next task, hunting.
// w-874411cc63: the same gap with L, where the Z "did nothing" and the next Z
// reached the reply underneath. In both, the row she wanted back was not on the
// screen, because a task was covering the list.
//
// Reading a LIST, none of that holds: the row she takes back reappears in a
// list she is already looking at, and opening a thread over it is the app
// moving her somewhere she did not ask to go. So the rule gains the one fact it
// was missing, and `shownAfterUndo` is told whether a task is open.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shownAfterUndo, bringsBack } from '../renderer/src/undo-window.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, '..', 'renderer', 'src', 'App.tsx'), 'utf8');

const row = { id: 'w-1', product: 'p', title: 'Word count function and unit test' };
const ON_A_TASK = { onATask: true };
const IN_THE_LIST = { onATask: false };

describe('a Z while a task is open', () => {
  it('still opens the row it put back', () => {
    expect(shownAfterUndo(null, row, ON_A_TASK)).toEqual({ open: row, compose: false });
  });

  it('still opens the thread a withdrawn reply belongs to, words and all', () => {
    const thread = { id: 'w-2' };
    expect(shownAfterUndo({ item: thread }, row, ON_A_TASK)).toEqual({ open: thread, compose: false });
  });
});

describe('a Z while you are reading a list', () => {
  it('puts the row back and opens nothing', () => {
    expect(shownAfterUndo(null, row, IN_THE_LIST)).toEqual({ open: null, compose: false });
  });

  it('opens nothing when the undo named no row either', () => {
    expect(shownAfterUndo(null, undefined, IN_THE_LIST)).toEqual({ open: null, compose: false });
    expect(shownAfterUndo(null, bringsBack([row, { id: 'w-2' }]), IN_THE_LIST)).toEqual({ open: null, compose: false });
  });

  // The two cases that must still move you: your own words are in them, and
  // there is nowhere else they are on screen.
  it('still reopens the thread a withdrawn reply belongs to', () => {
    const thread = { id: 'w-2' };
    expect(shownAfterUndo({ item: thread }, row, IN_THE_LIST)).toEqual({ open: thread, compose: false });
  });

  it('still reopens the new thread card for a withdrawn new task', () => {
    expect(shownAfterUndo({ compose: true }, undefined, IN_THE_LIST)).toEqual({ open: null, compose: true });
  });
});

describe('the app asks the rule on both of the paths that answer Z', () => {
  it('past the grace window, with whether a task is open', () => {
    const from = app.indexOf('const { take: last, rest, instant } = nextUndo(undoStack, now);');
    const late = app.slice(from, app.indexOf('/* ------------------------------- keyboard', from));
    expect(late).toContain('shownAfterUndo(restored, last.brings, { onATask: !!focused })');
    expect(late).toContain('setFocused(shown.open); markSeen(shown.open);');
  });

  it('and inside it, where the held row is opened only from a task', () => {
    const from = app.indexOf('const undo = useCallback(async () => {');
    const grace = app.slice(from, app.indexOf('// PAST THE GRACE WINDOW', from));
    expect(grace).toContain('if (restored || focused) setFocused(pending.item);');
  });

  it('and `undo` is rebuilt when the open task changes, or it would read a stale one', () => {
    const at = app.indexOf('const undo = useCallback(async () => {');
    const deps = /\n {2}}, \[([^\]]*)\]\);/.exec(app.slice(at))[1];
    expect(deps.split(',').map((d) => d.trim())).toContain('focused');
  });
});
