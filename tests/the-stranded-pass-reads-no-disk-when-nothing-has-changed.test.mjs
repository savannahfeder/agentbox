// The pass that speaks for threads whose last run died walked every one of
// them on every tick, and for each one listed its sessions folder, stamped the
// newest log and, past 500 of them, read that log in full: the traces it kept
// were capped at 500 files and evicted oldest-first, so with more stranded
// threads than that every entry was gone before the next tick reached it. On
// the founder's Mac on 2026-11-02 the freeze recorder put 348 s of held main
// thread in listProducts under _lastTrace under sayItOnEveryStrandedRow, 13
// times, the longest hold 224.9 s — the day after the 500-file cap was added
// for the same freeze the day before.
//
// Measured here at 900 stranded threads, second pass: 900 whole logs read and
// 1,800 folder reads and stamps before, none of either after. A run whose trace
// has no exit line yet is still watched, because the exit line is written after
// the run is recorded as ended and that is the one thing that can still change.
import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { machineryPath } from '../main/store/home.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { setAppHome, clearAppHome } from './app-home.mjs';

const RAN = (id) => `# A thread\n# ${id} · spawned 2026-08-27T22:25:22.807Z\n\n22:25:29  [Bash] npm test\n22:31:00  == RESULT (ok · 10 out, 30 in) ==\n`;
const CLEAN = (id) => `${RAN(id)}\n# exited (0) 2026-08-27T22:31:01.414Z\n`;
const DEAD = `# A thread\n# w-x · spawned 2026-08-27T20:51:39.445Z\n\nstderr: This directory is untrusted. Trust this folder to continue.\n\n\n# exited (1) 2026-08-27T20:51:40.139Z\n`;

let home, docs, sup, items;
const sessions = (id) => machineryPath(docs, path.join('sessions', id), home);
const logOf = (id, name = '1787863899445.log') => path.join(sessions(id), name);
const onSessions = (spy) => spy.mock.calls.filter(([f]) => String(f).includes(`${path.sep}sessions${path.sep}`)).length;
const logReads = (spy) => spy.mock.calls.filter(([f]) => String(f).endsWith('.log')).length;

const strand = (count, text = CLEAN) => {
  items = Array.from({ length: count }, (_, i) => `w-${String(i).padStart(10, '0')}`)
    .map((id) => ({ id, product: 'agentbox', status: 'open', kind: 'task', labels: ['founder'], title: id, wrote: { body: { ts: 1000, source: 'founder' } } }));
  for (const { id } of items) {
    fs.mkdirSync(sessions(id), { recursive: true });
    fs.writeFileSync(logOf(id), text(id));
    sup._fruitless[`agentbox:${id}`] = { runs: 1, endedAt: 5000 };
  }
};

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'stranded-quiet-home-'));
  docs = fs.mkdtempSync(path.join(os.tmpdir(), 'stranded-quiet-docs-'));
  setAppHome(home);
  const store = {
    listItems: () => items,
    listProducts: () => [{ slug: 'agentbox', name: 'Agentbox', dir: docs }],
    isDue: () => true,
    written: [],
    recordSessionResult(product, id, patch) { this.written.push({ product, id, ...patch }); return { wrote: { result: { ts: Date.now() } } }; },
  };
  sup = new Supervisor({ storeRoot: home, maxConcurrentSessions: 3 }, store, home);
  sup._saveState = () => {};
});
afterEach(() => {
  vi.restoreAllMocks();
  clearAppHome();
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(docs, { recursive: true, force: true });
});

it('reads nothing at all on the second pass, with 900 threads stranded', () => {
  strand(900);
  sup.sayItOnEveryStrandedRow(items);
  const read = vi.spyOn(fs, 'readFileSync');
  const list = vi.spyOn(fs, 'readdirSync');
  const stat = vi.spyOn(fs, 'statSync');
  sup.sayItOnEveryStrandedRow(items);
  expect(logReads(read)).toBe(0);
  expect(onSessions(list)).toBe(0);
  expect(onSessions(stat)).toBe(0);
  expect(sup.store.written).toHaveLength(0);
});

it('reads nothing at all on the second pass at 500, the old cap', () => {
  strand(500);
  sup.sayItOnEveryStrandedRow(items);
  const read = vi.spyOn(fs, 'readFileSync');
  sup.sayItOnEveryStrandedRow(items);
  expect(logReads(read)).toBe(0);
});

it('speaks for a thread whose next run dies, and reads only that one log', () => {
  strand(900);
  sup.sayItOnEveryStrandedRow(items);
  const id = items[700].id;
  fs.writeFileSync(logOf(id, '1787863999999.log'), DEAD);
  sup._fruitless[`agentbox:${id}`] = { runs: 2, endedAt: 9000 };
  const read = vi.spyOn(fs, 'readFileSync');
  sup.sayItOnEveryStrandedRow(items);
  expect(logReads(read)).toBe(1);
  expect(sup.store.written.map((w) => w.id)).toEqual([id]);
});

it('keeps watching a run whose trace has no exit line yet, and speaks when it arrives', () => {
  strand(3, RAN);
  sup.sayItOnEveryStrandedRow(items);
  expect(sup.store.written).toHaveLength(0);
  const id = items[1].id;
  fs.appendFileSync(logOf(id), '\n# exited (1) 2026-08-27T22:31:01.414Z\n');
  const later = new Date(Date.now() + 5000);
  fs.utimesSync(logOf(id), later, later);
  const read = vi.spyOn(fs, 'readFileSync');
  sup.sayItOnEveryStrandedRow(items);
  expect(logReads(read)).toBe(1);
  expect(sup.store.written.map((w) => w.id)).toEqual([id]);
});

it('forgets the trace of a thread it has finished with', () => {
  strand(900);
  sup.sayItOnEveryStrandedRow(items);
  sup.sayItOnEveryStrandedRow(items);
  expect(sup._traces.size).toBe(0);
});

it('a thread that is not open is still left alone', () => {
  strand(4);
  items[3] = { ...items[3], status: 'done' };
  fs.writeFileSync(logOf(items[3].id), DEAD);
  sup.sayItOnEveryStrandedRow(items);
  expect(sup.store.written.map((w) => w.id)).not.toContain(items[3].id);
});
