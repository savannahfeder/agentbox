// A SHARED PROJECT'S LEDGER IS WRITTEN BY SEVERAL PEOPLE, AND THE FOLD HAS TO
// SAY WHICH ONE, AND HAS TO AGREE WITH ITSELF ON EVERY MAC.
//
// Until the team version, every human line was `source: 'founder'` and there
// was only ever one human, so "who said this" had one answer. With teammates
// it has several, and the inbox has to draw Theo's face on Theo's message.
// Lines now carry `by` (a person id) and `uid` (the line's own id, which is
// how a line pulled twice from the cloud is stored once).
//
// The second half is convergence. Two Macs receive the same lines in a
// different order: each appends its own as it writes them and pulls the
// others' later. Field values settle by authority and then by time, so the
// order must not change what the row says. Measured on the fold as it stood on
// 2026-09-30: true for every field written at distinct times, which is what
// these tests pin.
import { it, expect, describe } from 'vitest';
import { foldWorkItems, normalizeLine, buildLine } from '../shared/work-items.mjs';

const maya = 'p-maya';
const theo = 'p-theo';

describe('who wrote a line', () => {
  it('keeps by and uid when a line is read back', () => {
    const line = normalizeLine({ id: 'w-aaaaaa', ts: 5, source: 'founder', by: maya, uid: 'l-1', patch: { title: 'x' } });
    expect(line.by).toBe(maya);
    expect(line.uid).toBe('l-1');
  });

  it('drops a by or uid that is not a short string', () => {
    const line = normalizeLine({ id: 'w-aaaaaa', ts: 5, source: 'founder', by: { evil: 1 }, uid: 'x'.repeat(200), patch: { title: 'x' } });
    expect(line.by).toBeNull();
    expect(line.uid).toBeNull();
  });

  it('a line with no writer still reads exactly as before', () => {
    const line = normalizeLine({ id: 'w-aaaaaa', ts: 5, source: 'agent', patch: { title: 'x' } });
    expect(line.by).toBeNull();
    const item = foldWorkItems([line]).get('w-aaaaaa');
    expect(item.createdBy).toBeNull();
    expect(item.wrote.title).toEqual({ ts: 5, source: 'agent' });
  });

  it('records who wrote each surviving field', () => {
    const items = foldWorkItems([
      { id: 'w-aaaaaa', ts: 1, source: 'founder', by: maya, patch: { title: 'Acme renewal', status: 'open' } },
      { id: 'w-aaaaaa', ts: 2, source: 'founder', by: theo, patch: { answer: 'Ship it' } },
    ]);
    const item = items.get('w-aaaaaa');
    expect(item.wrote.title.by).toBe(maya);
    expect(item.wrote.answer.by).toBe(theo);
  });

  it('names the person who started the row, whatever order the lines arrive in', () => {
    const first = { id: 'w-aaaaaa', ts: 1, source: 'founder', by: maya, patch: { title: 'Acme renewal' } };
    const later = { id: 'w-aaaaaa', ts: 9, source: 'founder', by: theo, patch: { answer: 'Ship it' } };
    expect(foldWorkItems([first, later]).get('w-aaaaaa').createdBy).toBe(maya);
    expect(foldWorkItems([later, first]).get('w-aaaaaa').createdBy).toBe(maya);
  });

  it('buildLine itself stamps nothing: the writer is added where lines reach the disk', () => {
    const line = buildLine({ id: 'w-aaaaaa', patch: { title: 'x' }, source: 'founder', now: 1 });
    expect(line.by).toBeUndefined();
    expect(line.uid).toBeUndefined();
  });
});

describe('the team fields', () => {
  const fold = (patch) => foldWorkItems([{ id: 'w-aaaaaa', ts: 1, source: 'founder', patch: { title: 't', ...patch } }]).get('w-aaaaaa');

  it('holds who has to act, whose Mac runs it, the due day and the people on it', () => {
    const item = fold({ assignee: theo, runner: maya, due: '2026-10-02', people: [maya, theo] });
    expect(item.assignee).toBe(theo);
    expect(item.runner).toBe(maya);
    expect(item.due).toBe('2026-10-02');
    expect(item.people).toEqual([maya, theo]);
  });

  it('refuses a due day that is not a calendar date', () => {
    expect(fold({ due: 'thursday' }).due).toBeUndefined();
    expect(fold({ due: '2026-13-40' }).due).toBeUndefined();
  });

  it('lets a due day be cleared with the word none', () => {
    const items = foldWorkItems([
      { id: 'w-aaaaaa', ts: 1, source: 'founder', patch: { title: 't', due: '2026-10-02' } },
      { id: 'w-aaaaaa', ts: 2, source: 'founder', patch: { due: 'none' } },
    ]);
    expect(items.get('w-aaaaaa').due).toBe('none');
  });

  it('keeps only short strings in people', () => {
    expect(fold({ people: [maya, 7, '', 'x'.repeat(300)] }).people).toEqual([maya]);
  });
});

describe('two Macs agree', () => {
  // Maya starts the row, Theo answers, Maya's agent writes a result, Maya
  // archives. Every ordering of those four lines must fold to the same row.
  const lines = [
    { id: 'w-aaaaaa', ts: 10, source: 'founder', by: maya, uid: 'a', patch: { title: 'Launch video', status: 'open', assignee: theo } },
    { id: 'w-aaaaaa', ts: 20, source: 'founder', by: theo, uid: 'b', patch: { answer: 'Change the ending' } },
    { id: 'w-aaaaaa', ts: 30, source: 'agent', by: maya, uid: 'c', patch: { result: 'Ending changed', status: 'done' } },
    { id: 'w-aaaaaa', ts: 40, source: 'founder', by: maya, uid: 'd', patch: { status: 'done', note: 'thanks' } },
  ];
  const shape = (item) => ({
    title: item.title, status: item.status, answer: item.answer, result: item.result,
    note: item.note, assignee: item.assignee, createdBy: item.createdBy,
    who: Object.fromEntries(Object.entries(item.wrote).map(([k, v]) => [k, v.by ?? null])),
  });

  function permutations(xs) {
    if (xs.length <= 1) return [xs];
    return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest]));
  }

  it('folds every arrival order of the same lines to the same row', () => {
    const expected = shape(foldWorkItems(lines).get('w-aaaaaa'));
    for (const order of permutations(lines)) {
      expect(shape(foldWorkItems(order).get('w-aaaaaa'))).toEqual(expected);
    }
  });
});
