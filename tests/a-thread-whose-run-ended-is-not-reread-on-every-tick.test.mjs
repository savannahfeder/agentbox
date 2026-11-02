// Every tick, each thread whose last run ended without moving it re-read the
// project list and its whole newest session log, and found itself by scanning
// every thread. On the founder's Mac on 2026-11-01 the freeze log (the freeze
// watcher's thread) put one 764 s freeze in _lastTrace under
// sayItOnEveryStrandedRow. Counted here by reads, not by a clock.
import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { machineryPath } from '../main/store/home.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { setAppHome, clearAppHome } from './app-home.mjs';

const LIVE = (n) => `# A thread\n# w-x · spawned 2026-08-27T22:25:22.807Z\n\n22:25:29  Working on ${n}.\n22:31:00  == RESULT (ok · 10 out, 30 in) ==\n\n# exited (0) 2026-08-27T22:31:01.414Z\n`;
const DEAD = `# A thread\n# w-x · spawned 2026-08-27T20:51:39.445Z\n\nstderr: This directory is untrusted. Trust this folder to continue.\n\n\n# exited (1) 2026-08-27T20:51:40.139Z\n`;

let home, docs, sup, items, lists;
const ids = Array.from({ length: 50 }, (_, i) => `w-${String(i).padStart(10, 'a')}`);
const logOf = (id) => path.join(machineryPath(docs, path.join('sessions', id), home), '1787863899445.log');

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'stranded-tick-home-'));
  docs = fs.mkdtempSync(path.join(os.tmpdir(), 'stranded-tick-docs-'));
  setAppHome(home);
  items = ids.map((id) => ({ id, product: 'agentbox', status: 'open', kind: 'task', labels: ['founder'], title: id, wrote: { body: { ts: 1000, source: 'founder' } } }));
  lists = 0;
  const store = {
    listItems: () => items,
    listProducts: () => { lists += 1; return [{ slug: 'agentbox', name: 'Agentbox', dir: docs }]; },
    isDue: () => true,
    written: [],
    recordSessionResult(product, id, patch) { this.written.push({ product, id, ...patch }); },
  };
  sup = new Supervisor({ storeRoot: home, maxConcurrentSessions: 3 }, store, home);
  sup._saveState = () => {};
  for (const id of ids) {
    fs.mkdirSync(path.dirname(logOf(id)), { recursive: true });
    fs.writeFileSync(logOf(id), LIVE(id));
    sup._fruitless[`agentbox:${id}`] = { runs: 1, endedAt: 5000 };
  }
});
afterEach(() => { vi.restoreAllMocks(); clearAppHome(); });

const logReads = (spy) => spy.mock.calls.filter(([f]) => String(f).endsWith('.log')).length;

it('reads each log once, and the project list once a pass', () => {
  sup.sayItOnEveryStrandedRow(items);
  const read = vi.spyOn(fs, 'readFileSync');
  lists = 0;
  sup.sayItOnEveryStrandedRow(items);
  expect(logReads(read)).toBe(0);
  expect(lists).toBeLessThanOrEqual(1);
  expect(sup.store.written).toHaveLength(0);
});

it('reads a log again once it changes, and speaks for a run that now shows a silent death', () => {
  sup.sayItOnEveryStrandedRow(items);
  fs.writeFileSync(logOf(ids[7]), DEAD);
  const later = new Date(Date.now() + 5000);
  fs.utimesSync(logOf(ids[7]), later, later);
  const read = vi.spyOn(fs, 'readFileSync');
  sup.sayItOnEveryStrandedRow(items);
  expect(logReads(read)).toBe(1);
  expect(sup.store.written.map((w) => w.id)).toEqual([ids[7]]);
});

it('a thread that is not open is still left alone', () => {
  items[3] = { ...items[3], status: 'done' };
  fs.writeFileSync(logOf(ids[3]), DEAD);
  sup.sayItOnEveryStrandedRow(items);
  expect(sup.store.written.map((w) => w.id)).not.toContain(ids[3]);
});
