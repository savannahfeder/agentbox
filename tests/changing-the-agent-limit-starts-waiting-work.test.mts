// The settings writer saved a number without waking the queue. Exercise the settings writer and real scheduler together;
// replace only worker launch so these tests never start a model.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';
import { setWorkspaceSetting } from '../main/settings.mts';

let dir, supervisor, config, started;
const task = (id, engine = 'codex') => ({
  id, engine, product: 'sample', status: 'open', kind: 'directive',
  labels: ['founder'], priority: 5, createdAt: 1, updatedAt: 1,
});

function setup({ limit = 3, engine = 'codex', running = 3 } = {}) {
  config = {
    home: dir, appDir: dir, storeRoot: dir, authProfiles: ['default'],
    codexBin: '/nonexistent/codex', engineChoice: '2026-09-04',
    maxConcurrentSessions: limit,
  };
  const items = Array.from({ length: 6 }, (_, n) => task(`queued-${n}`, engine));
  supervisor = new Supervisor(config, {
    listItems: () => items, listProducts: () => [], isDue: () => true,
    settleAnswer() {},
  }, dir);
  supervisor._engineFor = item => item?.engine ?? 'claude';
  started = [];
  supervisor.spawnWorker = item => {
    started.push(item.id);
    supervisor.sessions.set(item.id, { itemId: item.id, engine, product: 'sample' });
  };
  for (let n = 0; n < running; n++) {
    const id = `running-${n}`;
    supervisor.sessions.set(id, {
      itemId: id, engine, product: 'sample', child: { kill: vi.fn() },
    });
  }
}

const choose = value => setWorkspaceSetting({ config, supervisor }, { key: 'sessionsAtOnce', value });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-29T12:00:00Z'));
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-limit-'));
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('changing the agent limit starts waiting work', () => {
  it.each(['claude', 'codex'])('raising the limit starts waiting %s work without a poll or restart', async engine => {
    setup({ engine });
    await supervisor.tick();
    expect(started).toEqual([]);
    choose(5);
    await vi.advanceTimersByTimeAsync(1_100);
    expect(started).toEqual(['queued-0', 'queued-1']);
    expect(supervisor._loadFor(engine)).toBe(5);
  });

  it.each([4, 5])('a new explicit limit of %i replaces an inherited limit of one for Codex', async limit => {
    setup({ limit: 1 });
    choose(limit);
    // A normal poll must honour the change too, independently of the wake.
    await supervisor.tick();
    expect(supervisor._loadFor('codex')).toBe(limit);
    expect(started).toHaveLength(limit - 3);
  });

  it('uses the last number after rapid changes and starts each task once', async () => {
    setup();
    choose(4); choose(5); choose(4);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(started).toEqual(['queued-0']);
    expect(supervisor._loadFor('codex')).toBe(4);
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'zero.config.json'))).agentsAtOnce).toBe(4);
  });

  it('lowering an inherited limit takes effect without cancelling running work', async () => {
    setup({ limit: 1 });
    const existing = [...supervisor.sessions.values()];
    choose(2);
    await supervisor.tick();
    expect(started).toEqual([]);
    for (const session of existing) expect(session.child.kill).not.toHaveBeenCalled();
    supervisor.sessions.delete('running-0');
    await supervisor.tick();
    expect(started).toEqual([]);
    supervisor.sessions.delete('running-1');
    await supervisor.tick();
    expect(started).toEqual(['queued-0']);
    expect(supervisor._loadFor('codex')).toBe(2);
  });

  it('changing the limit does not unpause the fleet', async () => {
    setup();
    supervisor.paused = true;
    choose(5);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(started).toEqual([]);
    expect(supervisor.paused).toBe(true);
  });

  it('a failed save leaves the effective limit and queue unchanged', async () => {
    setup({ limit: 1 });
    fs.writeFileSync(path.join(dir, 'zero.config.json'), '{invalid');
    expect(() => choose(5)).toThrow();
    expect(config.maxConcurrentSessions).toBe(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(started).toEqual([]);
  });
});
