// STANDUP COUNTED THE APP'S OWN CAUSE ROW AS YOUR WORK.
//
// A synthetic tester sent two Codex threads; within a minute a row he never
// wrote, "Repository commands cannot start", was in Needs you, and Standup
// listed "The computer cannot start repository commands" as something he was
// working on (2026-11-20, run 3). That row is the one wait_on_cause opens for
// every thread stuck on the same thing (shared/causes.mts). `teamToday` took
// it like any thread of his: Working on while its lead ran, Blocked while it
// waited for him, Finished once closed.
//
// The thread stuck behind it is still his, and still says it is stuck.
import { describe, it, expect } from 'vitest';
import { teamToday, groupsOf } from '../renderer/src/team/today.ts';
import { CAUSE_KIND, CAUSE_LABEL } from '../shared/causes.mts';

const NOW = new Date(2026, 10, 20, 15, 0).getTime();
const AT = new Date(2026, 10, 20, 10, 45).getTime();
const item = (o: Record<string, unknown>) => ({ product: 'payments', status: 'open', labels: ['founder'], updatedAt: AT, createdAt: AT - 60_000, title: o.id, ...o });
const cause = (o: Record<string, unknown>) => item({
  id: 'w-cause', title: 'Repository commands cannot start', kind: CAUSE_KIND, labels: ['founder', CAUSE_LABEL],
  wrote: { kind: { ts: AT, source: 'system' } }, ...o,
});
const stuck = item({ id: 'w-idem', title: 'Idempotency key for appointments', engine: 'codex', status: 'blocked', blockedBy: ['w-cause'] });
const day = (items: Record<string, unknown>[]) => teamToday({
  range: 'today', now: NOW, me: 'p-me', items: items as never, products: [{ slug: 'payments', name: 'Payments API' }] as never,
  cards: [], decisions: [], needs: [], people: [], mates: [], mateOf: () => null,
});
const mine = (items: Record<string, unknown>[]) => {
  const p = day(items).people.find((x) => x.key === 'me');
  return p ? { ...groupsOf(p), finished: p.finished } : { working: [], todo: [], done: [], blocked: [], finished: [] };
};
const ids = (lines: { item?: { id: string } }[]) => lines.map((l) => l.item?.id);

describe('a cause row on Standup', () => {
  it('is not Working on while its lead runs', () => {
    expect(ids(mine([cause({ status: 'claimed' })]).working)).toEqual([]);
  });

  it('is not Blocked while it waits for you', () => {
    expect(ids(mine([cause({ status: 'blocked' })]).blocked)).toEqual([]);
  });

  it('is not Finished once closed', () => {
    const closed = cause({ status: 'done', wrote: { kind: { ts: AT, source: 'system' }, status: { ts: AT, source: 'agent' } } });
    expect(ids(mine([closed]).finished)).toEqual([]);
  });

  it('leaves the thread stuck behind it listed as stuck', () => {
    const g = mine([cause({ status: 'blocked' }), stuck]);
    expect(ids(g.blocked)).toEqual(['w-idem']);
    expect(ids(g.working)).toEqual([]);
  });

  it('a row an agent labelled cause on its own is still its work', () => {
    const own = item({ id: 'w-own', kind: CAUSE_KIND, labels: ['founder', CAUSE_LABEL], wrote: { kind: { ts: AT, source: 'agent' } } });
    expect(ids(mine([own]).working)).toEqual(['w-own']);
  });
});
