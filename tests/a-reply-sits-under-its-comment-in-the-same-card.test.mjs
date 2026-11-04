// A REPLY SITS UNDER ITS COMMENT, IN THE SAME CARD.
//
// Dev answered Sofia's pin in the thread ("your pin is exact ...
// that is Maya's call"), but the pin's card in the viewer still showed only her
// words. A day later she could not tell from the picture whether Dev said yes,
// and an agent reading the file cold saw "no reply on it". Measured on the
// ledger: a mark could be a note, a resolve or an approval, never an answer to
// a note, so there was nowhere for a reply to live.
import { it, expect, describe } from 'vitest';
import { cleanMark, fileNewsFor, marksOf } from '../shared/artifact-marks.mjs';
import { foldWorkItems } from '../shared/work-items.mjs';
import { threadEvents } from '../renderer/src/thread-history';

const SOFIA = 'p-sofia';
const DEV = 'p-dev';
const MAYA = 'p-maya';
const pin = { do: 'note', id: 'n1', file: 'slots.png', place: { kind: 'pin', x: 0.4, y: 0.2 }, text: 'Add slot is hidden' };
const reply = (id, text, over = {}) => ({ do: 'reply', id, on: 'n1', file: 'slots.png', text, ...over });
const line = (artifact, by, ts) => ({ id: 'w-1', ts, source: 'founder', by, uid: `u-${ts}`, patch: { artifact } });
const row = (lines) => ({ ...foldWorkItems(lines).get('w-1'), createdBy: SOFIA });

describe('what a reply may carry', () => {
  it('keeps its comment, its file and its words', () => {
    expect(cleanMark(reply('r1', '  Agreed, fixing it  '))).toEqual({ do: 'reply', id: 'r1', on: 'n1', file: 'slots.png', text: 'Agreed, fixing it' });
  });
  it('refuses one with no words, no comment or a made-up id', () => {
    expect(cleanMark(reply('r1', '   '))).toBeUndefined();
    expect(cleanMark(reply('r1', 'Yes', { on: undefined }))).toBeUndefined();
    expect(cleanMark(reply('../x', 'Yes'))).toBeUndefined();
  });
});

describe('on the ledger', () => {
  it('folds each reply under its comment, oldest first, with who said it', () => {
    const marks = marksOf([
      { ...pin, by: SOFIA, ts: 1 },
      { ...reply('r2', 'Maya decides'), by: DEV, ts: 3 },
      { ...reply('r1', 'Your pin is exact'), by: DEV, ts: 2 },
    ]);
    expect(marks.notes[0].replies.map((r) => [r.id, r.by, r.text])).toEqual([['r1', DEV, 'Your pin is exact'], ['r2', DEV, 'Maya decides']]);
  });
  it('a reply pressed twice is one reply', () => {
    const marks = marksOf([{ ...pin, by: SOFIA, ts: 1 }, { ...reply('r1', 'Yes'), by: DEV, ts: 2 }, { ...reply('r1', 'Yes'), by: DEV, ts: 3 }]);
    expect(marks.notes[0].replies).toHaveLength(1);
  });
  it('a reply to a comment that is not there is dropped, not drawn alone', () => {
    const marks = marksOf([{ ...reply('r1', 'Yes', { on: 'gone' }), by: DEV, ts: 2 }]);
    expect(marks.notes).toEqual([]);
  });
  it('a reply is not a note: it takes no pin number', () => {
    const marks = marksOf([{ ...pin, by: SOFIA, ts: 1 }, { ...reply('r1', 'Yes'), by: DEV, ts: 2 }, { ...pin, id: 'n2', by: MAYA, ts: 3 }]);
    expect(marks.notes.map((n) => n.pin)).toEqual([1, 2]);
  });
});

describe('who it waits on', () => {
  const lines = [line(pin, SOFIA, 1), line(reply('r1', 'Your pin is exact'), DEV, 2)];
  it('waits on the person who made the comment', () => {
    expect(fileNewsFor(row(lines), SOFIA).map((n) => [n.kind, n.id, n.by, n.file])).toEqual([['reply', 'r1', DEV, 'slots.png']]);
  });
  it('does not wait on the one who wrote it', () => {
    expect(fileNewsFor(row(lines), DEV).filter((n) => n.kind === 'reply')).toEqual([]);
  });
  it('waits on someone else who replied before, and not on somebody merely on the thread', () => {
    const more = [...lines, line(reply('r2', 'Keep it as the spec says'), MAYA, 3)];
    expect(fileNewsFor(row(more), DEV).map((n) => n.id)).toContain('r2');
    expect(fileNewsFor(row(more), 'p-jun')).toEqual([]);
  });
  it('goes once seen, and once the comment is resolved', () => {
    expect(fileNewsFor(row([...lines, line({ do: 'seen', on: ['r1'] }, SOFIA, 3)]), SOFIA)).toEqual([]);
    expect(fileNewsFor(row([...lines, line({ do: 'resolve', on: 'n1' }, SOFIA, 3)]), SOFIA)).toEqual([]);
  });
});

describe('in the thread', () => {
  it('says it replied, and links to the comment it answers', () => {
    const said = threadEvents([
      { id: 'w-1', ts: 0, source: 'founder', by: SOFIA, uid: 'u0', patch: { title: 'T', body: 'See it' } },
      line(pin, SOFIA, 1), line(reply('r1', 'Your pin is exact'), DEV, 2),
    ]).filter((e) => e.fileMark);
    expect(said.map((e) => [e.said, e.fileMark.id, e.words, e.by])).toEqual([
      ['Commented', 'n1', 'Add slot is hidden', SOFIA],
      ['Replied', 'n1', 'Your pin is exact', DEV],
    ]);
  });
});
