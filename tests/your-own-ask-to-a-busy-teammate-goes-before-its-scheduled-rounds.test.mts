// A thread you write that Auto gives to a busy teammate queues behind that
// teammate's runs (shared/auto-route.mts `routedPatch`), and the queue let out
// the oldest first. On 2026-11-22 the self-improve lead's queue had nine bugs
// the person had filed (w-294e4a6b7a, w-0e21f73f90 and others) behind two
// scheduled look backs, each a run of hours, queued first only because they
// were made first. Your own words now go before the teammate's own rounds,
// oldest first within each.
import { describe, it, expect } from 'vitest';
import { planWakes, teammateLabel, DEFAULT_LIMIT } from '../shared/teammates.mts';

const NOW = new Date(2026, 10, 22, 12, 0).getTime();
const HOUR = 3_600_000;
const t = { id: 't-busy', name: 'Busy lead', status: 'active', paused: false, served: '2026-11-22', limit: DEFAULT_LIMIT, works: null, product: 'kestrel', memory: [] };
const queued = (id, ago, source, extra = []) => ({
  id, product: 'kestrel', title: id, status: 'open', start: 'later', createdAt: NOW - ago * HOUR,
  labels: ['founder', teammateLabel(t.id), ...extra], wrote: { body: { ts: NOW - ago * HOUR, source } },
});
const released = (items) => planWakes({ teammates: [t], chat: { messages: [], seen: new Set() }, items, now: NOW })
  .filter((a) => a.type === 'release').map((a) => a.item);

describe('your own ask to a busy teammate goes before its scheduled rounds', () => {
  it('a bug you filed is let out before an older scheduled round', () => {
    expect(released([queued('w-round', 90, 'system', ['duty:d-x']), queued('w-yours', 20, 'founder')])).toEqual(['w-yours']);
  });

  it('among your own, the oldest goes first', () => {
    expect(released([queued('w-new', 2, 'founder'), queued('w-old', 30, 'founder'), queued('w-round', 90, 'system', ['duty:d-x'])])).toEqual(['w-old']);
  });

  it('with none of yours waiting, the oldest of the rest goes first', () => {
    expect(released([queued('w-later', 10, 'system', ['duty:d-x']), queued('w-first', 50, 'system', ['duty:d-y'])])).toEqual(['w-first']);
  });

  it('a hand-off from another teammate is not your words and waits its turn', () => {
    expect(released([queued('w-pass', 90, 'agent'), queued('w-yours', 5, 'founder')])).toEqual(['w-yours']);
  });
});
