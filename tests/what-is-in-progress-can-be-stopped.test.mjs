// What is in progress can be stopped.
//
// Both DID exist. Both gated on a live session (`supervisor.running`) rather
// than on the tab they appear under, and In progress is much broader than that:
// it holds her own queued task and an approved-but-not-yet-spawned one as well
// as a running worker. Measured over her real store the same day: median 474
// seconds between her composing a task and a worker claiming it, 10 of 380
// claimed inside 15 seconds. That gap is the whole complaint, and on the row
// that reported it the gap was 3 minutes 5 seconds.
//
// So the rule is the tab's own rule. These tests pin the three shapes that live
// in In progress against the three that must never offer a stop.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { stoppable, belongsInProgress, belongsInInbox } from '../renderer/src/list-rules';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const NOW = 1_786_918_820_000;
const HOUR = 3_600_000;

// Shaped as the fold hands them over (shared/work-items.mjs).
const hers = (extra) => ({
  id: 'w-2fe5a7c3c1', status: 'open', kind: 'directive', labels: ['founder'],
  title: 'It would be very nice to be able to stop a task', updatedAt: NOW, ...extra,
});
const approved = (extra) => ({
  id: 'w-a4ef537fa3', status: 'open', kind: 'question', labels: ['gtm'],
  title: 'Pick where the terminal lives', answer: 'Option 1', updatedAt: NOW, ...extra,
});

const can = (i, deferredUntil = 0) => stoppable(i, { deferredUntil, now: NOW });

describe('the three rows that live in In progress can all be stopped', () => {
  // THE BUG. No worker is running on this row and none is for another few
  // minutes, which is exactly when she reaches for the stop.
  it('stops her own task while it is still queued, with no worker on it', () => {
    expect(can(hers())).toBe(true);
  });

  it('stops an approved item whose continuation has not spawned yet', () => {
    expect(can(approved())).toBe(true);
  });

  it('stops a claimed row, which is the only case that already worked', () => {
    expect(can(hers({ status: 'claimed' }))).toBe(true);
  });
});

describe('what may not offer a stop', () => {
  it('leaves a scheduled row alone: it is in Scheduled and has its own way back', () => {
    expect(can(hers(), NOW + HOUR)).toBe(false);
    expect(can(approved(), NOW + 20 * 60_000)).toBe(false);
  });

  it('leaves an agent proposal alone: it waits in the inbox, nothing is running', () => {
    expect(can({ status: 'open', kind: 'task', labels: ['landing'], title: 'a proposal' })).toBe(false);
  });

  it('leaves an unanswered question alone', () => {
    expect(can({ ...approved(), answer: undefined })).toBe(false);
  });

  it('does not offer a stop on a withdrawn reply, which is already a cancel', () => {
    expect(can(approved({ answer: '(withdrawn)' }))).toBe(false);
  });
});

// THE OLD GATE, kept as a test so it cannot come back. Both surfaces asked
// `supervisor.running.some(r => r.itemId === id)`, which is a fact about a
// process, not about the row. These are the rows where the two answers differ,
// and every one of them is a row she is looking at in In progress.
describe('the gate that caused this: a live session is not the question', () => {
  const runningSessionExists = false; // no worker on the row yet: the median case

  it('her freshly composed task: In progress, no session, and no stop offered', () => {
    expect(can(hers())).toBe(true);
    expect(runningSessionExists).toBe(false); // what the old gate asked
  });

  it('an approved item awaiting spawn: same gap, same silence', () => {
    expect(can(approved())).toBe(true);
    expect(runningSessionExists).toBe(false);
  });
});

// The two lists must never disagree about what is under way: a row she can see
// in In progress and cannot stop is the defect, and a stop offered on a row
// that is not in the tab is a promise about work nobody is doing.
describe('the stop and the tab are one rule', () => {
  const cases = [
    ['her queued task', hers(), 0],
    ['an approved item', approved(), 0],
    ['a running worker', hers({ status: 'claimed' }), 0],
    ['a scheduled row', hers(), NOW + HOUR],
    ['an agent proposal', { status: 'open', kind: 'task', labels: ['x'], title: 'p' }, 0],
    ['a finished row', hers({ status: 'done' }), 0],
  ];
  for (const [name, item, deferred] of cases) {
    it(`agrees with In progress on ${name}`, () => {
      expect(can(item, deferred)).toBe(belongsInProgress(item, { deferredUntil: deferred, now: NOW }));
    });
  }
});

// ------------------------------------------------------------------------
// AND THE STOP SAYS WHERE THE TASK GOES.
//
// The row already went to the inbox. Nothing she could see said so, so a stop
// read as a park, and a park is a thing she loses. Two tests: the promise is on
// both surfaces, and the promise is true.
describe('the stop names where the task goes', () => {
  const src = (p) => fs.readFileSync(path.join(root, p), 'utf8');

  // WHERE IT SAYS IT CHANGED ON 2026-09-22 (w-581dbc6cc4). The button left the
  // task footer for the reply card, on her word: "most apps have the stop in
  // the chat message so that would be logical too." A button beside Send cannot
  // carry a 290 point sentence, so the promise moved with it, into the tooltip
  // and into the toast that follows the press. The toast is checked below and
  // has said this all along; what is new is that the tooltip is where the
  // destination is written before she presses.
  it('says where the task goes, on every surface the round offers', () => {
    // WHILE THE ROUND IS OPEN there are four places a stop can be drawn, and
    // the promise has to survive whichever she picks. `stop-look.ts` says which
    // look is which; this checks that none of them loses the destination.
    const focus = src('renderer/src/components/Focus.tsx');
    const app = src('renderer/src/App.tsx');
    // ONE SURFACE NOW. The round on where the stop lives closed on 2026-09-22:
    // it takes the send slot while the box is empty and gives it back the
    // moment she types. The promise rides on that button's tooltip and on the
    // toast the press raises.
    expect((focus.match(/It goes back to your inbox\./g) ?? []).length).toBe(2);
    // And the footer strip no longer draws one at all.
    expect(focus).not.toContain("'stop this task'");
    expect(focus).not.toContain("'stop this agent'");
  });

  // The palette row sits in a column of short commands, so it carries the same
  // promise in her shorter words. Both strings are pinned so neither drifts
  // into the other.
  it('says it in ⌘K, in her shorter words, running and not-started', () => {
    const app = src('renderer/src/App.tsx');
    const cmd = app.slice(app.indexOf("id: 'stop'"), app.indexOf("id: 'stop'") + 400);
    expect(cmd).toContain('Stop Task (Moves to Inbox)');
    expect(cmd).toContain('Stop Agent (Moves to Inbox)');
    // What the old label carried is kept, one line down, where it does not
    // crowd out the destination.
    expect(cmd).toContain('nothing has started on it yet');
  });

  it('keeps the ⌘K row from sticking out of the column of commands', () => {
    // The defect she reported was width, so the test is width. Every other
    // command in that modal is shorter than this; hers is measured against the
    // longest of them rather than a number nobody can check.
    const app = src('renderer/src/App.tsx');
    // The commands offered on ONE focused row: from the close command down to
    // the end of that array. Each `label:` may be a ternary, so take every
    // quoted string between it and the `run:` that follows.
    const region = app.slice(app.indexOf("id: 'done', label: target.agent"), app.indexOf('...priorityCommands(['));
    const labels = [...region.matchAll(/label:([\s\S]*?)(?=run:|keyHint:)/g)]
      .flatMap((m) => [...m[1].matchAll(/'([^']+)'/g)].map((q) => q[1]));
    const stop = 'Stop Task (Moves to Inbox)';
    expect(labels).toContain(stop);
    const others = labels.filter((l) => !l.startsWith('Stop '));
    expect(others.length).toBeGreaterThan(3);
    const longestOther = others.reduce((a, b) => (b.length > a.length ? b : a), '');
    expect(stop.length).toBeLessThanOrEqual(longestOther.length);
  });

  it('never promises the inbox on a row that is not stoppable', () => {
    // The label only exists inside the `stoppableNow(target)` branch, so the
    // rule above is the whole guard. Pinned so a later refactor cannot lift it.
    const app = src('renderer/src/App.tsx');
    const branch = app.indexOf('...(stoppableNow(target)');
    expect(branch).toBeGreaterThan(-1);
    expect(app.indexOf('Stop Task (Moves to Inbox)')).toBeGreaterThan(branch);
  });

  // THE PROMISE IS TRUE. `zero:stop-session` parks the row blocked, and this is
  // the line of belongsInInbox that catches it. If this ever stops being true
  // the button is lying to her, which is worse than the silence it replaced.
  it('puts a stopped task in the inbox, whoever wrote it and whatever ran', () => {
    const inbox = (i) => belongsInInbox(i, { deliveredThrough: 0, hiddenUntil: 0, now: NOW });
    expect(inbox(hers({ status: 'blocked' }))).toBe(true);           // stopped before it started
    expect(inbox(hers({ status: 'blocked', claim: undefined }))).toBe(true);
    expect(inbox(approved({ status: 'blocked' }))).toBe(true);       // an agent was killed mid-run
  });

  it('and takes it out of In progress, so it is in one list, not two', () => {
    expect(belongsInProgress(hers({ status: 'blocked' }), { now: NOW })).toBe(false);
    expect(can(hers({ status: 'blocked' }))).toBe(false);
  });
});
