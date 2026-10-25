// THE WINDOW'S STATE REQUEST READS THE THREADS ONCE.
//
// What broke (2026-10-19): with the cloud on, every key she pressed lagged.
// A CPU profile of the running app put 20% of the main process in the
// window's state request (`zero:snapshot`), and most of that in
// `Supervisor#status`, which asked the store for every thread in every
// project seven times over, each one read, folded and copied again: stalled,
// scheduled, queued, waiting on a sign-in, waiting on a limit, shipping and
// silent, each with its own `listItems`.
//
// Now one state request reads them once.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';

describe('one state request', () => {
  it('asks the store for its threads once', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'status-once-'));
    let asked = 0;
    const item = (id, extra = {}) => ({ id, product: 'p', title: id, status: 'open', priority: 5, createdAt: 1, updatedAt: 1, wrote: {}, ...extra });
    const store = {
      listItems: () => { asked += 1; return [item('w-1'), item('w-2', { answer: 'go', wrote: { answer: { ts: 2, source: 'founder' } } }), item('w-3', { runAt: Date.now() + 3600_000 })]; },
      listProducts: () => [{ slug: 'p', name: 'P', dir: root }],
      isDue: (i) => !(i.runAt > Date.now()),
    };
    const sup = new Supervisor({ storeRoot: root, home: root, maxConcurrentSessions: 3, authProfiles: ['default'] }, store, root, root, root);
    const out = sup.status();
    expect(asked).toBe(1);
    expect(out.scheduled).toContain('w-3');
  });
});


// The same profile: every state request also walked Codex's session log
// folders for the last usage figure it wrote down.
describe('the Codex usage the corner draws, when nothing has pushed one', () => {
  it('is read off Codex\'s log at most every half minute', async () => {
    const { CodexUsage } = await import('../main/codex-usage.mjs');
    let now = 1_000_000; let reads = 0;
    const u = new CodexUsage({ home: () => '/h', now: () => now, readLog: () => { reads += 1; return null; } });
    u.read(); u.read(); now += 10_000; u.read();
    expect(reads).toBe(1);
    now += 25_000; u.read();
    expect(reads).toBe(2);
  });
});
