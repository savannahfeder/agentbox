// Comments on a shared link never reached the inbox (2026-11-10). Someone
// commented on a shared film, and the app wrote it as a note on the thread
// the film came from. That thread was already open with an answer on it, so
// nothing changed in the list. A second batch replaced the first note, so ten
// comments read as one. Now a thread holds every comment on its links until
// its owner replies to it, closes it or puts it off. Until then it is in the
// inbox, as one row that names who commented.
import { describe, it, expect } from 'vitest';
import { foldWorkItems } from '../shared/work-items.mts';
import { belongsInInbox } from '../renderer/src/list-rules.ts';
import { linkCommentLine } from '../renderer/src/threads/teammate-thread.ts';

const opened = { id: 'w-1', ts: 1, source: 'founder', patch: { title: 'Cut the launch film', status: 'open', labels: ['founder'] } };
const answered = { id: 'w-1', ts: 2, source: 'agent', patch: { result: 'Here is cut 3', status: 'done' } };
// Closed by its owner, so it has left the inbox.
const closed = { id: 'w-1', ts: 2.5, source: 'founder', patch: { status: 'done' } };
const comment = (ts: number, name: string, text: string, place?: unknown) => ({
  id: 'w-1', ts, source: 'system', patch: { note: `${name} commented on agent-docs-cut3.mp4. "${text}"`, linkComment: { name, file: 'agent-docs-cut3.mp4', text, ...(place ? { place } : {}) } },
});
const fold = (lines: unknown[]) => foldWorkItems(lines).get('w-1')!;

describe('a thread keeps every comment on its links', () => {
  it('in the order they came, with who, which file and the words', () => {
    const item = fold([opened, answered, comment(3, 'Savy', 'testing'), comment(4, 'Jun', 'hello there')]);
    expect(item.linkComments).toEqual([
      { name: 'Savy', file: 'agent-docs-cut3.mp4', text: 'testing', ts: 3 },
      { name: 'Jun', file: 'agent-docs-cut3.mp4', text: 'hello there', ts: 4 },
    ]);
  });

  it('and the moment in the film a comment points at', () => {
    const item = fold([opened, comment(3, 'Savy', 'too fast', { kind: 'time', s: 24.4 })]);
    expect(item.linkComments?.[0].place).toEqual({ kind: 'time', s: 24.4 });
  });

  it('until its owner replies, closes it or puts it off', () => {
    for (const dealt of [{ answer: 'Fixed the cut' }, { status: 'done' }, { start: 'later' }, { snoozedUntil: 99_999 }]) {
      const item = fold([opened, comment(3, 'Savy', 'testing'), { id: 'w-1', ts: 4, source: 'founder', patch: dealt }]);
      expect(item.linkComments, JSON.stringify(dealt)).toBeUndefined();
    }
  });

  it('but not when an agent or the app writes on the thread', () => {
    const item = fold([opened, comment(3, 'Savy', 'testing'), { id: 'w-1', ts: 4, source: 'agent', patch: { note: 'Still cutting', status: 'done' } }]);
    expect(item.linkComments).toHaveLength(1);
  });

  it('and a comment after the reply starts the count again', () => {
    const item = fold([opened, comment(3, 'Savy', 'one'), { id: 'w-1', ts: 4, source: 'founder', patch: { answer: 'ok' } }, comment(5, 'Jun', 'two')]);
    expect(item.linkComments?.map((c) => c.text)).toEqual(['two']);
  });
});

describe('the inbox', () => {
  const now = 10_000;
  it('holds a thread its owner closed, once a comment comes in', () => {
    expect(belongsInInbox(fold([opened, answered, closed]), { now })).toBe(false);
    expect(belongsInInbox(fold([opened, answered, closed, comment(3, 'Savy', 'testing')]), { now })).toBe(true);
  });
  it('holds it while an agent works on it too, as a teammate\'s comment does', () => {
    expect(belongsInInbox(fold([opened, comment(3, 'Savy', 'testing')]), { now, live: true })).toBe(true);
  });
  it('lets it go once the comments are dealt with', () => {
    expect(belongsInInbox(fold([opened, answered, closed, comment(3, 'Savy', 'testing'), { id: 'w-1', ts: 4, source: 'founder', patch: { status: 'done' } }]), { now })).toBe(false);
  });
});

describe('the row says it once, however many there are', () => {
  it('names one person and their words', () => {
    expect(linkCommentLine([{ name: 'Savy', file: 'agent-docs-cut3.mp4', text: 'testing', ts: 1 }])).toBe('Savy commented on agent-docs-cut3.mp4: testing');
  });
  it('counts the rest, people and comments', () => {
    const ten = Array.from({ length: 10 }, (_, n) => ({ name: n % 2 ? 'Jun' : 'Savy', file: 'agent-docs-cut3.mp4', text: `note ${n}`, ts: n }));
    expect(linkCommentLine(ten)).toBe('10 comments on agent-docs-cut3.mp4 from Jun and Savy: note 9');
  });
  it('says where in the film the newest one is', () => {
    expect(linkCommentLine([{ name: 'Savy', file: 'cut.mp4', text: 'too fast', ts: 1, place: { kind: 'time', s: 84 } }])).toBe('Savy commented on cut.mp4 at 1:24: too fast');
  });
  it('names the files when the comments are on more than one', () => {
    expect(linkCommentLine([
      { name: 'Savy', file: 'cut.mp4', text: 'a', ts: 1 },
      { name: 'Savy', file: 'plan.md', text: 'b', ts: 2 },
    ])).toBe('2 comments on 2 files from Savy: b');
  });
  it('says nothing when there are none', () => {
    expect(linkCommentLine(undefined)).toBeNull();
    expect(linkCommentLine([])).toBeNull();
  });
});
