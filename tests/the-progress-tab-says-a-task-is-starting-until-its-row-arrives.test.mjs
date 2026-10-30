// "NOTHING IS RUNNING." OVER A TASK THAT HAD JUST BEEN SENT (F-134).
//
// Seen twice in one evening on a fresh user: press Send, the card closes, the
// page moves itself to In progress -- and In progress says "Nothing is
// running." The row arrived a moment later, and switching tabs and back was
// what showed it. Somebody who has just sent their first task reads that
// sentence as the send not having worked, and sends it again.
//
// The empty tab already had the honest line for this moment, "Starting your
// task…", and only the first-run walk could ever reach it: `landOn` is set by
// `finishFresh` and by nothing else. Every other send went through the compose
// card, which closes on Send (w-461fbd8d2d) and moves the tab to where the
// thread will land, leaving the round trip to be drawn by the empty state.
//
// So the words move out of the component into a rule, and the inbox knows a
// task is on its way from Send until its row arrives, the send fails, or
// fifteen seconds pass -- the same ceiling `landOn` already keeps, because
// NOTHING WAITS FOR EVER (CLAUDE.md).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { emptyTabWords } from '../renderer/src/threads/page-rules.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

describe('what an empty In progress says', () => {
  it('says a task is starting while one is on its way', () => {
    expect(emptyTabWords('progress', true)).toBe('Starting your task…');
  });

  it('says nothing is running when nothing is', () => {
    expect(emptyTabWords('progress', false)).toBe('Nothing is running.');
  });

  // THE CASE THAT MUST NOT MATCH: the other tabs keep their own lines, and a
  // task on its way to Later is not a task that is starting.
  it('leaves the other tabs alone', () => {
    expect(emptyTabWords('snoozed', true)).toBe(emptyTabWords('snoozed', false));
    expect(emptyTabWords('done', true)).toBe(emptyTabWords('done', false));
    expect(emptyTabWords('snoozed', false)).toMatch(/waiting for later/);
  });
});

describe('when the inbox knows a task is on its way', () => {
  const app = read('renderer/src/App.tsx');

  it('knows it from the moment Send is pressed, not only on the first run', () => {
    const sending = app.slice(app.indexOf('onSending={walkCard'), app.indexOf('onFailed={(said, back)'));
    expect(sending).toMatch(/setJustSent\(true\)/);
  });

  it('draws it off that as well as off the first run’s landing', () => {
    const line = app.split('\n').find((l) => l.includes('<EmptyTab'));
    expect(line).toMatch(/starting=\{!!landOn \|\| justSent\}/);
  });

  // And only on the tab that was waiting: a glance at Needs you in the middle
  // of the round trip must not take the line away.
  it('stops saying it once the row is there, on the tab that was waiting', () => {
    expect(app).toMatch(/if \(justSent && list\.length && view === 'progress'\) setJustSent\(false\)/);
  });

  it('stops saying it when the send did not stand', () => {
    const failed = app.slice(app.indexOf('onFailed={(said, back)'), app.indexOf('onSent={async (made, how)'));
    expect(failed).toMatch(/setJustSent\(false\)/);
  });

  // NOTHING WAITS FOR EVER: a row that never comes must not leave the page
  // claiming a task is starting.
  it('gives up after fifteen seconds, the same ceiling the landing keeps', () => {
    const block = app.slice(app.indexOf('const [justSent'), app.indexOf('const [justSent') + 900);
    expect(block).toMatch(/setJustSent\(false\), 15_000/);
  });
});
