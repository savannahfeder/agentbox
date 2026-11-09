// A THREAD WHOSE AGENT IS FROZEN ON A PERMISSION REQUEST NEEDS YOU, AND SAYS SO.
//
// Found by a tester on the Linux box, 2026-10-23 (F-28): start a task whose
// agent asks to commit, then look at the inbox before answering. The thread sat
// under In progress reading WORKING, and Needs you did not count it, so the one
// list that is meant to say "this is yours to do" said nothing. Measured in the
// built renderer on this branch with `?fixtures=1&approvals`: the fixture's own
// `w-d4` has a worker on it and three asks in front of you, and its row read
// WORKING.
//
// A session really is on the thread, so this is the same shape as the rule
// above it (`stillAsksYou`, w-fe48447cab): the thread is in Needs you AND stays
// in In progress, and the one thing a session may not do is hide the question
// it is asking.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { belongsInInbox, belongsInProgress } from '../renderer/src/list-rules.ts';
import { liveLine, shortWord } from '../renderer/src/live-line.ts';
import { statusCell } from '../renderer/src/status-word.ts';

const now = Date.now();
// The reported row: your own task, claimed, with a live worker on it.
const working = {
  id: 'w-d4', product: 'kestrel', status: 'claimed', kind: 'directive', labels: ['founder'],
  claim: { holder: 'worker-1', leaseUntil: now + 60_000 }, updatedAt: now - 60_000,
};
const session = { itemId: 'w-d4', product: 'kestrel', startedAt: now - 3 * 60_000, tail: [] };

describe('a thread whose agent is waiting for your yes', () => {
  it('is in Needs you while it waits', () => {
    expect(belongsInInbox(working, { now, live: true, asking: true })).toBe(true);
  });

  it('stays in In progress too, because a session really is on it', () => {
    expect(belongsInProgress(working, { now, live: true })).toBe(true);
  });

  it('reads Asking rather than Working, in the same mark every held agent wears', () => {
    const cell = statusCell(working, { session, queued: [], asking: true, inProgress: true, now });
    expect(cell.word).toBe('Asking');
    // `held`, the accent ring: nothing starts this thread until something
    // changes, which is what Stopped, Paused, Signed out and At its limit say
    // with the same ring. NOT `need`, the solid dot, which is drawn nowhere
    // else in this column (`s-need` in threads/pages.css).
    expect(cell.mark).toBe('held');
    expect(cell.live).toBe(false);
    expect(cell.title).toMatch(/until you answer/);
  });

  it('does not say the word the tab over it already says', () => {
    // 2026-10-24, in their words: "Everything in the tab is called Needs you so
    // it doesn't make sense for the status to also be Needs you."
    const cell = statusCell(working, { session, queued: [], asking: true, inProgress: true, now });
    expect(cell.word).not.toBe('Needs you');
    expect(shortWord('asking')).not.toMatch(/needs/i);
  });

  it('wears a mark this column already draws, and never a new one', () => {
    // The whole set of marks the Status column can draw, as pages.css styles
    // them. A sixth would be the inconsistency this round was asked to remove.
    const css = readFileSync(new URL('../renderer/src/threads/pages.css', import.meta.url), 'utf8');
    const cell = statusCell(working, { session, queued: [], asking: true, inProgress: true, now });
    expect(css).toMatch(new RegExp(`\\.th-st\\.s-${cell.mark} \\{`));
    // And it is the one the other stopped agents wear.
    const stopped = statusCell(working, { session, queued: [], stalled: true, inProgress: true, now });
    expect(cell.mark).toBe(stopped.mark);
  });

  it('says what is waiting and what unsticks it', () => {
    const line = liveLine(working, { session, asking: true, inProgress: true, now });
    expect(line.state).toBe('asking');
    expect(line.line).toMatch(/permission/);
  });

  /* ------------------------- and the cases that must not match ------------- */

  it('reads Working again the moment nothing is being asked', () => {
    expect(belongsInInbox(working, { now, live: true, asking: false })).toBe(false);
    const cell = statusCell(working, { session, queued: [], inProgress: true, now });
    expect(cell.word).toBe('Working');
    expect(cell.mark).toBe('working');
  });

  it('says nothing on a finished thread, whatever is left in the spool', () => {
    const done = { ...working, status: 'done', wrote: { status: { ts: now, source: 'agent' } } };
    expect(liveLine(done, { session, asking: true, now })).toBeNull();
    expect(statusCell(done, { session, queued: [], asking: true, now }).mark).toBe('done');
  });

  it('is not claimed by a thread you put in Later and never began', () => {
    expect(belongsInInbox({ ...working, start: 'later' }, { now, live: true, asking: true })).toBe(false);
  });
});

describe('where the window gets the fact from', () => {
  const app = readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

  it('reads the spool, which is the only place that names the thread', () => {
    expect(app).toMatch(/const askingIds = useMemo\([\s\S]{0,400}snap\?\.approvals/);
    // And hands it to the fleet, which is where the Status column reads it.
    expect(app).toMatch(/asking: \[\.\.\.askingIds\]/);
  });

  it('drops the one you just answered, so the row and the card agree', () => {
    // The spool still carries an answered ask until the main process pushes;
    // the card is already leaving with its verdict. Without this the row read
    // Needs you for that beat, after you had said yes.
    expect(app).toMatch(/\.filter\(\(a\) => a\.id !== answered\?\.id\)/);
  });
});
