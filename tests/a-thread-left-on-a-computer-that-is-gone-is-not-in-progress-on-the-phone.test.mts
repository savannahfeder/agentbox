// A THREAD LEFT ON A COMPUTER THAT IS GONE IS NOT IN PROGRESS ON THE PHONE (QA m19, 2026-11-15).
//
// An account used with older computers, then paired with a new desktop: the
// phone's In progress showed 16 threads, 14 of them "Queued" on computers that
// had stopped writing days before, while the desktop's own In progress read 0
// or 1. The phone took any one computer's heartbeat as all of them, so the old
// computers' waiting threads read as about to run. Now a thread whose own
// computer is away, while another of yours is online, leaves In progress for
// Needs you and says its computer is offline. One computer away on its own keeps
// the old behaviour: the banner over the inbox already says so.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { phoneView } from '../renderer/src/phone-rows';
import { phoneTabs } from '../mobile/src/lib/tabs';

const NOW = Date.UTC(2026, 10, 15, 18);
const NEW = 'a1b2c3d4e5f6';
const OLD = 'b1b2c3d4e5f6';
const iso = (ms: number) => new Date(ms).toISOString();
const DAY = 24 * 3600_000;

const thread = (device: string, project: string, id: string, extra: Record<string, unknown> = {}, live: unknown = null) => ({
  device, project, item: id, updated_at: iso(NOW - DAY),
  snapshot: {
    v: 3, history: [], ...(live ? { live } : {}), wait: { state: 'queued' },
    item: { id, kind: 'directive', labels: ['founder'], status: 'open', priority: 0, title: id, createdAt: NOW - 3 * DAY, updatedAt: NOW - DAY, ...extra },
  },
});

function tabs({ oldSeen = NOW - DAY, newSeen = NOW - 20_000, cloud = false, live = null as unknown, commands = [] as unknown[] } = {}) {
  const rows = {
    projects: [
      { device: NEW, project: 'site', name: 'Site', updated_at: iso(newSeen) },
      { device: OLD, project: 'todo', name: 'Web Todo', updated_at: iso(oldSeen), cloud },
    ],
    threads: [thread(NEW, 'site', 'w-here'), thread(OLD, 'todo', 'w-old', {}, live)],
    commands,
  };
  return phoneTabs(phoneView(rows as never, NOW), NOW);
}
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe('a waiting thread on a computer that is gone, with another computer online', () => {
  it('is in Needs you, not In progress, and says its computer is off', () => {
    const t = tabs();
    expect(ids(t.progress)).toEqual(['w-here']);
    const row = t.inbox.find((r) => r.id === 'w-old')!;
    expect(row.away).toBe(true);
    expect(row.queued).toBe(false);
  });
  it('counts as gone just past the heartbeat allowance, and not just inside it', () => {
    expect(ids(tabs({ oldSeen: NOW - 91_000 }).progress)).toEqual(['w-here']);
    expect(ids(tabs({ oldSeen: NOW - 89_000 }).progress).sort()).toEqual(['w-here', 'w-old']);
  });
  it('a message sent from the phone to it is flagged too', () => {
    const t = tabs({ commands: [{ id: 'c1', device: OLD, project: 'todo', item: 'w-old', kind: 'reply', payload: { text: 'go' }, created_at: iso(NOW - 60_000), taken_at: null, outcome: null }] });
    expect(ids(t.progress)).toEqual(['w-here']);
    expect(t.inbox.find((r) => r.id === 'w-old')?.away).toBe(true);
  });
});

describe('what stays In progress', () => {
  it('the thread on the computer that is online, still Queued', () => {
    const row = tabs().progress.find((r) => r.id === 'w-here')!;
    expect(row.queued).toBe(true);
    expect(row.away).toBe(false);
  });
  it('every thread when no computer is online: the banner says the computer is off', () => {
    expect(ids(tabs({ newSeen: NOW - DAY }).progress).sort()).toEqual(['w-here', 'w-old']);
  });
  it('a gone computer whose project the cloud carries on', () => {
    expect(ids(tabs({ cloud: true }).progress).sort()).toEqual(['w-here', 'w-old']);
  });
  it('a thread still running there', () => {
    const t = tabs({ live: { at: NOW - 60_000, since: NOW - 120_000 } });
    expect(ids(t.progress).sort()).toEqual(['w-here', 'w-old']);
  });
});

describe('the list row', () => {
  it('says the computer is offline where Queued would be', () => {
    const src = fs.readFileSync(new URL('../mobile/src/app/index.tsx', import.meta.url), 'utf8');
    const row = src.slice(src.indexOf('function ThreadRow'), src.indexOf('function MentionRow'));
    expect(row).toMatch(/row\.away\s*&&[\s\S]*Computer offline/);
  });
});
