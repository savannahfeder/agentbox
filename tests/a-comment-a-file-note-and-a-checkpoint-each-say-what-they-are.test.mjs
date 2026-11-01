// A COMMENT, A NOTE ON A FILE AND AN AGENT'S CHECKPOINT EACH SAY WHAT THEY ARE.
//
// What broke, seen 2026-10-30 on two copies of the team version: Maya's comment
// on Dev's thread was drawn on his copy exactly like a reply, under a "Reply…"
// box that starts his agent, so nothing said it had gone to him and started
// nothing. A note pinned to a file and an agent's checkpoint read the same way.
// The owner: "What comments do is kind of unclear." Measured by reading the
// events the thread draws: a comment, a file note and a checkpoint carried no
// field that told them apart from a message.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { threadEvents } from '../renderer/src/thread-history';
import { itemThread } from '../renderer/src/item-thread';
import { messageKind } from '../renderer/src/threads/message-kind';

const line = (ts, patch, extra = {}) => ({ id: 'w-1', ts, source: 'founder', patch, ...extra });
const ledger = [
  line(1, { title: 'Reminder emails', body: 'Fix the reminder emails.' }),
  line(2, { note: 'Found it: reminders are scheduled in UTC.' }, { source: 'agent' }),
  line(3, { result: 'Fixed. 41 patients got one at night.' }, { source: 'agent' }),
  line(4, { comment: { text: 'Yes to the apology email.' } }, { source: 'system', by: 'maya' }),
  line(5, { artifact: { do: 'note', id: 'n1', file: 'apology-draft.md', text: 'Soften this line.', place: { kind: 'line', line: 3 } } }, { by: 'maya' }),
  line(6, { answer: 'Will do.' }),
];

describe('what the thread says each message is', () => {
  const { events } = itemThread(ledger, [], null, { whole: true });
  const said = events.filter((e) => e.kind !== 'work' && e.kind !== 'run');
  const find = (words) => said.find((e) => (e.text ?? '').includes(words));

  it('a teammate comment is a comment that started no agent', () => {
    expect(messageKind(find('apology email'))).toEqual({ word: 'Comment', why: 'did not start the agent' });
  });

  it('a note on a file names the file and the place', () => {
    expect(messageKind(find('Soften'))).toMatchObject({ word: 'Note on apology-draft.md', file: true });
  });

  it("an agent's note on the way is a checkpoint", () => {
    expect(messageKind(find('scheduled in UTC'))).toEqual({ word: 'Checkpoint', why: 'progress so far' });
  });

  it('the ask, a reply and the result are plain messages, with no tag', () => {
    expect(messageKind(find('Fix the reminder'))).toBe(null);
    expect(messageKind(find('Will do'))).toBe(null);
    expect(messageKind({ who: 'it', text: 'Fixed.', at: 3 })).toBe(null);
  });

  it('the raw history marks the comment and the checkpoint, so the words can change freely', () => {
    const h = threadEvents(ledger);
    expect(h.find((e) => e.words === 'Yes to the apology email.')?.says).toBe('comment');
    expect(h.find((e) => e.field === 'note')?.says).toBe('progress');
  });
});

describe('the thread draws the tag in the message head', () => {
  const src = fs.readFileSync(new URL('../renderer/src/components/Thread.tsx', import.meta.url), 'utf8');
  it('both kinds of message head use it', () => {
    expect(src.match(/<MessageKind e=\{e\} \/>/g)?.length).toBe(2);
  });
});

describe('the comment box says where a comment goes', () => {
  const src = fs.readFileSync(new URL('../renderer/src/threads/TeammateThread.tsx', import.meta.url), 'utf8');
  it('names the owner, their Needs you, and that it starts no agent', () => {
    expect(src).toMatch(/commentWhere\(owner\)/);
  });
});
