// A THREAD HANDED ON STAYS HANDED AFTER A REPLY IS TAKEN BACK (synthetic team rerun, 2026-11-20).
//
// Sam gave "Payment amount as cents or decimal" to Theo, which closed it with
// "Given to Theo Okafor: …". The reply box still held his note, he sent it to
// his own closed thread, then pressed Z. Taking the reply back wrote
// "(withdrawn)" over the thread's answer and put it back in Done, so nothing
// said it had been handed on and the standup said he Finished it. Measured on
// what the undo writes and on the posts the standup draws: a finished
// thread gets its answer back, and a handed-on thread reads "Handed … to Theo",
// in your post and in a teammate's on your screen.
import { describe, it, expect } from 'vitest';
import { withdrawReply } from '../renderer/src/list-rules.ts';
import { teamToday } from '../renderer/src/team/today.ts';
import { DEFAULT_STANDUP, postsOf, sentenceOf, standupWindow, type Part } from '../renderer/src/team/standup.ts';
import { handedOn, handedToName } from '../shared/thread-cards.mts';

const NOW = new Date(2026, 10, 20, 11, 0).getTime();
const at = (h: number) => new Date(2026, 10, 20, h, 0).getTime();
const GIVEN = 'Given to Theo Okafor: Hi Theo, the routes overlap with yours.';
const words = (parts: Part[]) => parts.map((p) => (typeof p === 'string' ? p : 'more' in p ? `${p.more} more` : `[${p.title}]`)).join('');

describe('taking back a reply', () => {
  it('on a finished thread puts its own answer back', () => {
    expect(withdrawReply('done', GIVEN)).toEqual({ answer: GIVEN, status: 'done' });
    expect(handedOn({ status: 'done', ...withdrawReply('done', GIVEN) })).toBe(true);
  });
  it('on an open thread leaves no answer for a worker to carry', () => {
    expect(withdrawReply('open', 'Earlier words')).toEqual({ answer: '(withdrawn)', status: 'open' });
    expect(withdrawReply('blocked', 'Earlier words')).toEqual({ answer: '(withdrawn)', status: 'blocked' });
  });
  it('on a finished thread with no answer, or a withdrawn one, writes the mark', () => {
    expect(withdrawReply('done')).toEqual({ answer: '(withdrawn)', status: 'done' });
    expect(withdrawReply('done', '(withdrawn)')).toEqual({ answer: '(withdrawn)', status: 'done' });
  });
});

describe('whom it was handed to', () => {
  it('the name in the hand-on note, with or without a note after it', () => {
    expect(handedToName({ status: 'done', answer: GIVEN })).toBe('Theo Okafor');
    expect(handedToName({ status: 'done', answer: 'Given to Maya Chen.' })).toBe('Maya Chen');
  });
  it('nobody for a thread not handed on', () => {
    expect(handedToName({ status: 'open', answer: GIVEN })).toBeNull();
    expect(handedToName({ status: 'done', answer: 'Given the copy, ship it.' })).toBeNull();
  });
});

describe('the standup', () => {
  const base = { range: 'today' as const, now: NOW, me: 'p-sam', decisions: [], mentions: [], needs: [], mates: [], mateOf: () => null, people: [{ id: 'p-sam', name: 'Sam Ortiz' }, { id: 'p-theo', name: 'Theo Okafor' }], window: standupWindow(at(0), DEFAULT_STANDUP, NOW) };
  const handed = { id: 'w-fb57', product: 'api', title: 'Payment amount as cents or decimal', status: 'done', labels: [], answer: GIVEN, result: 'Added a payments store.', createdAt: at(8), updatedAt: at(10), wrote: { status: { ts: at(10) } } };
  it('your post says you handed it, to whom, and not that you finished it', () => {
    const day = teamToday({ ...base, items: [handed] as never, products: [{ slug: 'api', name: 'Payments API' }] as never, cards: [] });
    const mine = postsOf(day.people, { mates: true, live: true }).find((p) => p.key === 'me')!;
    expect(mine.finished).toEqual([]);
    expect(words(sentenceOf(mine))).toBe('Handed [Payment amount as cents or decimal] to Theo.');
  });
  it('a teammate’s post on your screen says the same', () => {
    const card = { personId: 'p-sam', threadId: 'w-fb57', visible: true, title: 'Payment amount as cents or decimal', project: 'Payments API', state: 'done', priority: null, problem: null, progress: null, solution: GIVEN, blockedBy: [], blocks: [], people: null, updatedAt: at(10) };
    const day = teamToday({ ...base, me: 'p-lena', people: [...base.people, { id: 'p-lena', name: 'Lena Fischer' }], items: [], products: [], cards: [card] as never });
    const sam = postsOf(day.people, { mates: true, live: true }).find((p) => p.key === 'person:p-sam')!;
    expect(words(sentenceOf(sam))).toBe('Handed [Payment amount as cents or decimal] to Theo.');
  });
  it('one handed on before the standup window is not said', () => {
    const day = teamToday({ ...base, items: [{ ...handed, updatedAt: at(0) - 86_400_000, wrote: { status: { ts: at(0) - 86_400_000 } } }] as never, products: [{ slug: 'api', name: 'Payments API' }] as never, cards: [] });
    expect(postsOf(day.people, { mates: true, live: true }).find((p) => p.key === 'me')).toBeUndefined();
  });
});
