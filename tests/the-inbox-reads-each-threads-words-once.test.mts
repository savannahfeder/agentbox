// THE INBOX READS EACH THREAD'S WORDS ONCE, NOT ON EVERY DRAW.
//
// "Scrolling is so slow that it's constantly slowing down" (w-47c0223d60,
// 2026-11-22). Measured in the built app's browser copy on a 3,200-thread
// inbox with one agent writing its progress onto one thread every 400 ms
// (scripts/measure-speed.mjs's store), nobody touching the window: its main
// thread was busy 18-20% of the time. Profiled over 10 s, drawing the app 25
// times worked every thread's words through again each time: shortening its
// title (215 ms), deciding whether its answer asks to close it (152 ms) and
// parsing its options (161 ms), for 3,199 threads whose words had not changed.
//
// A title is kept by its words. What a thread's answer offers and whether its
// reply asks to close it are kept by the thread: a thread that changes is a
// new object, so a kept answer is never one for words it no longer has, and
// one that leaves the inbox takes its answer with it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { shortTitle } from '../shared/thread-title.mts';
import { offerIsLive, optionsFrom } from '../renderer/src/format.ts';
import { belongsInInbox, runsAgainOnItsOwn } from '../renderer/src/list-rules.ts';
import { remembered, rememberedFor } from '../shared/remembered.mts';

afterEach(() => { vi.restoreAllMocks(); });

// Every way the three take a text apart.
function watchText() {
  const calls = [vi.spyOn(String.prototype, 'replace'), vi.spyOn(String.prototype, 'split'), vi.spyOn(RegExp.prototype, 'exec'), vi.spyOn(RegExp.prototype, 'test')];
  return () => calls.reduce((n, s) => n + s.mock.calls.length, 0);
}

const title = 'Hey, can you look at why the checkout page fails for some carts when the coupon is applied?';
const offer = '**Ship the fix?**\n\nThe tests pass.\n\n## Options\n1. Ship it (recommended)\n2. Hold it';
const thread = (extra = {}) => ({
  id: 'w-1', product: 'p', status: 'done', kind: 'task', labels: ['founder'], title, result: offer,
  answer: 'Option 1: Ship it, then close this task',
  wrote: { result: { ts: 1, source: 'agent' }, answer: { ts: 2, source: 'founder' }, status: { ts: 3, source: 'agent' } },
  ...extra,
});

describe('a thread\'s words', () => {
  it('are shortened into a title once', () => {
    const first = shortTitle(title);
    const read = watchText();
    expect(shortTitle(title)).toBe(first);
    expect(read()).toBe(0);
  });

  it('are read for what its answer offers once', () => {
    const t = thread({ status: 'open', answer: undefined, wrote: { result: { ts: 1, source: 'agent' } } });
    const first = [optionsFrom(t), offerIsLive(t), runsAgainOnItsOwn(t)];
    const read = watchText();
    expect([optionsFrom(t), offerIsLive(t), runsAgainOnItsOwn(t)]).toEqual(first);
    expect(read()).toBe(0);
  });

  it('are read for whether her reply closed it once', () => {
    const t = thread();
    const opts = { now: 10, hiddenUntil: 0, asking: false, waitingOn: [], stopped: false, seen: 0 };
    const first = belongsInInbox(t, opts);
    expect(first).toBe(false);
    const tests = vi.spyOn(RegExp.prototype, 'test');
    expect(belongsInInbox(t, opts)).toBe(first);
    const ran = [...tests.mock.instances].map((re) => String((re as RegExp).source));
    tests.mockRestore();
    expect(ran.filter((source) => source.includes('close (?:this|the)'))).toEqual([]);
  });

  it('are read again when the thread changed', () => {
    const asked = thread({ status: 'open', answer: undefined, wrote: { result: { ts: 1, source: 'agent' } } });
    expect(offerIsLive(asked)).toBe(true);
    const answered = { ...asked, answer: 'Option 1: Ship it', wrote: { ...asked.wrote, answer: { ts: 2, source: 'founder' } } };
    expect(offerIsLive(answered)).toBe(false);
    expect(optionsFrom({ ...asked, result: 'No choice here.' })).toBe('body');
  });

  it('come out as before, different words different titles', () => {
    expect(shortTitle(title)).not.toBe(shortTitle('Fix the payments reminder for services'));
    expect(shortTitle(null)).toBe(shortTitle(''));
  });
});

describe('what is kept', () => {
  it('by a thread is worked out once per thread', () => {
    let worked = 0;
    const f = rememberedFor((o: { n: number }) => { worked += 1; return o.n * 2; });
    const a = { n: 1 };
    expect([f(a), f(a), f({ n: 1 })]).toEqual([2, 2, 2]);
    expect(worked).toBe(2);
  });

  it('works each text out once', () => {
    let worked = 0;
    const f = remembered((s: string) => { worked += 1; return s.length; }, 3);
    expect([f('a'), f('bb'), f('a'), f('bb')]).toEqual([1, 2, 1, 2]);
    expect(worked).toBe(2);
  });

  it('holds at most as many as it was told, dropping the oldest', () => {
    let worked = 0;
    const f = remembered((s: string) => { worked += 1; return s; }, 2);
    f('a'); f('b'); f('c');
    worked = 0;
    f('c'); f('b');
    expect(worked).toBe(0);
    f('a');
    expect(worked).toBe(1);
  });
});
