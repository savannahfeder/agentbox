// 2026-11-03: a thread kept coming back to Needs you minutes after it was put
// in Later (twice in a minute, then reported). Its ledger row had a future
// snoozedUntil written by the person, and an agent had filed a task under it
// 47 hours earlier that still waited for a yes. `threadsOwedAnAnswer` brings
// such a thread back after a day, and the inbox reads it before the Later
// check, so the reminder overrode Later on every snapshot. Measured by feeding
// that row's fields (status, wrote, snoozedUntil, the child's age) to the rule.
import { describe, it, expect } from 'vitest';
import { threadsOwedAnAnswer, PROPOSAL_PATIENCE } from '../renderer/src/list-rules.ts';
import { phoneView } from '../renderer/src/phone-rows';
import { phoneTabs } from '../mobile/src/lib/tabs';

const now = 1_800_000_000_000;
const HOUR = 3_600_000;
const thread = (over = {}) => ({
  id: 'w-thread', status: 'open', kind: 'directive', labels: ['founder'],
  snoozedUntil: now + 11 * HOUR,
  wrote: { status: { source: 'agent', ts: now - 30 * HOUR }, snoozedUntil: { source: 'founder', ts: now - 60_000 } },
  ...over,
});
const task = { id: 'w-task', parent: 'w-thread', status: 'open', kind: 'bug', labels: ['bug'], createdAt: now - 47 * HOUR };
const owed = (t, at = now) => threadsOwedAnAnswer([t, task], at).has('w-thread');

describe('a thread you put in Later stays there while a task under it waits', () => {
  it('the reported thread is not pulled back before its Later ends', () => {
    expect(owed(thread())).toBe(false);
  });

  it('a minute before Later ends it is still away', () => {
    expect(owed(thread({ snoozedUntil: now + 60_000 }))).toBe(false);
  });

  it('comes back once its Later has ended, the task still waiting', () => {
    expect(owed(thread({ snoozedUntil: now }))).toBe(true);
    expect(owed(thread({ snoozedUntil: now - HOUR }))).toBe(true);
  });

  it('a thread you scheduled to run later stays away too', () => {
    expect(owed(thread({ snoozedUntil: 0, runAt: now + HOUR, wrote: { runAt: { source: 'founder', ts: now - 60_000 } } }))).toBe(false);
  });

  it('an agent parking the thread does not hide the reminder', () => {
    expect(owed(thread({ snoozedUntil: 0, runAt: now + HOUR, wrote: { runAt: { source: 'agent', ts: now - 60_000 } } }))).toBe(true);
  });

  it('a thread nobody put away still comes back after a day', () => {
    expect(owed(thread({ snoozedUntil: 0 }))).toBe(true);
    expect(threadsOwedAnAnswer([thread({ snoozedUntil: 0 }), { ...task, createdAt: now - PROPOSAL_PATIENCE }], now).has('w-thread')).toBe(false);
  });
});

describe('on the phone', () => {
  const DEV = 'a1b2c3d4e5f6';
  const iso = (ms) => new Date(ms).toISOString();
  const rows = (items) => ({
    projects: [{ device: DEV, project: 'alpha', name: 'Alpha', updated_at: iso(now) }],
    threads: items.map((item) => ({
      device: DEV, project: 'alpha', item: item.id, updated_at: iso(now),
      snapshot: { v: 3, item: { title: item.id, priority: 0, createdAt: now - 60 * HOUR, updatedAt: now - 20 * HOUR, ...item }, history: [] },
    })),
    commands: [],
  });
  const tabs = (t) => phoneTabs(phoneView(rows([t, task]), now), now);

  it('the thread is in Later, not Needs you', () => {
    const t = tabs(thread());
    expect(t.inbox.map((r) => r.id)).not.toContain('w-thread');
    expect(t.snoozed.map((r) => r.id)).toContain('w-thread');
  });

  it('and back in Needs you once Later has ended', () => {
    expect(tabs(thread({ snoozedUntil: now - HOUR })).inbox.map((r) => r.id)).toContain('w-thread');
  });
});
