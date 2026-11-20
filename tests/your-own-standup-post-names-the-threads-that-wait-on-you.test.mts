// YOUR OWN STANDUP POST NAMES THE THREADS THAT WAIT ON YOU (synthetic team rerun, 2026-11-20).
//
// Theo's standup had posts from Lena, Priya and Sam and none from him, though
// he had four threads going. Each had answered and was waiting on him, so each
// was in his Needs you, and his own post left out everything in Needs you. On
// Lena's screen the same threads were in his post, as Working on. Measured on
// the posts the standup draws from the day: your threads that wait on you are
// Working on in your post, as a teammate's waiting threads are in theirs; one
// that has not moved since the last standup is not; and what others ask of you
// still stays out of your own post.
import { describe, it, expect } from 'vitest';
import { teamToday } from '../renderer/src/team/today.ts';
import { DEFAULT_STANDUP, postsOf, sentenceOf, standupWindow, type Part } from '../renderer/src/team/standup.ts';

const NOW = new Date(2026, 10, 20, 11, 0).getTime();
const at = (h: number) => new Date(2026, 10, 20, h, 0).getTime();
const words = (parts: Part[]) => parts.map((p) => (typeof p === 'string' ? p : 'more' in p ? `${p.more} more` : `[${p.title}]`)).join('');
const item = (id: string, title: string, o: Record<string, unknown> = {}) => ({ id, product: 'api', title, status: 'open', labels: [], result: 'Here are two options.', createdAt: at(8), updatedAt: at(10), ...o });
const base = {
  range: 'today' as const, now: NOW, me: 'p-theo', decisions: [], mentions: [], mates: [], mateOf: () => null, cards: [],
  people: [{ id: 'p-theo', name: 'Theo Okafor' }, { id: 'p-sam', name: 'Sam Ortiz' }], products: [{ slug: 'api', name: 'Payments API' }] as never,
  window: standupWindow(at(0), DEFAULT_STANDUP, NOW),
};
const mine = (items: ReturnType<typeof item>[], needs: ReturnType<typeof item>[]) =>
  postsOf(teamToday({ ...base, items: items as never, needs: needs as never }).people, { mates: true, live: true }).find((p) => p.key === 'me');

describe('your threads that wait on you', () => {
  const routes = item('w-1', 'Unvalidated payments API routes', { updatedAt: at(10) });
  const restart = item('w-2', 'Appointments lost on restart', { updatedAt: at(9) });
  it('are what you are working on, newest first', () => {
    expect(words(sentenceOf(mine([routes, restart], [routes, restart])!))).toBe('Working on [Unvalidated payments API routes] and [Appointments lost on restart].');
  });
  it('not one that has not moved since the last standup', () => {
    const old = item('w-3', 'Find fintech companies', { updatedAt: at(0) - 3 * 86_400_000 });
    expect(mine([old], [old])).toBeUndefined();
  });
  it('are not also said as needing you', () => {
    expect(mine([routes], [routes])!.needs).toEqual([]);
  });
});

describe('what someone else asks of you', () => {
  it('stays out of your own post', () => {
    const ask = item('w-9', 'Help with this step', { createdBy: 'p-sam', labels: ['given-task'] });
    expect(mine([ask], [ask])).toBeUndefined();
  });
});
