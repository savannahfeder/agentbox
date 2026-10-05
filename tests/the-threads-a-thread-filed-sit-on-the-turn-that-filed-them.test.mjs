// THE LIST OF THREADS A THREAD FILED STOOD AT THE FOOT OF IT FOR EVER.
//
// Said 2026-10-05, with a screenshot of a task whose conversation had moved
// well past the run that filed anything: "it should instead occur at the end of
// the turn/message where it occured, not stuck at the bottom... Once I've seen
// it as a user, I don't really want to see it continuously. It's been
// processed." Then, when an earlier session moved the wrong block: "It was the
// filed agents that get stuck at the bottom... IF an agent files other threads
// that's what we want to not be attached to the bottom."
//
// Measured before the change: `<ThreadsMade rows={filed}>` was drawn by
// Focus.tsx under the whole conversation, so the three threads one run filed in
// the morning were still standing over the composer that evening, under an
// answer from a run that had nothing to do with them.
//
// THE RULE IS ONE COMPARISON OF TIMES. A thread was filed at a moment; the
// conversation is a list of moments; the turn it belongs to is the agent's turn
// that was being spoken then, and the list hangs off the END of that turn,
// which is where the agent came back to you with it.
//
// The case that must NOT move is the newest turn. Its last word is the
// checkpoint drawn under the thread, not a message in it, so a list that
// belongs to the newest turn stays at the foot, under that checkpoint, which is
// exactly where the screenshot has it and exactly what it should look like
// until something else is said.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { filedOnTurn } from '../renderer/src/filed-in-thread.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const T = Date.parse('2026-10-05T09:00:00');
const min = (n) => T + n * 60_000;

// You ask, the agent works and comes back, you ask again, it comes back again.
// Two agent turns, and the first one is the one that filed anything.
const CONVERSATION = [
  { at: min(0), who: 'you', text: 'Split the redesign up and file the parts.' },
  { kind: 'work', at: min(1), verb: 'Read', subject: 'PLAN.md' },
  { at: min(2), who: 'it', text: 'Reading the plan now.' },
  { at: min(5), who: 'it', text: 'I filed three threads under this one.', same: true },
  { at: min(30), who: 'you', text: 'Good. Now do the chat layout.' },
  { kind: 'work', at: min(31), verb: 'Edit', subject: 'chat.css' },
  { at: min(40), who: 'it', text: 'Chat layout is built.' },
];

const filed = (id, at) => ({ id, title: id, state: 'waiting', at });

describe('which turn carries the threads it filed', () => {
  it('hangs them off the last message of the agent turn that was speaking when they were filed', () => {
    const { onTurn, atFoot } = filedOnTurn(CONVERSATION, [filed('w-a', min(4)), filed('w-b', min(4))]);
    // Index 3 is "I filed three threads under this one", the end of that turn.
    expect([...onTurn.keys()]).toEqual([3]);
    expect(onTurn.get(3).map((r) => r.id)).toEqual(['w-a', 'w-b']);
    expect(atFoot).toEqual([]);
  });

  it('does not hang them off the first message of that turn, which is mid-sentence', () => {
    const { onTurn } = filedOnTurn(CONVERSATION, [filed('w-a', min(4))]);
    expect(onTurn.has(2)).toBe(false);
  });

  it('does not leave them at the foot once the conversation has moved past them', () => {
    const { atFoot } = filedOnTurn(CONVERSATION, [filed('w-a', min(4))]);
    expect(atFoot).toEqual([]);
  });

  it('keeps them at the foot when the turn that filed them is still the newest one', () => {
    // Filed during the second run: its last word is the checkpoint under the
    // thread, so the foot IS the end of that turn.
    const { onTurn, atFoot } = filedOnTurn(CONVERSATION, [filed('w-c', min(35))]);
    expect(onTurn.size).toBe(0);
    expect(atFoot.map((r) => r.id)).toEqual(['w-c']);
  });

  it('keeps them at the foot when they were filed after everything that has been said', () => {
    const { atFoot } = filedOnTurn(CONVERSATION, [filed('w-c', min(99))]);
    expect(atFoot.map((r) => r.id)).toEqual(['w-c']);
  });

  it('sorts a turn’s own rows oldest first, whatever order they arrive in', () => {
    const { onTurn } = filedOnTurn(CONVERSATION, [filed('w-late', min(5)), filed('w-early', min(3))]);
    expect(onTurn.get(3).map((r) => r.id)).toEqual(['w-early', 'w-late']);
  });

  it('puts one turn’s threads on that turn and a later turn’s at the foot, in the same thread', () => {
    const { onTurn, atFoot } = filedOnTurn(CONVERSATION, [filed('w-a', min(4)), filed('w-c', min(35))]);
    expect(onTurn.get(3).map((r) => r.id)).toEqual(['w-a']);
    expect(atFoot.map((r) => r.id)).toEqual(['w-c']);
  });

  it('is nothing at all on a thread that filed nothing', () => {
    const { onTurn, atFoot } = filedOnTurn(CONVERSATION, []);
    expect(onTurn.size).toBe(0);
    expect(atFoot).toEqual([]);
  });

  it('leaves them at the foot of a conversation with no agent message to hang them on', () => {
    const { onTurn, atFoot } = filedOnTurn([{ at: min(0), who: 'you', text: 'Do it.' }], [filed('w-a', min(4))]);
    expect(onTurn.size).toBe(0);
    expect(atFoot.map((r) => r.id)).toEqual(['w-a']);
  });

  it('never hangs them on a work line, which is not something anybody said', () => {
    const { onTurn } = filedOnTurn(CONVERSATION, [filed('w-a', min(4)), filed('w-c', min(35))]);
    expect(onTurn.has(1)).toBe(false);
    expect(onTurn.has(5)).toBe(false);
  });

  it('never hangs them on one of your own messages', () => {
    const { onTurn } = filedOnTurn(CONVERSATION, [filed('w-a', min(4)), filed('w-c', min(35))]);
    expect(onTurn.has(0)).toBe(false);
    expect(onTurn.has(4)).toBe(false);
  });
});

describe('where the list is drawn', () => {
  it('is no longer a block the pane hangs under the whole conversation', () => {
    const focus = read('renderer/src/components/Focus.tsx');
    // It stays for the two rows that have no conversation to put it in.
    expect(focus).toMatch(/\{\(made \|\| agent\) && <ThreadsMade rows=\{filed\}/);
    expect(focus.match(/<ThreadsMade rows=\{filed\}/g)).toHaveLength(1);
    // Handed down with the moment each one was filed, which is what places it.
    expect(focus).toMatch(/filed=\{filed\.map\(\(r\) => \(\{ \.\.\.r, at: r\.item\.createdAt \?\? 0 \}\)\)\}/);
  });

  it('is handed to the conversation, which puts each one on its own turn', () => {
    const thread = read('renderer/src/components/ItemThread.tsx');
    expect(thread).toMatch(/filedOnTurn\(events, filed\)/);
    expect(thread).toMatch(/tail=\{/);
  });

  it('has a slot on a turn to be drawn in', () => {
    const thread = read('renderer/src/components/Thread.tsx');
    expect(thread).toMatch(/tail\?: \(index: number\) => ReactNode/);
    expect(thread).toMatch(/\{tail\?\.\(ends\)\}/);
  });
});
