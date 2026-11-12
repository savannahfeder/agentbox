// A THREAD CLOSED OR MOVED TO LATER ON THE PHONE LEAVES NEEDS YOU AT ONCE.
//
// 2026-11-02 product-loop workday, rechecked on main 2026-11-03: Close this
// task said "Done" and the thread stayed in Needs you (issue 15); Tomorrow from
// More said "Moved to Later" and the thread stayed in In progress (issue 21).
// Until the computer takes the command, the phone draws the row from it, and
// the row took the new status or time without saying the person set it. The
// list rules trust only what the person wrote (`hiddenUntil`, and `done` is her
// archive only when she wrote it), so an agent's-looking done stayed news and
// a time nobody owned hid nothing.
import { describe, it, expect } from 'vitest';
import { phoneView, phoneSlug } from '../renderer/src/phone-rows';
import { phoneTabs } from '../mobile/src/lib/tabs';

const NOW = Date.parse('2026-11-03T20:00:00Z');
const DEV = 'a1b2c3d4e5f6';
const A = phoneSlug(DEV, 'alpha');
const iso = (ms) => new Date(ms).toISOString();
const TOMORROW = NOW + 12 * 3600_000;
const ID = 'w-aaaa000001';

// Hers, and the agent answered and left it open: it waits in Needs you.
const thread = (over = {}) => ({
  device: DEV, project: 'alpha', item: ID, updated_at: iso(NOW - 600_000),
  snapshot: { v: 3, history: [], olderLines: 0, item: {
    id: ID, kind: 'directive', labels: ['founder'], priority: 0, title: 'Show when each limit resets', status: 'open',
    body: 'I need to see when my limits reset.', result: 'Shipped. Each meter ends with its reset time.',
    createdAt: NOW - 3600_000, updatedAt: NOW - 600_000,
    wrote: { body: { ts: NOW - 3600_000, source: 'founder' }, result: { ts: NOW - 600_000, source: 'agent' } }, ...over,
  } },
});
const command = (kind, payload = {}, over = {}) => ({ id: `c-${kind}`, device: DEV, project: 'alpha', item: ID, kind, payload,
  created_at: iso(NOW - 30_000), claimed_at: null, taken_at: null, outcome: null, ...over });
const listsOf = (commands, row = thread()) => {
  const tabs = phoneTabs(phoneView({ projects: [{ device: DEV, project: 'alpha', name: 'Alpha', updated_at: iso(NOW) }], threads: [row], commands }, NOW), NOW);
  return Object.keys(tabs).filter((t) => tabs[t].some((r) => r.id === ID && r.product === A));
};

describe('before the computer takes it', () => {
  it('waits in Needs you with nothing pressed', () => {
    expect(listsOf([])).toEqual(['inbox']);
  });

  it('closed on the phone is in Done and out of Needs you', () => {
    expect(listsOf([command('close')])).toEqual(['done']);
  });

  it('moved to tomorrow on the phone is in Later and nowhere else', () => {
    expect(listsOf([command('snooze', { until: TOMORROW })])).toEqual(['snoozed']);
  });

  it('brought back from Later on the phone is back in Needs you', () => {
    const later = thread({ snoozedUntil: TOMORROW, wrote: { body: { ts: NOW - 3600_000, source: 'founder' }, result: { ts: NOW - 600_000, source: 'agent' }, snoozedUntil: { ts: NOW - 300_000, source: 'founder' } } });
    expect(listsOf([], later)).toEqual(['snoozed']);
    expect(listsOf([command('snooze', { until: 0 })], later)).toEqual(['inbox']);
  });

  it('a close the computer refused leaves it where it was', () => {
    expect(listsOf([command('close', {}, { taken_at: iso(NOW - 10_000), outcome: 'refused: that thread is gone' })])).toEqual(['inbox']);
  });
});
