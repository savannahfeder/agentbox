// HER MESSAGE IS ON THE SCREEN WHEN SHE SENDS IT, NOT WHEN THE AGENT PAUSES.
//
// WHERE THE DELAY WAS, measured in the code that causes it. A reply typed while
// a worker is up does not go to the row first. `submitReply`
// (main/live-replies.mjs) hands it to the running session and writes the ledger
// only once the provider has acknowledged it. Claude acknowledges by replaying
// the message back, which it does at its next break, and `attachClaudeInput`
// (main/claude-input.mjs) waits for it for as long as the session lives. The
// conversation is drawn off the ledger. the reply box had closed
// behind them and the thread had never heard of them.
//
// The second symptom is the same fault counted twice. Three messages
// typed into that silence all appear together when the agent finally pauses, so
// while she is typing them nothing on the screen says which of them got
// through, or that any of them did.
//
// The fix is that the thread is handed what she has sent, and draws it at the
// moment she sent it. The tests below are the two halves of that being safe:
// it appears, and it is never there twice.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { itemThread } from '../renderer/src/item-thread.ts';
import { attachClaudeInput } from '../main/claude-input.mjs';
import { EventEmitter } from 'node:events';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const T = Date.parse('2026-09-21T10:00:00');
const sec = 1000;

// A row she is in the middle of: she asked, a worker claimed it and is working.
const ledger = [
  { id: 'w-1', ts: T, source: 'founder', patch: { title: 'The landing page copy', body: 'Rewrite the headline.' } },
  { id: 'w-1', ts: T + 30 * sec, source: 'agent', claim: { holder: 'mcp-1', leaseUntil: T + 900 * sec }, patch: { status: 'claimed' } },
];
// Her ask opens the conversation and is a message of hers like any other, so
// it is named here and left out of the counts below: what every test in this
// file is about is what she said AFTER the worker started.
const ASK = 'Rewrite the headline.';
const says = (built) => built.events.filter((e) => e.kind !== 'work');
const hers = (built) => says(built).filter((e) => e.who === 'you' && e.text !== ASK);

describe('a message sent to a working agent', () => {
  it('is in the conversation before the ledger has heard of it', () => {
    const built = itemThread(ledger, [], null, { pending: [{ at: T + 60 * sec, text: 'make it shorter' }] });
    const mine = hers(built);
    expect(mine.map((e) => e.text)).toEqual(['make it shorter']);
    expect(mine[0].pending).toBe(true);
    expect(mine[0].at).toBe(T + 60 * sec);
  });

  it('says so in its own head rather than wearing a time nothing knows yet', () => {
    const src = read('renderer/src/components/Thread.tsx');
    // AND WHICH OF THE TWO SENDING STATES IT IS IN (w-5281ef1221). She read
    // this label off a screenshot and asked why a message still sending could
    // not be taken back. For the first three seconds she can,
    // and the head says so; after them the words are on the session's stdin and
    // it stops saying so.
    // Past the window it says what it is waiting on and offers Send now
    // (w-f37a34def6), where a step can be cut.
    expect(src).toContain("e.pending\n                      ? <span className=\"msg-when msg-sending\">{e.held ? 'Sending… press Z to undo' : cutting ? 'Sending now…' : onSendNow ? 'Waiting for its current step' : 'Sending…'}</span>");
  });

  it('keeps three of them apart, in the order she sent them', () => {
    const built = itemThread(ledger, [], null, {
      pending: [
        { at: T + 60 * sec, text: 'make it shorter' },
        { at: T + 64 * sec, text: 'and drop the second line' },
        { at: T + 71 * sec, text: 'actually leave the second line' },
      ],
    });
    expect(hers(built).map((e) => e.text)).toEqual([
      'make it shorter',
      'and drop the second line',
      'actually leave the second line',
    ]);
  });

  it('is not drawn twice when the agent takes it and the row records it', () => {
    const landed = [...ledger, { id: 'w-1', ts: T + 95 * sec, source: 'founder', patch: { answer: 'make it shorter' } }];
    const built = itemThread(landed, [], null, { pending: [{ at: T + 60 * sec, text: 'make it shorter' }] });
    const mine = hers(built);
    expect(mine.map((e) => e.text)).toEqual(['make it shorter']);
    // The committed one, which is the row's own record and wears the time it
    // was written. Nothing about it is pending any more.
    expect(mine[0].at).toBe(T + 95 * sec);
    expect(mine[0].pending).toBeUndefined();
  });

  // THE CASE THAT MATCHING ON WORDS ALONE WOULD LOSE. She says the same thing
  // twice into the same silence, which is exactly what this row is about: no
  // screen told her the first one got through. One committed copy cancels one
  // pending copy, so the second is still her message and still on the screen.
  it('keeps the second of two identical messages when only the first has landed', () => {
    const landed = [...ledger, { id: 'w-1', ts: T + 95 * sec, source: 'founder', patch: { answer: 'yes' } }];
    const built = itemThread(landed, [], null, {
      pending: [{ at: T + 60 * sec, text: 'yes' }, { at: T + 110 * sec, text: 'yes' }],
    });
    const mine = hers(built);
    expect(mine).toHaveLength(2);
    expect(mine[0].pending).toBeUndefined();
    expect(mine[1].pending).toBe(true);
  });

  // A committed message written BEFORE she pressed send is a different message
  // of hers from earlier in the conversation, and cannot be this one landing.
  it('does not cancel itself against something she said earlier', () => {
    const earlier = [...ledger, { id: 'w-1', ts: T + 40 * sec, source: 'founder', patch: { answer: 'make it shorter' } }];
    const built = itemThread(earlier, [], null, { pending: [{ at: T + 60 * sec, text: 'make it shorter' }] });
    expect(hers(built)).toHaveLength(2);
  });

  it('ends the conversation on her, so no checkpoint is lifted below it', () => {
    const checked = [...ledger, { id: 'w-1', ts: T + 50 * sec, source: 'agent', patch: { note: 'Rewriting the headline now.' } }];
    expect(itemThread(checked, [], null, {}).outcome?.text).toBe('Rewriting the headline now.');
    expect(itemThread(checked, [], null, { pending: [{ at: T + 60 * sec, text: 'wait' }] }).outcome).toBe(null);
  });

  it('leaves a row with nothing in flight exactly as it was', () => {
    expect(itemThread(ledger, [], null, { pending: [] })).toEqual(itemThread(ledger, [], null, {}));
  });
});

describe('what the wait actually is', () => {
  // NOT A GUESS. The acknowledgement is Claude replaying the message, and until
  // it comes `submitReply` has not committed anything, so nothing on her screen
  // can have changed. This holds a real input open and watches the promise stay
  // unsettled while the agent is busy.
  it('does not settle until the agent replays the message back', async () => {
    const child = new EventEmitter();
    const written = [];
    child.stdin = Object.assign(new EventEmitter(), {
      writable: true, write: (line) => { written.push(line); return true; }, end: () => {},
    });
    child.stdout = new EventEmitter();
    attachClaudeInput(child);

    let settled = false;
    const sent = child.steer('make it shorter').then(() => { settled = true; });
    await new Promise((r) => setTimeout(r, 10));
    expect(settled).toBe(false); // the agent is mid tool call; her words are nowhere

    const { uuid } = JSON.parse(written[0]);
    child.stdout.emit('data', JSON.stringify({ type: 'user', uuid }) + '\n');
    await sent;
    expect(settled).toBe(true);
  });

  // It used to give up at two minutes and call that a failure, which pulled her
  // back to the row and made her re-send a message the agent then took twice
  // (w-d92559b84f). The wait now ends only when the session does.
  it('has no clock of its own to give up on', () => {
    expect(read('main/claude-input.mjs')).not.toContain('ackMs');
  });
  it('never switches her to the row when a live reply fails', () => {
    const app = read('renderer/src/App.tsx');
    const failed = app.slice(app.indexOf('        failed: (error: Error) => {'), app.indexOf('    // TAKING A SEND BACK'));
    expect(failed).not.toContain('setFocused(item)');
    expect(failed).toContain('focusedNow.current');
  });
});

describe('the pane it is drawn in', () => {
  it('hands the running row its own in-flight messages and nobody else\'s', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toContain('sending={sendingOn(focused)}');
    expect(app).toContain('sending.filter((s) => s.product === item.product && s.id === item.id)');
    expect(read('renderer/src/components/Focus.tsx')).toContain('sending={sending}');
  });

  it('gives the words back and takes the message down when the send fails', () => {
    const app = read('renderer/src/App.tsx');
    const failed = app.slice(app.indexOf('        failed: (error: Error) => {'));
    // `gone` is the same message after the three second hold (w-5281ef1221):
    // the queue holds one object or the other, and a failure takes either down.
    expect(failed.slice(0, 400)).toContain('setSending((q) => q.filter((s) => s !== mine && s !== gone))');
    expect(failed.slice(0, 400)).toContain('restoreFailedDraft');
  });

  // THE CONVERSATION IS NOT EMPTIED UNDER HER WHEN THE ROW IS WRITTEN TO.
  // The read's deps carry `item.updatedAt`, so clearing inside it blanked the
  // thread to the loading skeleton on every write to the row she was reading,
  // her own reply committing most of all. That is a second way the message she
  // had just sent left the screen.
  it('only empties when she has gone to another task', () => {
    const src = read('renderer/src/components/ItemThread.tsx');
    const clear = src.indexOf('setLedger(null);');
    const deps = src.indexOf('}, [item.product, item.id]);', clear);
    expect(deps).toBeGreaterThan(clear);
    expect(src.slice(clear, deps)).not.toContain('api.itemHistory');
  });
});
