// Z AFTER A MESSAGE TO A WORKING AGENT STOPS AT THAT MESSAGE, and for the first
// three seconds it really takes it back.
//
// The bug (w-5281ef1221): a message sent to an agent that was working, then Z a
// second later to take that message back, undid a different agent's work from a
// while earlier.
//
// Both halves were real. A reply to a row with a live session took its
// own path in `answerWith`, went straight out, and returned without leaving
// anything on the undo pile, so Z fell through to `undoStack[length - 1]`, which
// is whatever she last did somewhere else. The stack lives for the whole
// session, so that entry can be hours old and on another agent's row.
//
// The first fix left a gap: a message still in the sending state could not be
// undone, although the screen said Sending, so it was not with the agent yet.
//
// SO THERE ARE TWO STATES AND THE MESSAGE SAYS WHICH. For UNDO_GRACE_MS nothing
// has been written anywhere and Z is a perfect undo: the words and the pictures
// go back in the reply box, the bubble comes off the thread. After that
// `child.steer` has written them onto the session's stdin (main/claude-input),
// where the CLI takes them at its next break, and no undo can reach them. The
// straight-through send was defended on the grounds that a grace window would
// say Sent while the agent worked on without the message; that was true before
// the conversation drew the pending message, and "Sending…" is now the label
// that makes the window honest.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, '..', ...p), 'utf8');
const app = read('renderer', 'src', 'App.tsx');

// The live branch of answerWith, from the `isRunning` test to its `return`.
function liveBranch() {
  const from = app.indexOf('if (isRunning) {');
  expect(from).toBeGreaterThan(-1);
  const to = app.indexOf('\n      return;\n    }', from);
  expect(to).toBeGreaterThan(from);
  return app.slice(from, to);
}

describe('the three seconds in which it is still hers', () => {
  it('holds the message on the app own grace window instead of sending it', () => {
    const branch = liveBranch();
    expect(branch).toMatch(/pendingRef\.current = \{/);
    expect(branch).toMatch(/\}, UNDO_GRACE_MS\);/);
    // The same window every other undoable action in the app uses, so a Z
    // inside it lands in undo()'s first branch rather than on the stack.
    expect(app).toMatch(/const UNDO_GRACE_MS = 3000;/);
  });

  it('hands her words and her pictures back, and takes the bubble off the thread', () => {
    const branch = liveBranch();
    const restore = branch.slice(branch.indexOf('restore: (): Restored => {'));
    expect(restore).toMatch(/setSending\(\(q\) => q\.filter\(\(s\) => s !== mine\)\)/);
    expect(restore).toMatch(/restoreDraft\(item, sent\?\.words \?\? text, sent\?\.attachments \?\? \[\]\)/);
  });

  it('flushes first, so a second message inside the window sends the first', () => {
    const branch = liveBranch();
    const flush = branch.indexOf('await flushPending();');
    const arm = branch.indexOf('pendingRef.current = {');
    expect(flush).toBeGreaterThan(-1);
    expect(arm).toBeGreaterThan(flush);
  });

  it('raises no toast, because the message on the screen is the one that says it', () => {
    // w-87c4e7913c took two bars off this path. The window does not put one back.
    const branch = liveBranch();
    const upToSend = branch.slice(0, branch.indexOf('const handOver'));
    expect(upToSend).not.toMatch(/showToast\(/);
  });
});

describe('after the window, when Z cannot reach it', () => {
  // 2026-09-25: the push goes through `pushUndo`, which is what stamps the
  // entry with the moment it was made so Z cannot reach it a minute later
  // (renderer/src/undo-window.ts, w-da37b95d1a). It is the same entry object,
  // which is why the failure path can still take it back off by identity.
  it('leaves an entry, so Z cannot reach the row she was on before', () => {
    expect(liveBranch()).toMatch(/pushUndo\(alreadyGone\)/);
  });

  it('pushes it at the hand-over, which is the moment it becomes true', () => {
    const branch = liveBranch();
    const handOver = branch.indexOf('const handOver = async () => {');
    const push = branch.indexOf('pushUndo(alreadyGone)');
    const send = branch.indexOf('await deliverReply({');
    expect(handOver).toBeGreaterThan(-1);
    expect(push).toBeGreaterThan(handOver);
    // Inside handOver and before the send: `submitReply` waits on the provider
    // replaying the message at its next tool boundary, so an entry pushed on
    // acceptance is not on the pile for a press made a second later.
    expect(send).toBeGreaterThan(push);
  });

  it('says the message is already gone rather than implying it came back', () => {
    const branch = liveBranch();
    expect(branch).toMatch(/label: 'Your message is already with the agent\. Send another one to add to it\.'/);
    // No `restore`, because undo() reads one as "her words came back" and
    // appends a sentence saying which box to look in. By now they are in
    // neither box and the message is in the thread.
    const at = branch.indexOf('const alreadyGone = {');
    const entry = branch.slice(at, branch.indexOf('};', at));
    expect(entry).not.toMatch(/restore:/);
    expect(entry).not.toMatch(/back in the reply box/);
  });

  it('does not stop the session, which was working before she typed', () => {
    expect(liveBranch()).not.toMatch(/stopSession/);
    expect(liveBranch()).not.toMatch(/withdrawReply/);
  });

  it('takes her back to the conversation her message is sitting in', () => {
    expect(liveBranch()).toMatch(/run: async \(\) => \{ setFocused\(item\); markSeen\(item\); \}/);
  });

  it('takes the entry off again when the hand-over failed, because then nothing was sent', () => {
    const branch = liveBranch();
    const failed = branch.slice(branch.indexOf('failed: (error: Error) => {'));
    expect(failed).toMatch(/setUndoStack\(\(u\) => u\.filter\(\(e\) => e !== alreadyGone\)\)/);
    expect(failed).toMatch(/restoreFailedDraft\(/);
  });
});

describe('the message says which of the two states it is in', () => {
  it('wears the way back while it is held and drops it at the hand-over', () => {
    const thread = read('renderer', 'src', 'components', 'Thread.tsx');
    // The line after the hand-over now also says when it waits on a running
    // step, with Send now (w-f37a34def6); held still reads the way back.
    expect(thread).toMatch(/e\.held \? 'Sending… press Z to undo' : [^\n]*'Sending…'/);
  });

  it('carries the flag from the queue to the message', () => {
    const itemThread = read('renderer', 'src', 'item-thread.ts');
    expect(itemThread).toMatch(/pending: true, held: mine\.held/);
    expect(read('renderer', 'src', 'types.ts')).toMatch(/\n  held\?: boolean;/);
  });

  it('swaps the whole message rather than writing the flag in place', () => {
    // The queue is identified by object identity in `accepted` and `failed`,
    // and React only redraws on a new one, so the two states are two objects.
    const branch = liveBranch();
    expect(branch).toMatch(/const gone = \{ \.\.\.mine, held: false \};/);
    expect(branch).toMatch(/setSending\(\(q\) => q\.map\(\(s\) => \(s === mine \? gone : s\)\)\)/);
    expect(branch).toMatch(/q\.filter\(\(s\) => s !== mine && s !== gone\)/);
  });
});

describe('why the window has to close at all', () => {
  it('steer writes to the session in the same tick, so after it there is nothing to retract', () => {
    // The promise waits on the ACKNOWLEDGEMENT, not on the handing over: the
    // write happens immediately and the CLI replays the message back when it
    // consumes it. That is the whole reason the second state exists.
    const input = read('main', 'claude-input.mjs');
    const steer = input.slice(input.indexOf('child.steer = text =>'));
    expect(steer).toMatch(/child\.stdin\.write\(JSON\.stringify\(\{ type: 'user'/);
    expect(read('main', 'live-replies.mjs')).toMatch(/session\.child\.steer\(answer\)/);
  });
});
