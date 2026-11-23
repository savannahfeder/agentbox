// 2026-11-16: the phone's Needs you held threads the desktop had in Later.
// An agent that sets a thread to wait on another one writes status blocked and
// `blockedBy`; the desktop reads `blockedBy` and files the thread in Later
// (`waitsInLater`). The copy the Mac sends the phone (shared/phone-snapshot.mts
// ROW_FIELDS) left `blockedBy` out, so the phone saw a plain blocked thread and
// put it in Needs you. Measured on a real thread of that shape (blocked by an
// agent, waiting on an open thread): desktop Later, phone Needs you.
import { describe, it, expect } from 'vitest';
import { threadSnapshot } from '../shared/phone-snapshot.mts';
import { phoneView } from '../renderer/src/phone-rows';
import { belongsInInbox, waitsThatCanEnd, waitsInLater } from '../renderer/src/list-rules.ts';
import { phoneTabs } from '../mobile/src/lib/tabs';

const NOW = Date.parse('2026-11-16T03:00:00Z');
const HOUR = 3_600_000;
const DEV = 'a1b2c3d4e5f6';
const iso = (ms: number) => new Date(ms).toISOString();

const waiting = (over = {}) => ({
  id: 'w-waits', title: 'Ship it missing', status: 'blocked', kind: 'bug', labels: ['founder', 'qa'],
  createdAt: NOW - 2 * HOUR, updatedAt: NOW - HOUR, result: 'Waiting on main being fixed.',
  blockedBy: ['w-main'],
  wrote: {
    title: { ts: NOW - 2 * HOUR, source: 'founder' },
    status: { ts: NOW - HOUR, source: 'agent' },
    result: { ts: NOW - HOUR, source: 'agent' },
    blockedBy: { ts: NOW - HOUR, source: 'agent' },
  },
  ...over,
});
const blocker = (over = {}) => ({
  id: 'w-main', title: 'Main is red', status: 'claimed', kind: 'directive', labels: [],
  createdAt: NOW - 3 * HOUR, updatedAt: NOW - HOUR, ...over,
});

const desktopInbox = (items: ReturnType<typeof waiting>[]) => {
  const byId = new Map(items.map((i) => [i.id, i]));
  return items.filter((i) => belongsInInbox(i, { now: NOW, waitingOn: waitsThatCanEnd(i, byId) })).map((i) => i.id);
};
const desktopLater = (items: ReturnType<typeof waiting>[]) => {
  const byId = new Map(items.map((i) => [i.id, i]));
  return items.filter((i) => waitsInLater(i, waitsThatCanEnd(i, byId))).map((i) => i.id);
};
const phone = (items: object[]) => {
  const rows = {
    projects: [{ device: DEV, project: 'alpha', name: 'Alpha', updated_at: iso(NOW) }],
    threads: items.map((raw) => ({ device: DEV, project: 'alpha', item: (raw as { id: string }).id, updated_at: iso(NOW), snapshot: threadSnapshot(raw as Parameters<typeof threadSnapshot>[0]) })),
    commands: [],
  };
  const tabs = phoneTabs(phoneView(rows, NOW), NOW);
  return { inbox: tabs.inbox.map((r) => r.id), later: tabs.snoozed.map((r) => r.id) };
};

describe('a thread waiting on another thread is where the desktop has it', () => {
  it('the reported thread is in Later on both', () => {
    const items = [waiting(), blocker()];
    expect(desktopInbox(items)).not.toContain('w-waits');
    expect(desktopLater(items)).toContain('w-waits');
    const p = phone(items);
    expect(p.inbox).not.toContain('w-waits');
    expect(p.later).toContain('w-waits');
  });

  it('a wait the person set is in Later on both', () => {
    const items = [waiting({ wrote: { ...waiting().wrote, blockedBy: { ts: NOW - HOUR, source: 'founder' } } }), blocker()];
    expect(desktopLater(items)).toContain('w-waits');
    expect(phone(items).later).toContain('w-waits');
  });

  it('once the thread it waits on is done, it is in Needs you on both', () => {
    const items = [waiting(), blocker({ status: 'done' })];
    expect(desktopInbox(items)).toContain('w-waits');
    expect(phone(items).inbox).toContain('w-waits');
  });

  it('a blocked thread waiting on nothing stays in Needs you on both', () => {
    const items = [waiting({ blockedBy: [] }), blocker()];
    expect(desktopInbox(items)).toContain('w-waits');
    const p = phone(items);
    expect(p.inbox).toContain('w-waits');
    expect(p.later).not.toContain('w-waits');
  });

  it('a wait that came back is in Needs you on both', () => {
    const items = [waiting({ blockedBy: [], waitEnded: { said: 'Main is green again.', at: NOW - 60_000 } }), blocker()];
    expect(desktopInbox(items)).toContain('w-waits');
    expect(phone(items).inbox).toContain('w-waits');
  });
});
