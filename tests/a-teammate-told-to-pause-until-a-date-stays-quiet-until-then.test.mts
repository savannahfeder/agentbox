// A TEAMMATE TOLD TO PAUSE UNTIL A DATE STAYS QUIET UNTIL THEN.
//
// On 2026-10-28 the person told the Growth marketer "rejected, no more
// suggestions for a week". It had no way to pause until a date, so it rewrote
// the text of both its duties to start "PAUSED UNTIL WED 4 NOVEMBER 2026" and
// kept being woken three times a day to read that and stop. Now a teammate can
// save `pausedUntil` (a date): its duties and rounds do not wake it before that
// day, and your own words still reach it.
import { describe, it, expect } from 'vitest';
import { planWakes, foldTeammates, DEFAULT_LIMIT } from '../shared/teammates.mjs';

const at = (d, h) => new Date(2026, 10, d, h, 0).getTime();
const base = { id: 't-growth', name: 'Growth marketer', status: 'active', paused: false, served: '', limit: DEFAULT_LIMIT, works: null, product: 'kestrel', memory: [] };
const POST = { id: 'd-post', what: 'Propose the day\'s post', every: 'day', at: ['09:00'] };
const chat = { messages: [], seen: new Set(), into: new Map() };
const runs = (acts) => acts.filter((a) => a.type === 'run');

describe('a teammate paused until a date', () => {
  const t = { ...base, duties: [POST], dutyServed: { 'd-post': '2026-10-28T09:00' }, pausedUntil: '2026-11-04' };

  it('is not woken by its duties the day before', () => {
    expect(runs(planWakes({ teammates: [t], chat, items: [], now: at(3, 10) }))).toHaveLength(0);
  });

  it('wakes on the day it named', () => {
    expect(runs(planWakes({ teammates: [t], chat, items: [], now: at(4, 10) }))).toHaveLength(1);
  });

  it('is not woken by its daily round either', () => {
    const round = { ...base, works: { every: 'day', at: '09:00' }, served: '2026-10-28', pausedUntil: '2026-11-04' };
    expect(runs(planWakes({ teammates: [round], chat, items: [], now: at(3, 10) }))).toHaveLength(0);
  });

  it('still hears you when you write to it', () => {
    const yours = { messages: [{ id: 'm-1', kind: 'msg', from: 'you', to: [t.id], text: 'One post for today after all?', ts: at(2, 9) }], seen: new Set(), into: new Map() };
    expect(runs(planWakes({ teammates: [t], chat: yours, items: [], now: at(2, 10) }))).toHaveLength(1);
  });

  it('keeps a date and refuses anything that is not one', () => {
    const [kept] = foldTeammates([{ id: 't-aaaaaa', ts: 1, patch: { name: 'A', pausedUntil: '2026-11-04' } }]);
    expect(kept.pausedUntil).toBe('2026-11-04');
    const [bad] = foldTeammates([{ id: 't-aaaaaa', ts: 1, patch: { name: 'A', pausedUntil: 'next week' } }]);
    expect(bad.pausedUntil).toBeUndefined();
    const [cleared] = foldTeammates([
      { id: 't-aaaaaa', ts: 1, patch: { name: 'A', pausedUntil: '2026-11-04' } },
      { id: 't-aaaaaa', ts: 2, patch: { pausedUntil: null } },
    ]);
    expect(cleared.pausedUntil ?? null).toBeNull();
  });
});
