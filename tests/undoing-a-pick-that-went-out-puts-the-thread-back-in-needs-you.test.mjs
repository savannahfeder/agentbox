// A Z THAT ARRIVES TOO LATE TO BE FREE STRANDED THE THREAD IT UNDID.
//
// Found by the power test (w-811757c0b5, issue 5, seen twice by one tester and
// again on a fresh copy of the app). Open a thread whose agent came back with
// options, press 2, wait three seconds so the pick has gone out, press Z. The
// thread then says "Nothing running. No agent is on this, and none is waiting
// to start." and sits under In progress for ever. It never came back to Needs
// you, Needs you's count never included it, and a reload did not heal it: the
// strand is on the ledger, not in the window. Picture:
// designs/w-811757c0b5/undo-leaves-thread-in-progress.jpg.
//
// The undo writes '(withdrawn)' into `answer`, in her hand, because that is how
// a taken-back reply is said everywhere here. `answeredHerAsk` is what puts her
// own open thread in the inbox when a worker has answered it, and it asks
// whether the worker spoke AFTER her last word. The withdrawal is a founder
// write to `answer`, so it counted as her last word, stamped later than the
// result it was undoing. The worker's answer stopped being news, the thread
// fell out of Needs you, and `belongsInProgress` caught it on its last branch
// — her own open thread, waiting its turn — which promises a worker is coming.
// None was: the supervisor refuses to spawn on '(withdrawn)' (supervisor.mjs,
// "a cancel, not an answer"). Out of one list, into a list that was lying.
//
// A withdrawal is her taking a word back, not saying one. Measured through the
// real ledger fold, with exactly the four lines the power test left behind:
// Option 2, blocked (the kill the undo makes), (withdrawn), open.
//
// Undo inside the grace window never had this, and the test holds that too:
// nothing reaches the ledger at all, so there is no withdrawal to misread.

import { describe, it, expect } from 'vitest';
import { buildLine, foldWorkItems } from '../shared/work-items.mjs';
import { answeredHerAsk, belongsInInbox, belongsInProgress } from '../renderer/src/list-rules';

const ID = 'w-8c41d0a2b7';
const T0 = 1_792_100_000_000;        // she wrote the thread
const ANSWERED = T0 + 60_000;        // the worker came back with options
const PICKED = ANSWERED + 30_000;    // she pressed 2
const KILLED = PICKED + 3_000;       // Z: the stop parks it blocked
const WITHDREW = KILLED + 20;        // and writes the tombstone
const REOPENED = WITHDREW + 20;      // and puts the status the pick found back
const LATER = REOPENED + 60_000;

// The thread as the ledger makes it: every line is one the app really writes,
// through the fold the renderer reads. `founder` is the label that makes it
// hers; `result` is the message the options are read off.
function thread(...lines) {
  const ledger = [
    buildLine({ id: ID, source: 'founder', now: T0, patch: { title: 'add pagination to GET /appointments', body: 'and keep the old shape working', labels: ['founder'], kind: 'task', status: 'open' } }),
    buildLine({ id: ID, source: 'agent', now: ANSWERED, patch: { result: 'Worked on "add pagination to GET /appointments".\n\n## Options\n1. Ship it (recommended)\n2. Change something first\n3. Throw it away' } }),
    ...lines,
  ];
  return foldWorkItems(ledger, LATER).get(ID);
}

// She presses 2. The thread was open, so `statusForReply` gives nothing and the
// pick is the answer alone.
const PICK = buildLine({ id: ID, source: 'founder', now: PICKED, patch: { answer: 'Option 2: Change something first' } });
// Z past the grace window, in the order App.tsx makes the writes: the stop
// first (ipc `zero:stop-session` parks it blocked), then `withdrawReply`, which
// is the tombstone and the status the pick found.
const STOP = buildLine({ id: ID, source: 'founder', now: KILLED, patch: { status: 'blocked' } });
const WITHDRAW = buildLine({ id: ID, source: 'founder', now: WITHDREW, patch: { answer: '(withdrawn)' } });
const BACK_TO_OPEN = buildLine({ id: ID, source: 'founder', now: REOPENED, patch: { status: 'open' } });

const lists = (item) => ({
  needsYou: belongsInInbox(item, { now: LATER }),
  inProgress: belongsInProgress(item, { now: LATER }),
});

describe('a pick that went out, then taken back', () => {
  it('leaves the thread in Needs you, with the answer that offered the options', () => {
    const item = thread(PICK, STOP, WITHDRAW, BACK_TO_OPEN);
    expect(item.answer).toBe('(withdrawn)');
    expect(item.status).toBe('open');
    expect(answeredHerAsk(item)).toBe(true);
    expect(lists(item)).toEqual({ needsYou: true, inProgress: false });
  });

  it('and never claims a worker is coming, because none is', () => {
    // The sentence the thread drew under the options was true. What was wrong
    // was the list it was drawn in, so this is the half the tester could see.
    const item = thread(PICK, STOP, WITHDRAW, BACK_TO_OPEN);
    expect(belongsInProgress(item, { now: LATER })).toBe(false);
  });

  it('works the same when the pick found the thread blocked', () => {
    // A worker that ended `blocked` is reopened by the pick (`statusForReply`)
    // and put back to blocked by the undo. That path never strayed, and it
    // must not start to.
    const ended = buildLine({ id: ID, source: 'agent', now: ANSWERED + 1, patch: { status: 'blocked' } });
    const pick = buildLine({ id: ID, source: 'founder', now: PICKED, patch: { answer: 'Option 2: Change something first', status: 'open' } });
    const back = buildLine({ id: ID, source: 'founder', now: REOPENED, patch: { status: 'blocked' } });
    const item = thread(ended, pick, STOP, WITHDRAW, back);
    expect(lists(item)).toEqual({ needsYou: true, inProgress: false });
  });
});

describe('either side of it, which must not move', () => {
  it('while the pick is live, the thread is In progress and out of Needs you', () => {
    // The three seconds between the 2 and the Z. A worker is genuinely coming.
    const item = thread(PICK);
    expect(answeredHerAsk(item)).toBe(false);
    expect(lists(item)).toEqual({ needsYou: false, inProgress: true });
  });

  it('a Z inside the grace window leaves no line to misread', () => {
    // Nothing was written, so the thread is exactly as the worker left it.
    const item = thread();
    expect(lists(item)).toEqual({ needsYou: true, inProgress: false });
  });

  it('a typed reply she has not taken back still waits on the agent', () => {
    // The case that must NOT match: a live answer is her word, it outranks the
    // result, and the thread belongs to the worker until it speaks again.
    const typed = buildLine({ id: ID, source: 'founder', now: PICKED, patch: { answer: 'change the page size to 50' } });
    const item = thread(typed);
    expect(answeredHerAsk(item)).toBe(false);
    expect(lists(item)).toEqual({ needsYou: false, inProgress: true });
  });

  it('a withdrawal with nothing answered under it is still the agent-s turn', () => {
    // She replied on a thread no worker had come back on, then took it back.
    // There is no answer to be news, so it waits its turn as it always did.
    const ledger = [
      buildLine({ id: ID, source: 'founder', now: T0, patch: { title: 'add pagination', labels: ['founder'], kind: 'task', status: 'open' } }),
      buildLine({ id: ID, source: 'founder', now: PICKED, patch: { answer: 'do it' } }),
      STOP, WITHDRAW, BACK_TO_OPEN,
    ];
    const item = foldWorkItems(ledger, LATER).get(ID);
    expect(answeredHerAsk(item)).toBe(false);
    expect(lists(item)).toEqual({ needsYou: false, inProgress: true });
  });

  it('and a worker on it now keeps it, whatever the ledger says', () => {
    // `live` is the supervisor's running list, and it still wins. A thread
    // nothing is running is the whole of what this fix is about.
    const item = thread(PICK, STOP, WITHDRAW, BACK_TO_OPEN);
    expect(belongsInProgress(item, { now: LATER, live: true })).toBe(true);
    expect(belongsInInbox(item, { now: LATER, live: true })).toBe(false);
  });
});
