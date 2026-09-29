// Scheduling: a work item can carry the moment before which nothing happens to
// it.
//
// A scheduled item RUNS at its time; it is not a reminder.
//
// Pinned here: the gate bites in every place that starts work, a missed moment
// runs late rather than being lost, and a scheduled row never reads as queued.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';

const HOUR = 3_600_000;

function makeSupervisor(items, products = [{ slug: 'p', name: 'P', dir: '/tmp/nowhere' }]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-schedule-'));
  const store = {
    listItems: () => items,
    listProducts: () => products,
    isDue: (i, now = Date.now()) => !i?.runAt || i.runAt <= now,
  };
  const sup = new Supervisor({ storeRoot: root, maxConcurrentSessions: 3 }, store, root);
  sup.spawned = [];
  sup.spawnWorker = (item, opts) => sup.spawned.push({ item, opts });
  return sup;
}

const founderTask = (extra) => ({
  id: 'w-1', product: 'p', status: 'open', kind: 'task', labels: ['founder'],
  title: 'Deploy the landing page', createdAt: 1000, updatedAt: 1000, ...extra,
});

const real = (s) => s.spawned.filter((x) => x.item.kind !== 'drive' && x.item.kind !== 'digest');

describe('a scheduled item waits for its moment', () => {
  it('does not spawn before its time', async () => {
    const sup = makeSupervisor([founderTask({ runAt: Date.now() + HOUR })]);
    await sup.tick();
    expect(real(sup)).toEqual([]);
  });

  it('spawns once the moment has passed', async () => {
    const sup = makeSupervisor([founderTask({ runAt: Date.now() - 1 })]);
    await sup.tick();
    expect(real(sup).map((s) => s.item.id)).toEqual(['w-1']);
  });

  it('an unscheduled item is untouched by any of this', async () => {
    const sup = makeSupervisor([founderTask()]);
    await sup.tick();
    expect(real(sup).map((s) => s.item.id)).toEqual(['w-1']);
  });

  it('runAt 0 means now, not never', async () => {
    const sup = makeSupervisor([founderTask({ runAt: 0 })]);
    await sup.tick();
    expect(real(sup).map((s) => s.item.id)).toEqual(['w-1']);
  });
});

// The whole point of a predicate over a timer.
describe('a missed moment runs late rather than being lost', () => {
  it('spawns on the first tick after the machine wakes, however late', async () => {
    const sup = makeSupervisor([founderTask({ runAt: Date.now() - 4 * HOUR })]);
    await sup.tick();
    expect(real(sup).map((s) => s.item.id)).toEqual(['w-1']);
  });

  it('is still owed after days of downtime, not expired', async () => {
    const sup = makeSupervisor([founderTask({ runAt: Date.now() - 300 * HOUR })]);
    await sup.tick();
    expect(real(sup).map((s) => s.item.id)).toEqual(['w-1']);
  });
});

// Approving something on Friday and having it run Monday at 6am is the point.
describe('an answered item respects its schedule too', () => {
  const answered = (extra) => founderTask({ answer: 'Option 1: ship it', ...extra });

  it('holds the continuation until the moment arrives', async () => {
    const sup = makeSupervisor([answered({ runAt: Date.now() + HOUR })]);
    await sup.tick();
    expect(real(sup)).toEqual([]);
  });

  it('spawns the continuation once it does', async () => {
    const sup = makeSupervisor([answered({ runAt: Date.now() - 1 })]);
    await sup.tick();
    expect(real(sup).map((s) => s.opts?.continuation)).toEqual([true]);
  });
});

// `queued` was named so a row waiting its turn never looks like a row nothing
// will ever touch. A scheduled row is a third thing and says so.
describe('status tells scheduled apart from queued', () => {
  it('a future item is scheduled, not queued', async () => {
    const sup = makeSupervisor([founderTask({ runAt: Date.now() + HOUR })]);
    const status = sup.status();
    expect(status.scheduled).toEqual(['w-1']);
    expect(status.queued).toEqual([]);
  });

  it('a due item is queued, not scheduled', async () => {
    const sup = makeSupervisor([founderTask({ runAt: Date.now() - 1 })]);
    const status = sup.status();
    expect(status.queued).toEqual(['w-1']);
    expect(status.scheduled).toEqual([]);
  });
});
