// A THREAD IS FOUND ONCE, BY ITS TITLE OR BY WHAT WAS SAID IN IT.
//
// The owner, 2026-11-13, with a picture of ⌘K for "chrome": five threads with
// near-identical titles, nothing to tell them apart, and what was said inside
// threads listed separately under Lines. "It'd be good for it to search both
// titles and content rather than having separate lines. It should prioritize
// them a little better." Measured before the change: a thread whose
// conversation talked about Chrome all the way through, with no Chrome in its
// title or summary, was not a thread row at all, only a line; and "opening"
// did not find "Chrome won't open".
import { describe, it, expect } from 'vitest';
import { rankFoundThreads } from '../renderer/src/threads/found-threads.ts';
import { splitHits, matches } from '../renderer/src/search.ts';
import { searchThreads } from '../renderer/src/threads/search.ts';
import { holds, queryOf, stemOf } from '../shared/word-match.mts';
import { createFinder } from '../main/everything-found.mts';
import type { FoundThread, WorkItem } from '../renderer/src/types.ts';

const thread = (id: string, title: string, at: number, extra: Partial<WorkItem> = {}) => ({
  id, product: 'p', title, status: 'open', labels: [], updatedAt: at, wrote: { title: { ts: at, source: 'founder' } }, ...extra,
}) as unknown as WorkItem;
const said = (id: string, hits: number, text: string, extra: Partial<FoundThread> = {}): FoundThread => ({
  kind: 'thread', product: 'p', id, ownerId: null, threadId: null, updatedAt: 0, uid: `u-${id}`, by: null, source: 'agent', at: 1, comment: false, text, hits, phrase: false, ...extra,
});
const rank = (items: WorkItem[], query: string, s: FoundThread[] = []) =>
  rankFoundThreads({ hits: searchThreads(items, query, { products: [], people: [], me: null }), said: s, items });

describe('one list, each thread once', () => {
  const titled = thread('t1', 'Chrome not opening', 100, { problem: 'Chrome opened no window after an agent started it.' });
  const talked = thread('t2', 'Agent browser setup', 300);
  const items = [titled, talked];

  it('puts a thread found only in what was said into the same list', () => {
    const got = rank(items, 'chrome', [said('t2', 12, 'Chrome for Testing is the one to start.')]);
    expect(got.map((r) => r.item.id)).toEqual(['t1', 't2']);
    expect(got[1].line).toBe('Chrome for Testing is the one to start.');
    expect(got[1].said?.uid).toBe('u-t2');
  });

  it('never lists a thread twice when its title and its messages both match', () => {
    const got = rank(items, 'chrome', [said('t1', 3, 'Chrome again.')]);
    expect(got.filter((r) => r.item.id === 't1')).toHaveLength(1);
  });

  it('shows what a thread is about under a title that already shows the words', () => {
    expect(rank(items, 'chrome')[0].line).toBe('Chrome opened no window after an agent started it.');
    expect(rank(items, 'chrome')[0].said).toBeNull();
  });

  it('drops a match in a thread this screen does not hold', () => {
    expect(rank(items, 'chrome', [said('gone', 9, 'Chrome.')]).map((r) => r.item.id)).toEqual(['t1']);
  });
});

describe('the order', () => {
  it('puts the words in a title first, even over a newer thread that only said them', () => {
    const old = thread('a', 'Chrome focus hijacking', 10);
    const fresh = thread('b', 'Weekly notes', 999);
    expect(rank([old, fresh], 'chrome', [said('b', 1, 'chrome')]).map((r) => r.item.id)).toEqual(['a', 'b']);
  });

  it('among titles, the most recently active first', () => {
    const got = rank([thread('a', 'Chrome one', 10), thread('b', 'Chrome two', 50), thread('c', 'Chrome three', 30)], 'chrome');
    expect(got.map((r) => r.item.id)).toEqual(['b', 'c', 'a']);
  });

  it('among the rest, the thread that talks about it most, then the newest', () => {
    const once = thread('once', 'Setup', 900);
    const lots = thread('lots', 'Browsers', 100);
    const some = thread('some', 'Agents', 500);
    const got = rank([once, lots, some], 'chrome', [said('once', 1, 'chrome'), said('lots', 9, 'chrome'), said('some', 3, 'chrome')]);
    expect(got.map((r) => r.item.id)).toEqual(['lots', 'some', 'once']);
  });

  it('a count only counts once it is a different amount: 6 and 9 mentions are ordered by time', () => {
    const got = rank([thread('six', 'X', 900), thread('nine', 'Y', 100)], 'chrome', [said('six', 6, 'chrome'), said('nine', 9, 'chrome')]);
    expect(got.map((r) => r.item.id)).toEqual(['six', 'nine']);
  });

  it('the typed phrase said in a thread outranks the words said apart', () => {
    const got = rank([thread('apart', 'X', 900), thread('phrase', 'Y', 100)], 'chrome window', [said('apart', 9, 'x'), said('phrase', 1, 'x', { phrase: true })]);
    expect(got.map((r) => r.item.id)).toEqual(['phrase', 'apart']);
  });
});

describe('a word finds its other forms', () => {
  it('"opening" finds "open" and "opened", and "threads" finds "thread"', () => {
    expect(matches(thread('w', "Chrome won't open", 1), ['chrome', 'opening'])).toBe(true);
    expect(matches(thread('w', 'It opened twice', 1), ['opening', 'twice'])).toBe(true);
    expect(holds('one thread per job', queryOf('threads job'))).toBe(true);
  });

  it('does not cut a short word into something else', () => {
    expect(stemOf('notes')).toBe('note');
    expect(stemOf('thing')).toBeNull();
    expect(stemOf('access')).toBeNull();
    expect(matches(thread('w', 'Nothing here', 1), ['notes'])).toBe(false);
  });

  it('still needs an earlier word whole when it has no ending', () => {
    expect(matches(thread('w', 'Read today', 1), ['to', 'read'])).toBe(false);
  });

  it('marks the whole word a stem found', () => {
    const runs = splitHits('Chrome opened twice', ['opening']);
    expect(runs.find((r) => r.hit)?.text).toBe('opened');
  });
});

describe('the finder tallies each thread once', () => {
  const say = (id: string, uid: string, ts: number, text: string) => ({ id, uid, ts, by: null, source: 'agent', patch: { result: text } });
  const lines: Record<string, ReturnType<typeof say>[]> = {
    lots: Array.from({ length: 8 }, (_, i) => say('lots', `l${i}`, 10 + i, `chrome note ${i}`)),
    once: [say('once', 'o1', 999, 'chrome once')],
  };
  const finder = createFinder({
    listThreads: () => Object.keys(lines).map((key) => ({ key, kind: 'thread' as const, product: 'p', id: key, version: 1, updatedAt: 1 })),
    loadThread: async (t) => ({ lines: lines[t.key] as never, resolve: null }),
  });

  it('counts the messages that hold the words and keeps the newest as its line', async () => {
    const got = await finder.search('chrome', { lines: 2, threads: 10 });
    expect(got.threads.map((t) => [t.id, t.hits])).toEqual([['lots', 8], ['once', 1]]);
    expect(got.threads[0].uid).toBe('l7');
    // The line list is unchanged: newest first, capped.
    expect(got.lines.map((l) => l.uid)).toEqual(['o1', 'l7']);
  });

  it('sends no tally unless asked for one', async () => {
    expect((await finder.search('chrome')).threads).toEqual([]);
  });
});
